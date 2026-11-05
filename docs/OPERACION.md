# Papelito — publicación, verificación y recuperación

Este documento describe cómo llega el código a producción y qué hacer cuando una publicación falla. Los cambios de configuración externa (GitHub, Cloudflare, Neon) los realiza quien administra esos servicios; el repositorio solo versiona los workflows y scripts.

## Flujo de publicación

| Workflow | Disparador | Qué hace | Secretos |
| --- | --- | --- | --- |
| `CI` (`.github/workflows/ci.yml`) | PR hacia `main`, push a `main`, ejecución manual | Job `verify` (workflow reutilizable `verify.yml`) y, solo en `main`, job `deploy-web` | `verify`: ninguno. `deploy-web`: `CLOUDFLARE_API_TOKEN` únicamente en los pasos de publicación y reversión |
| `Cloudflare scheduled jobs` (`cloudflare-jobs.yml`) | Solo manual, solo `main` | El mismo `verify` y luego publica el Worker de cron pausado o activo | Token solo en el paso de publicación |

- `deploy-web` declara `needs: verify`: si cualquier prueba o compilación falla, no se publica. Una ejecución manual también pasa por `verify` para el mismo commit.
- Los PR nunca llegan a `deploy-web`, por lo que no reciben el token. `verify` no recibe secretos (`secrets: inherit` está prohibido).
- El job usa el environment `production`. Mientras el token siga siendo un secreto del repositorio, cualquier rama puede escribir un workflow que lo lea: por eso el token debe moverse al environment `production` restringido a `main` (acción externa, ver la entrega a Codex en el PR).
- `npm ci` corre sin el token: los scripts de instalación de dependencias no pueden leerlo.
- Las acciones de GitHub están fijadas por SHA de commit verificado (`git ls-remote` + `git cat-file -t` = `commit`). Dependabot propone actualizaciones semanales de npm y de las acciones.
- Se retiraron `cloudflare-production.yml` (publicaba sin esperar CI) y `cloudflare-staging.yml` (publicaba el Worker de producción `papelitocr` desde la rama `codex/cloudflare-migration` sin pruebas y con otro origen). La rama sigue existiendo en GitHub y conserva su copia del workflow: hay que borrarla o restringir el secreto.

### Checks que debe exigir la protección de `main`

Con workflows reutilizables, GitHub nombra el check como `<job que llama> / <job llamado>`:

- `verify / Pruebas y compilaciones` (obligatorio).

`Publicar producción` no debe ser obligatorio: solo corre después de fusionar.

### Qué verifica `verify`

Tipos, lint, pruebas de algoritmo, backend, conexión, PWA, recorrido, social, funciones seleccionadas, ciclo de vida, endurecimiento y concurrencia (PostgreSQL real temporal); compilación de Next y de Workers; `wrangler deploy --dry-run` del Worker web y del scheduler (pausado y activo); el bundle servido por workerd (`npm run test:workerd`, incluido el transporte push) y 63 casos de navegador sobre `next start` y otros 63 sobre workerd. El detalle y los límites de cada suite están en `docs/PRUEBAS.md`.

`test:workerd` levanta el bundle real de Workers con `wrangler dev` en modo local y comprueba rutas, cabeceras y estados de falla. No contacta Cloudflare, Neon ni Neon Auth: los escenarios usan configuración vacía o direcciones de loopback inalcanzables. No reemplaza la verificación posterior en producción.

## Verificación posterior

`scripts/smoke-check.mjs` comprueba estado, tipo de contenido, cabeceras y texto esperado por ruta. No exige 200 en todo:

| Ruta | Esperado |
| --- | --- |
| `/` | 200 HTML en español; `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` y `Content-Security-Policy-Report-Only` |
| `/?mode=demo` | 200 HTML |
| `/unirse/<token inválido aleatorio>` | 200 con «Invitación no disponible» y `no-store` |
| `/ayuda`, `/privacidad`, `/terminos` | 200 HTML sin la página de error por defecto en inglés |
| Ruta inexistente | 404 |
| `/api/auth/get-session` sin sesión | 200 en producción, 503 sin servicios configurados; `no-store` |
| `/api/wishes/<uuid>/image` sin sesión | 401 con `no-store` |
| `/api/version` | 200 JSON con la versión; `no-store`. Con `--expect-version` debe coincidir con el commit publicado |
| `/sw.js`, `/manifest.webmanifest` | 200 |

### Veredictos

| Veredicto | Código | Significado | Acción |
| --- | --- | --- | --- |
| `ok` | 0 | Todo coincide | Ninguna |
| `defective` | 1 | La versión nueva responde, pero una ruta tiene estado, cabecera o contenido incorrecto. Es determinista | Revertir |
| `transient` | 2 | Errores de red, tiempos de espera o errores del borde (408, 429, 502, 504, 52x, 530) persistentes tras tres intentos con espera creciente | No revertir automáticamente; repetir la verificación y revisar el estado de Cloudflare/Neon |
| `stale` | 3 | El sitio siguió respondiendo otra versión tras esperar | Revisar la publicación; no revertir a ciegas |

Un 500 de la propia aplicación cuenta como `defective`.

### Reversión

Antes de publicar, `deploy-web` registra la versión con más tráfico (`wrangler deployments status --json`, procesada por `scripts/active-version.mjs`). Si la verificación falla, el resumen del job muestra el veredicto y el comando exacto:

```bash
npx wrangler rollback <version-id> --name papelitocr --message "Rollback after failed checks for <sha>" -y
```

La reversión automática existe pero está desactivada. Solo se ejecuta si la variable del repositorio `PAPELITO_AUTO_ROLLBACK` vale `true`, el veredicto es `defective` y se conoce la versión anterior. Activarla requiere haber probado antes una reversión manual con esa misma cuenta.

La reversión de código no deshace migraciones de base de datos: cada migración documenta su compatibilidad hacia atrás en `docs/MIGRACIONES.md`.

## Versiones y códigos de soporte

- Cada compilación lleva `PAPELITO_BUILD_ID` (el SHA del commit en CI). `/api/version` lo informa sin caché. La app lo compara al volver a la pestaña, al recuperar conexión y cuando falla una operación: si hay una versión nueva, ofrece recargar. Nunca recarga sola y avisa antes de descartar texto escrito. Una operación incierta nunca se reintenta automáticamente.
- Las páginas de error muestran un **código de soporte** (el `digest` de Next). `src/instrumentation.ts` lo registra como evento `request_error` junto con el método, el patrón de ruta y la ruta sin identificadores. Para investigar un reporte, buscar ese código en los registros del Worker `papelitocr`.
- Los registros propios son JSON con `event` y campos saneados (`src/lib/observability/log.ts`): sin cookies, tokens, correos, nombres, mensajes, SQL ni parámetros.

## Tareas programadas (`papelitocr-jobs`)

| Horario (UTC) | Tarea |
| --- | --- |
| `0 6 * * *` | Retención: borra los grupos cerrados hace 12 meses (medianoche de Costa Rica) |
| `0 * * * *` | Recordatorios push. Fuera de 09:00–17:59 de Costa Rica termina sin abrir conexión a Neon |

Límites de Workers Free (documentación oficial de Cloudflare, revisada el 2 de noviembre de 2026): 50 subpeticiones externas y 10 ms de CPU por invocación; 15 minutos de tiempo de reloj para cron; 5 cron por cuenta. Cada push es una subpetición y la base usa una conexión WebSocket.

- Cada ejecución envía como máximo `PUSH_MAX_SENDS_PER_RUN` avisos (15 por defecto, máximo 45; variable opcional del Worker). Lo que no cabe queda sin reclamar y sale en la siguiente hora del mismo día de Costa Rica. `notification_deliveries` garantiza un aviso por dispositivo y recordatorio. Si la ejecución se interrumpe a mitad, un aviso puede repetirse una vez.
- Las personas sin consentimiento vigente no ocupan el lote. Quien todavía no recibió el recordatorio va antes que un dispositivo que falló.
- Cada ejecución registra `{"job":"push-reminders","delivered","failed","pending"}`. Si `pending` es `true` en la última ejecución del día (17:00), hubo más avisos que capacidad: revisar el tope.
- **Ajuste:** en las métricas del Worker, revisar el tiempo de CPU y los errores `exceededCpu` o `exceededResources` de los primeros días con recordatorios. Si la CPU queda holgada, se puede subir el tope; si aparecen esos errores, bajarlo.

## CSP en modo reporte

`Content-Security-Policy-Report-Only` no bloquea nada: el navegador informa a `/api/csp-report`, que registra eventos `csp_violation` con la directiva, el tipo u origen del recurso y la ruta sin identificadores (como máximo 10 por petición). Las pruebas de navegador fallan ante cualquier informe, así que en uso normal no debería haber ninguno. Antes de aplicar la política, revisar estos eventos durante una o dos semanas (ver `docs/PROPUESTAS.md`).

## Alias de Pages

`cloudflare/pages-alias/dist/_worker.js` reenvía `papelitocr.pages.dev` al Worker `papelitocr` mediante un service binding. No se publica en cada cambio: el binding usa la versión activa del Worker. Solo se vuelve a publicar si cambia el alias, y hace falta un token con permiso de Pages (ver `CLOUDFLARE_PAGES.md`). El cambio de esta entrega en ese archivo solo le da nombre a la exportación (aviso de lint); su comportamiento es idéntico y no requiere publicarlo.

