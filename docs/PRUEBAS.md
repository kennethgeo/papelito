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
| `npm run test:dashboard` | Datos del tablero: autoridad del organizador actual sobre las solicitudes, estado propio del papelito (membresía pendiente, rechazada y aprobada, sorteo repetido, grupo cerrado), nada de destinatarios, misma cantidad de consultas con 6 y 20 grupos; regla de siguiente acción con fechas de Costa Rica | PGlite |
| `npm run test:social` | Mensajes anónimos, gustos, ediciones, Web Push con transporte simulado, recordatorios por horario de Costa Rica, tope por ejecución, continuidad, orden ante fallas, consentimiento y firma VAPID reutilizada | PGlite |
| `npm run test:message-notifications` | Acción de mensaje → repositorio real → aviso al destinatario correcto de pregunta y respuesta, sin nombres ni contenido privado; terceros bloqueados y mensaje guardado ante falla de envío. Proveedor push simulado, sin envíos reales | PGlite |
| `npm run test:selected` | Encuestas, representación de menores, fotos privadas y su cuota, soporte, passkeys y revocación de accesos, copia cifrada sin conexión, calendario y filtro SSRF | PGlite |
| `npm run test:organization` | Asistencia independiente del sorteo, cupos y espera por orden de llegada, reglas versionadas, permisos, representación, exportación y cascadas; edición de nombres por organizador o adulto responsable, conflictos y asignaciones intactas | PGlite |
| `npm run test:lifecycle` | Cierre, transferencia, eliminación, baja y retención | PGlite |
| `npm run test:hardening` | Revocación de sesiones en el proxy de Auth, estado de sesión desconocido, versiones, participantes, fechas ISO, errores públicos, registros sin datos personales, cupos y validaciones, desafíos de passkeys, origen de passkeys, reautenticación, informe CSP, número de consultas y enlaces personales de personas adultas mayores (quien representa nunca recibe su asignación, la carga de la página no cuenta como apertura, la primera apertura queda visible incluso con un enlace nuevo, fotos solo del destinatario vigente, cambios de tipo antes y después del sorteo, exportación sin el enlace) | PGlite |
| `npm run test:concurrency` | Seis reintentos simultáneos crean un solo intercambio y un solo deseo; la cuota de creación se respeta; dos ingresos compiten por el último lugar y exactamente uno entra, mientras el otro queda en espera | PostgreSQL 16 temporal |
| `npm run build`, `npm run build:vinext` | Compilación de Next y bundle de Workers | — |
| `npm run deploy:vinext -- --dry-run`, `check:cloudflare:jobs` | Configuración de los Workers web y de cron (pausado y activo) | — |
| `npm run test:workerd` | El bundle real en workerd: smoke check sin servicios; base y Neon Auth caídos (sesión desconocida explícita, sin bienvenida ni consentimiento falsos, `/unirse` con aviso de falla, proxy de Auth cerrado con 503, cierre de sesión que limpia cookies); transporte push del código real en workerd contra un destino de loopback inalcanzable | Direcciones inalcanzables |
| `npm run test:e2e`, `npm run test:e2e:workerd` | 20 recorridos de navegador en 1280, 390 y 320 px (60 casos) sobre `next start` y sobre workerd. Incluye aviso inicial de instalación, omisión recordada, instrucciones, teclado y app instalada; el ofrecimiento nativo se simula sin instalar nada. Cada caso falla si el navegador informa una violación de la CSP en modo reporte | Modo demo |

Fuera de CI, con credenciales del titular: `npm run test:neon` (SQL real en Neon con `ROLLBACK`) y `npm run test:neon:e2e -- --sanitized-clone` (rama temporal saneada con cuentas ficticias).

## Lo que estas pruebas no demuestran

- **Servicios reales:** Neon Auth (Google, correo, OTP, revocación con `revokeSession`), Neon en producción y Cloudflare Images solo se ejercitan con simulaciones o direcciones inalcanzables. La revocación en el proveedor se probó contra un servidor simulado con la forma de la API del SDK.
- **Límites de Cloudflare:** workerd local no aplica los límites de CPU ni de subpeticiones. El tope de recordatorios se calculó con los límites oficiales y una medición de CPU en Node; hay que confirmar en las métricas del Worker `papelitocr-jobs` (ver `docs/OPERACION.md`).
- **Cron:** no se ejecutó ninguna tarea programada real.
- **Teléfonos físicos:** el teclado en pantalla, las áreas seguras y la instalación se emularon con Chromium. iPhone, Android y lectores de pantalla requieren la prueba del titular.
- **Navegadores:** solo Chromium. Firefox y Safari pueden informar o ignorar directivas de forma distinta.
- **Servicio gestionado de Better Auth:** la versión que corre Neon Auth no se puede comprobar desde el repositorio (ver `docs/DEPENDENCIAS.md`).
- **Enlace personal con datos reales:** las pruebas de navegador no tienen base de datos. La lógica del enlace se prueba con PGlite, y en el navegador solo el enlace inválido (Next y workerd) y el enlace con la base caída (workerd). Abrir un papelito real desde WhatsApp en el teléfono de una persona mayor, y ver sus fotos, queda para el piloto.
