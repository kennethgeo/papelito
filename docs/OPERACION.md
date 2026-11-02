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

Tipos, lint, pruebas de algoritmo, backend, conexión, PWA, recorrido, social, funciones seleccionadas, ciclo de vida y endurecimiento; compilación de Next y de Workers; `wrangler deploy --dry-run` del Worker web y del scheduler (pausado y activo); el bundle servido por workerd (`npm run test:workerd`) y 18 recorridos de navegador sobre `next start`.

`test:workerd` levanta el bundle real de Workers con `wrangler dev` en modo local y comprueba rutas, cabeceras y estados de falla. No contacta Cloudflare, Neon ni Neon Auth: los escenarios usan configuración vacía o direcciones de loopback inalcanzables. No reemplaza la verificación posterior en producción.

## Verificación posterior

`scripts/smoke-check.mjs` comprueba estado, tipo de contenido, cabeceras y texto esperado por ruta. No exige 200 en todo:

| Ruta | Esperado |
| --- | --- |
| `/` | 200 HTML en español, cabeceras de seguridad |
| `/?mode=demo` | 200 HTML |
| `/unirse/<token inválido aleatorio>` | 200 con «Invitación no disponible» y `no-store` |
| `/ayuda`, `/privacidad`, `/terminos` | 200 HTML sin la página de error por defecto en inglés |
| Ruta inexistente | 404 |
| `/api/auth/get-session` sin sesión | 200 en producción, 503 sin servicios configurados; `no-store` |
| `/api/wishes/<uuid>/image` sin sesión | 401 con `no-store` |
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
