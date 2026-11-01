# Dirección corta en Cloudflare Pages

**Dirección pública:** https://papelitocr.pages.dev

Papelito necesita un Worker para SSR, rutas API, autenticación y conexión a Neon. El proyecto Pages **papelitocr** ofrece una dirección corta, como la de ParqueoEV, mediante cloudflare/pages-alias/dist/_worker.js. Esa función usa el service binding **PAPELITO_WEB** para reenviar cada petición al Worker **papelitocr**. El Worker y sus assets se despliegan en cada cambio de main mediante cloudflare-production.yml. Pages no requiere un nuevo despliegue por cada cambio del Worker: el binding llama a su versión activa.

El proyecto Pages fue creado y su despliegue inicial se realizó con la API de Cloudflare. cloudflare/pages-alias/wrangler.jsonc conserva la configuración del alias para futuras modificaciones. La automatización de Pages se retiró porque el token actual de GitHub Actions solo permite desplegar Workers y Cloudflare rechazó la operación Pages con el código 10000. Si se modifica la función del alias, se debe desplegar de nuevo con credenciales que tengan Pages Edit; la actualización normal de la aplicación no lo requiere.

Se comprobó la portada, el CSS y /api/auth/get-session desde Pages. Neon Auth permite el nuevo origen. Falta una prueba autenticada de Google, correo y passkeys con un usuario real, además de creación, sorteo, fotos y eliminación desde un teléfono. Una passkey del origen anterior debe registrarse de nuevo en papelitocr.pages.dev. Las suscripciones Web Push del origen anterior también deben renovarse.

**Pendiente del corte:** Netlify todavía sirve una versión anterior y sus despliegues recientes de main aparecen omitidos. El Worker privado **papelitocr-jobs** está preparado sin horarios. No activar sus cron hasta confirmar que las tareas programadas de Netlify dejaron de ejecutarse; así se evita duplicar recordatorios y limpieza. La dirección técnica https://papelitocr.papelitocr.workers.dev permanece disponible como vía de reversión.
