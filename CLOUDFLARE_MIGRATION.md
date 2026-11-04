# Migración de Papelito a Cloudflare Workers

Estado (2 de noviembre de 2026): corte de alojamiento realizado. La dirección pública es `https://papelitocr.pages.dev`, con Pages Function y service binding hacia el Worker `papelitocr`. El titular desactivó Netlify y se comprobó HTTP 404 en la dirección anterior. Se activaron y verificaron por API los dos horarios de `papelitocr-jobs`: retención `0 6 * * *` (medianoche de Costa Rica) y recordatorios `0 * * * *`. El Worker de cron continúa sin ruta HTTP pública, con conexión a Neon y el mismo par VAPID de la web. Portada y sesión anónima respondieron HTTP 200 después de la activación. Faltan verificar la primera ejecución real de cada cron, una prueba autenticada completa y las métricas reales de CPU e Images. (El binding KV se retiró después de la auditoría; ver más abajo.) Neon PostgreSQL y Neon Auth permanecen en el proyecto exclusivo de Papelito.

La arquitectura y el mantenimiento del alias de Pages se describen en [CLOUDFLARE_PAGES.md](CLOUDFLARE_PAGES.md). La dirección técnica `https://papelitocr.papelitocr.workers.dev` queda disponible como respaldo.

## Plataforma y límite gratuito

El servidor Next.js usa SSR, rutas API, middleware y acciones de servidor. Se empaqueta con `vinext` para **Cloudflare Workers**; Cloudflare Pages estático no sirve para estas rutas. El adaptador todavía es beta. Workers Free limita el tiempo de CPU por petición; una compilación exitosa y una respuesta local no prueban que los flujos autenticados funcionen dentro de ese límite. Antes del corte, medir CPU y errores de peticiones reales en el Worker de prueba, incluidas creación, sorteo, fotos, autenticación, passkeys y eliminación. Si excede el límite gratuito, no afirmar que el traslado completo puede operar gratis: optimizar y repetir la medición o reconsiderar el alojamiento.

Las imágenes nuevas usan el binding `IMAGES` para reducir a WebP y respetan el límite de 128 KiB. Comprobar en el entorno real la compatibilidad, cuotas y costo del binding. Las imágenes JPEG ya guardadas se sirven con su MIME correspondiente. La vista previa automática de URL de tiendas queda desactivada en Workers porque `node:dns.lookup` no está implementado y la protección actual exige DNS comprobado y conexión fijada. Los deseos y las referencias manuales siguen disponibles.

## Preparación

1. Usar una rama de GitHub con permisos de escritura y revisión. Ejecutar `npm ci`, `npm run lint`, `npm run type-check`, `npm run test:lifecycle`, `npm run test:selected`, `npm run test:social`, `npm run build:vinext` y `npm run check:cloudflare:jobs`.
2. Conectar el proyecto a la cuenta Cloudflare correcta. El Worker web se llama `papelitocr`; el Worker privado de cron `papelitocr-jobs`. El segundo no tiene ruta HTTP pública y programa retención a las 06:00 UTC (medianoche en Costa Rica) y recordatorios cada hora.
   La cuenta utiliza el subdominio `papelitocr.workers.dev`. *(Histórico: `cloudflare-staging.yml` y `cloudflare-production.yml` publicaban sin esperar las pruebas y se retiraron.)* Hoy el job `deploy-web` de `.github/workflows/ci.yml` publica el Worker web después de `verify`, solo desde `main`; el flujo manual `.github/workflows/cloudflare-jobs.yml` despliega cron. Ver `docs/OPERACION.md`. El token está guardado exclusivamente como secreto de Actions `CLOUDFLARE_API_TOKEN`; nunca añadirlo al repositorio. El subdominio público del Worker web está habilitado y las vistas previas están desactivadas.
3. Definir como **secrets** en el Worker web `DATABASE_URL` pooled, `NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET` e `INVITATION_TOKEN_SECRET`. Las dos primeras se obtuvieron de la rama de producción de Neon. Las claves de Netlify son de solo escritura y no había copia original disponible; Cloudflare utiliza nuevas claves aleatorias. Las sesiones del dominio anterior no se trasladan. Los tokens de invitación existentes **siguen siendo válidos al presentarse**, porque se comprueban por hash, pero el organizador no puede descifrar y mostrar desde Cloudflare los enlaces anteriores: debe renovarlos cuando necesite compartirlos. La pareja Web Push derivada cambia y hay que volver a suscribirse desde el origen nuevo. Si se usan claves VAPID explícitas, trasladar las mismas `PUSH_VAPID_PUBLIC_KEY` y `PUSH_VAPID_PRIVATE_KEY`. El Worker cron requiere `DATABASE_URL` y el par `PUSH_VAPID_PUBLIC_KEY` / `PUSH_VAPID_PRIVATE_KEY` compartido con la web; si se derivan las claves en vez de configurarlas, debe usar el mismo `INVITATION_TOKEN_SECRET`. No subir `.env.local` ni guardar estos valores en Git. `DATABASE_URL_UNPOOLED` solo se usa para migraciones fuera del Worker.
4. Definir `NEXT_PUBLIC_APP_URL` en la compilación y `PAPELITO_APP_URL` en el Worker con **el mismo origen HTTPS final**; verificar enlaces, correo, passkeys, Web Push y el scope de la PWA. Registrar ese origen exacto como destino de regreso permitido en Neon Auth. El callback Google continúa siendo el del servicio Neon Auth. Un passkey existente registrado en `papelitocr.netlify.app` no funciona en otro dominio; el usuario debe registrarlo de nuevo. Las suscripciones push también deben renovarse en el nuevo origen.
5. Desplegar una URL de prueba con `npm run deploy:vinext`; aplicar los secrets en Cloudflare antes de ensayar flujos con Neon. La ruta demo puede comprobarse sin credenciales. Comprobar cabeceras de seguridad y no-store en `/api/`, `/auth/` y `/unirse/`, y que las fotos privadas no se guarden en caché. Probar teléfonos reales y el flujo de consentimiento de la versión legal vigente. Medir CPU, errores y cuota de Workers e Images.

## Corte y reversión

1. Netlify quedó desactivado el 2 de noviembre de 2026. Los cron de Cloudflare se activaron por API después de comprobar que la dirección de Netlify devolvía HTTP 404. Los horarios coinciden con `cloudflare/scheduler.wrangler.jsonc`. Para desplegar cambios futuros en las tareas, ejecutar el flujo manual `Cloudflare scheduled jobs` en `main` con `activate` marcado. Su modo desmarcado retira los horarios y sirve para detenerlos.
2. La dirección pública es `https://papelitocr.pages.dev`; `NEXT_PUBLIC_APP_URL`, `PAPELITO_APP_URL` y Neon Auth usan ese origen. Comprobar acceso autenticado, creación, eliminación, sorteo, fotos, correo, PWA y recordatorios con un dispositivo real. Las passkeys y las suscripciones Web Push del origen anterior deben registrarse otra vez.
3. Para revertir, detener primero los cron de Cloudflare, restaurar el origen y los destinos de Auth, y después reactivar Netlify y sus cron. Las passkeys siguen ligadas al origen donde se registraron. No borrar datos de Neon ni rotar secretos durante la reversión.

La facturación gratuita depende del tráfico, CPU, transformaciones de imágenes y límites vigentes de Neon y Cloudflare; verificar las métricas reales del proyecto.

## Corrección de carga y PWA (2 de noviembre de 2026)

El piloto autenticado mostró un aviso de cambio sin confirmar al entrar y fallas intermitentes de navegación. Las métricas de Workers registraron 14 excepciones entre las 13:35 y las 14:00 UTC. La revisión encontró un pool WebSocket global: Neon exige crear, usar y cerrar estas conexiones dentro de una sola petición de Workers. Las consultas individuales usan ahora HTTP; las transacciones conservan una conexión propia por operación, cerrada incluso cuando falla la conexión o se revierte la transacción. El pool persistente se mantiene solo en el servidor Node. Se conserva Neon y su esquema.

La lectura inicial tiene un mensaje específico de carga y no muestra una lista vacía como si hubiera confirmado cero intercambios. El Service Worker público v6 devuelve una respuesta de recuperación incluso si Android desalojó la caché offline o Cache Storage falla. No almacena HTML autenticado ni intercepta POST, API, autenticación o invitaciones.

`npm run test:db:workers` comprueba aislamiento entre peticiones concurrentes, consultas HTTP, commit, rollback y cierre tras fallo de conexión con un driver simulado. `test:ux` lo ejecuta también en CI y distingue fallos de lectura y escritura. `test:pwa` verifica caché ausente/inaccesible además de las exclusiones de privacidad. Se habilitan registros de Workers con parámetros de URL redactados para diagnosticar excepciones. Estas pruebas no sustituyen comprobar el ingreso real desde el teléfono después del despliegue.

### Publicación del bundle con Wrangler

`npm run deploy:vinext` usa `scripts/deploy-cloudflare-web.mjs`: lee el Build Output Specification generado por Vinext y convierte su configuración con las utilidades oficiales de Cloudflare. Wrangler publica los módulos ya compilados (`no_bundle`) y los assets; los secrets requeridos siguen almacenados en Cloudflare. No se duplican bindings en otra configuración fuente.

Motivo: `cf@1.0.0-beta.26` impone publicación estricta y aborta si una actualización de observabilidad por API fue la última modificación del Worker. Wrangler estable permite reconciliar esa modificación conocida con la configuración revisada del repositorio. Esto no cambia autenticación, permisos ni el plan gratuito. Antes de publicar: `npm run build:vinext` y `npm run deploy:vinext -- --dry-run`. El script rechaza múltiples Workers, containers y tipos de módulo no revisados; el scheduler conserva su configuración independiente.

Verificación del 2 de noviembre: conversión y dry-run correctos, 185 módulos ESM y 72 archivos estáticos, bundle comprimido de aproximadamente 666 KiB. La corrección de aplicación pasó CI completa, incluidos 18 casos de navegador. La comprobación en el teléfono autenticado sigue siendo necesaria después de actualizar la PWA.

## Cambios posteriores a la auditoría (2 de noviembre de 2026)

Las correcciones de la auditoría del commit `ae706a8` cambian lo siguiente en Cloudflare. El detalle está en `docs/OPERACION.md`.

- **Publicación verificada:** solo se publica código que pasó `verify`, incluido el bundle de Workers en workerd. Después se comprueban rutas, cabeceras y versión publicada, con instrucciones de reversión.
- **Sin KV:** el binding `VINEXT_KV_CACHE` se retiró. Las páginas no escribían en KV; solo `revalidatePath` lo hacía en cada cambio, y todas las mutaciones ya actualizan la vista del cliente. El namespace queda sin uso: borrarlo es una acción externa opcional.
- **Recordatorios acotados:** tope de envíos por ejecución según los límites de Workers Free (50 subpeticiones y 10 ms de CPU por invocación), continuidad en la hora siguiente y ninguna conexión a Neon fuera del horario de envío.
- **CSP en modo reporte y `Permissions-Policy`:** no bloquean funciones; los informes llegan a los registros del Worker.
- **Sesiones:** el proxy de Auth rechaza sesiones revocadas y, si Neon Auth no responde, muestra que no se pudo confirmar la sesión en lugar de la bienvenida.

