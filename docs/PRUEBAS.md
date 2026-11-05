# Pruebas y sus límites

Todas las suites de esta tabla corren en `verify` (`.github/workflows/verify.yml`) para cada PR y antes de cada publicación. Requieren Node 24 (`.nvmrc`). Ninguna contacta Cloudflare, Neon, Neon Auth ni servicios push reales, ni escribe datos reales.

| Comando | Qué cubre | Base de datos |
| --- | --- | --- |
| `npm run type-check`, `npm run lint` | Tipos estrictos y ESLint (sin avisos) | — |
| `npm run test:draw` | Algoritmo de sorteo, exclusiones e imposibilidad | — |
| `npm run test:backend` | Repositorios, permisos, invitaciones, sorteo, deseos, privacidad | PGlite |
| `npm run test:ux` | Mensajes de lectura y escritura; incluye `test:db:workers` (conexiones por petición, rollback y cierre con fallas) | Driver simulado |
| `npm run test:pwa` | Service Worker: nada privado en caché, recuperación sin caché | — |
| `npm run test:journey` | Recorrido de cuatro participantes con repositorios reales | PGlite |
| `npm run test:dashboard` | Datos del tablero: autoridad del organizador actual sobre las solicitudes, estado propio del papelito (membresía pendiente, rechazada y aprobada, sorteo repetido, grupo cerrado), nada de destinatarios, misma cantidad de consultas con 6 y 20 grupos; regla de siguiente acción con fechas de Costa Rica; un mismo grupo antes y después del sorteo; quién puede gestionar solicitudes, igual que el servidor en cada estado; último día de inscripción y el siguiente | PGlite |
| `npm run test:social` | Mensajes anónimos, gustos, ediciones, Web Push con transporte simulado, recordatorios por horario de Costa Rica, tope por ejecución, continuidad, orden ante fallas, consentimiento y firma VAPID reutilizada | PGlite |
| `npm run test:selected` | Encuestas, representación de menores, fotos privadas y su cuota, soporte, passkeys y revocación de accesos, copia cifrada sin conexión, calendario y filtro SSRF | PGlite |
| `npm run test:lifecycle` | Cierre, transferencia, eliminación, baja y retención | PGlite |
| `npm run test:hardening` | Revocación de sesiones en el proxy de Auth, estado de sesión desconocido, versiones, participantes, fechas ISO, errores públicos, registros sin datos personales, cupos y validaciones, desafíos de passkeys, origen de passkeys, reautenticación, informe CSP y número de consultas | PGlite |
| `npm run test:concurrency` | Seis reintentos simultáneos crean un solo intercambio y un solo deseo; la carrera por el último cupo deja pasar exactamente una creación | PostgreSQL 16 temporal |
| `npm run build`, `npm run build:vinext` | Compilación de Next y bundle de Workers | — |
| `npm run deploy:vinext -- --dry-run`, `check:cloudflare:jobs` | Configuración de los Workers web y de cron (pausado y activo) | — |
| `npm run test:workerd` | El bundle real en workerd: smoke check sin servicios; base y Neon Auth caídos (sesión desconocida explícita, sin bienvenida ni consentimiento falsos, `/unirse` con aviso de falla, proxy de Auth cerrado con 503, cierre de sesión que limpia cookies); transporte push del código real en workerd contra un destino de loopback inalcanzable | Direcciones inalcanzables |
| `npm run test:e2e`, `npm run test:e2e:workerd` | 21 recorridos de navegador en 1280, 390 y 320 px (63 casos) sobre `next start` y sobre workerd. Cada caso falla si el navegador informa una violación de la CSP en modo reporte | Modo demo |

`npm run test:e2e:session` corre en CI, tras `npm run build`, y usa 390, 320 y 1280 px. Sirve la app con un PostgreSQL temporal local (`scripts/serve-session.mjs`) y personas ficticias, con sesiones reales de la tabla propia de la app, acciones de servidor y escrituras. Cubre aprobar y rechazar, el foco cuando desaparece una fila (incluida la última), el acceso directo desde el tablero y dos sesiones donde una sortea mientras la otra decide. No cubre el inicio de sesión con Neon Auth o Google, ni el bundle de Workers: el controlador de Neon llega a la base por un socket local.

Fuera de CI, con credenciales del titular: `npm run test:neon` (SQL real en Neon con `ROLLBACK`) y `npm run test:neon:e2e -- --sanitized-clone` (rama temporal saneada con cuentas ficticias).

## Lo que estas pruebas no demuestran

- **Servicios reales:** Neon Auth (Google, correo, OTP, revocación con `revokeSession`), Neon en producción y Cloudflare Images solo se ejercitan con simulaciones o direcciones inalcanzables. La revocación en el proveedor se probó contra un servidor simulado con la forma de la API del SDK.
- **Límites de Cloudflare:** workerd local no aplica los límites de CPU ni de subpeticiones. El tope de recordatorios se calculó con los límites oficiales y una medición de CPU en Node; hay que confirmar en las métricas del Worker `papelitocr-jobs` (ver `docs/OPERACION.md`).
- **Cron:** no se ejecutó ninguna tarea programada real.
- **Teléfonos físicos:** el teclado en pantalla, las áreas seguras y la instalación se emularon con Chromium. iPhone, Android y lectores de pantalla requieren la prueba del titular.
- **Navegadores:** solo Chromium. Firefox y Safari pueden informar o ignorar directivas de forma distinta.
- **Servicio gestionado de Better Auth:** la versión que corre Neon Auth no se puede comprobar desde el repositorio (ver `docs/DEPENDENCIAS.md`).
