# Dirección corta en Cloudflare Pages

**Dirección pública:** https://papelitocr.pages.dev

Papelito necesita un Worker para SSR, rutas API, autenticación y conexión a Neon. El proyecto Pages **papelitocr** ofrece una dirección corta, como la de ParqueoEV, mediante cloudflare/pages-alias/dist/_worker.js. Esa función usa el service binding **PAPELITO_WEB** para reenviar cada petición al Worker **papelitocr**. El Worker y sus assets se despliegan en cada cambio de main mediante cloudflare-production.yml. Pages no requiere un nuevo despliegue por cada cambio del Worker: el binding llama a su versión activa.

El proyecto Pages fue creado y su despliegue inicial se realizó con la API de Cloudflare. cloudflare/pages-alias/wrangler.jsonc conserva la configuración del alias para futuras modificaciones. La automatización de Pages se retiró porque el token actual de GitHub Actions solo permite desplegar Workers y Cloudflare rechazó la operación Pages con el código 10000. Si se modifica la función del alias, se debe desplegar de nuevo con credenciales que tengan Pages Edit; la actualización normal de la aplicación no lo requiere.

Se comprobó la portada, el CSS y /api/auth/get-session desde Pages. Neon Auth permite el nuevo origen. Falta una prueba autenticada de Google, correo y passkeys con un usuario real, además de creación, sorteo, fotos y eliminación desde un teléfono. Una passkey del origen anterior debe registrarse de nuevo en papelitocr.pages.dev. Las suscripciones Web Push del origen anterior también deben renovarse.

**Corte realizado el 2 de noviembre de 2026:** el titular desactivó el proyecto de Netlify y se comprobó que https://papelitocr.netlify.app devuelve HTTP 404. Se activaron y verificaron por API los cron del Worker privado **papelitocr-jobs**: retención a las 06:00 UTC (medianoche de Costa Rica) y recordatorios cada hora. La web pública y la API de sesión de Pages responden HTTP 200. La primera ejecución real de los cron y la prueba autenticada completa siguen pendientes de comprobar. La dirección técnica https://papelitocr.papelitocr.workers.dev permanece disponible como respaldo.
