# Papelito — preparación del piloto festivo

## Ampliación social — 18 de octubre de 2026

Se incorporan conversaciones anónimas bidireccionales, gustos opcionales, QR local, repetición de ediciones con historial privado y recordatorios Web Push optativos. La instalación tiene un botón visible tanto en el panel como en la entrada pública, además de la guía de Mi cuenta. Se mantienen la paleta, tipografía y forma de papel aprobadas.

Comprobaciones de esta ampliación: `build`, `type-check`, `lint`, suites anteriores, `test:social`, 12 pruebas de navegador (1280/390/320 px), migración aditiva verificada en PostgreSQL y recorrido real con cuatro cuentas Neon. El recorrido remoto terminó en 1,3 minutos: guardó gustos, mostró solo los del destinatario correcto, intercambió mensajes anónimos entre sesiones independientes, generó QR y creó una edición vinculada. La rama `br-noisy-hat-b4g607bg` y las cuentas se eliminaron al terminar. La prueba SQL en producción usa rollback y no deja filas residuales. Las dependencias de producción reportaron cero vulnerabilidades al comprobarlas.

Web Push tiene pruebas del cifrado, las restricciones de destino, deduplicación, suscripciones vencidas, consentimiento y horario de Costa Rica con transporte simulado. **Eso no demuestra recepción física en Android/iPhone**: cada persona debe activar el permiso en su dispositivo y puede pulsar «Enviar aviso de prueba». El piloto físico sigue a cargo del titular. No se solicitaron ni se aceptaron permisos de notificación del navegador del titular durante la implementación.

El secreto VAPID se deriva mediante HKDF del secreto existente de invitaciones con un contexto separado; también admite pareja VAPID independiente. No se añadieron secretos al repositorio ni fue necesario contratar servicios. Rotar el secreto de invitaciones requiere prever la renovación de suscripciones push si se usa esa derivación. La función programada de Netlify no ofrece invocación HTTP pública. Las notificaciones no muestran nombres, asignaciones ni contenido de mensajes. Los textos de privacidad ahora describen estas funciones optativas, sin reabrir el trabajo jurídico pospuesto.

La lista de las 60 recomendaciones y su estado se conserva en [PENDIENTES_PRODUCTO.md](PENDIENTES_PRODUCTO.md).

El titular realizará el piloto con personas reales. Esta entrega cubre creación, coherencia visual, organización, deseos, rendimiento, PWA y comprobación técnica. Se posponen cambios legales, dominio y remitente propio.

## Dirección visual

- Ciruela `#46245D`: texto y acciones; violeta `#7043A2`: acentos; papel amarillo `#F7D85B`: notas y confirmaciones; lila `#EDE5F5`: base; blanco papel `#FFFEFC`: contenido; verde `#D8E5C5`: Navidad y estados positivos.
- Bricolage Grotesque para títulos y Source Sans 3 para lectura. Se conserva la identidad aprobada de Papelito.
- Configuración alineada a la izquierda en una hoja, con una invitación ilustrada como vista previa. En teléfonos, una sola columna. El detalle del grupo muestra primero la siguiente acción útil y después su lista de personas.
- El gesto distintivo es la invitación de papel; se evitan tarjetas repetidas sin jerarquía, decoraciones en cada bloque y nuevos sistemas visuales para cada pantalla.

## Alcance y aceptación

1. Dos pasos de creación, fechas calculadas en Costa Rica, tema automático por fecha del evento y opción manual. Validación que conserva entradas.
2. Formularios, deseos, cuenta y detalle con controles legibles, foco visible, objetivos táctiles de 44 px y diseño comprobado a 320/390 px.
3. Estado de preparación del grupo, invitación por enlace/WhatsApp y mensajes útiles para cada estado. Compartir no envía mensajes automáticamente.
4. Deseos rápidos, opciones adicionales desplegables, selección por intercambio, estados de guardado y confirmación antes de borrar.
5. Lecturas agrupadas y actualización al volver a la app o recuperar conexión, sin consultas periódicas. Guía de instalación y estados de conexión/actualización sin cachear información privada.
6. Recorrido repetible con identidades sintéticas y aislamiento explícito; pruebas de invitación vencida, validación, secreto del sorteo, permisos y reconexión. El piloto humano y las pruebas físicas quedan a cargo del titular.

## Resultado de implementación

- Creación en configuración y revisión; fechas sugeridas por el calendario de Costa Rica, validación de fechas reales y tema manual persistente. Vista previa ilustrada para cada ocasión.
- Detalle del grupo con personas aprobadas, solicitudes pendientes y pistas faltantes. Confirmación del sorteo, motivo para repetirlo, restricciones, renovación confirmada de invitaciones y acceso a los controles de cierre/transferencia existentes.
- Compartir abre el selector del dispositivo, copia con confirmación real o prepara un enlace de WhatsApp. No se envían mensajes automáticamente. Los enlaces de demo se identifican como ejemplos.
- Lista personal con alta rápida, campos opcionales, edición, selección por intercambio y confirmación antes de borrar. Las selecciones y las marcas de compra muestran su guardado y evitan dobles envíos.
- Una acción agrupa consentimiento, intercambios, deseos y detalle; las lecturas independientes se ejecutan en paralelo en el servidor. La autorización sigue comprobándose en el servidor para cada operación. Se ignoran respuestas de lecturas superadas por otras más recientes.
- Actualización al recuperar conexión o volver a la app, con límite de 30 segundos al cambiar de foco, sin sondeo periódico. Actualización manual en grupo y cuenta. Los borradores en pantalla se conservan ante errores de red; no se prometen como guardados hasta confirmar el servidor.
- Guía de instalación para Android/iPhone, captura del ofrecimiento nativo de instalación y aviso antes de activar una actualización de la PWA. Solo se precargan recursos públicos; no se cachean HTML de cuenta, API, invitaciones, deseos ni asignaciones.
- La cuenta conserva sus controles anteriores y los documentos existentes. No se modificó la versión legal, el dominio ni la configuración de correos de producción.

## Comprobación técnica

| Comando | Resultado local |
| --- | --- |
| `npm run build` | Compilación de producción y 16 páginas generadas correctamente. En Windows requirió ejecución fuera del aislamiento por un EPERM de `.next`. |
| `npm run type-check` / `npm run lint` | Sin errores. |
| `npm run test:draw` | 8 grupos de comprobaciones del algoritmo. |
| `npm run test:backend` | 12 grupos de integración PostgreSQL y controles de acceso existentes. |
| `npm run test:lifecycle` | Cierre, transferencia, baja, reintentos y retención. |
| `npm run test:ux` | Calendario real, años futuros, cambio de año y hora de Costa Rica; errores de red sin reintentos automáticos de mutaciones. |
| `npm run test:journey` | Cuatro participantes, más pendiente y externo, con repositorios reales y PostgreSQL aislado (PGlite): aprobación, enlace revocado/vencido, selección de deseos, asignación privada, compra privada y cierre. No sustituye una prueba de Neon Auth. |
| `npm run test:pwa` | Solo recursos públicos; API/auth/invitaciones excluidas; navegación privada nunca almacenada; activación de actualización explícita. |
| `npm run test:e2e` | **9 pruebas aprobadas** en Chromium, escritorio 1280 px y teléfonos emulados de 390 y 320 px. Creación, validación, persistencia de demo, edición, selección, borrado confirmado, guía de instalación y conexión interrumpida. |
| `npm run test:neon` | Conexión real, esquema 12/12, CRUD y rollback: **0 filas residuales**. No prueba OAuth. |
| `npm run test:neon:e2e -- --sanitized-clone` | **1 recorrido real aprobado en 57,4 s**, con cuatro sesiones independientes, navegador móvil y Neon Auth/Postgres. Rama y cuentas eliminadas al terminar. |
| `npm audit --omit=dev` | Sin vulnerabilidades reportadas en dependencias de producción al comprobar esta entrega. |

CI ejecuta las comprobaciones locales sin secretos y guarda evidencia de navegador si hay fallos. Las pruebas de interfaz usan un puerto separado, servicios externos deshabilitados y contextos de navegador aislados. El localhost del titular permanece en 3040.

### Recorrido remoto completado — 18 de octubre de 2026

`npm run test:neon:e2e -- --sanitized-clone` crea una rama nueva `codex-e2e-*` del proyecto exclusivo de Papelito. Antes de abrir la app, elimina las cuentas copiadas mediante la API de Auth limitada a esa rama, vacía explícitamente las 12 tablas de la aplicación y verifica cero filas en cada una y cero cuentas, sesiones e identidades Auth copiadas. Después crea cuatro identidades ficticias sin enviar correos y registros de consentimiento sintéticos, exclusivamente para la prueba.

Se comprobaron en un navegador móvil de 390 px: ingreso real con correo/contraseña, creación en dos pasos, enlace preparado para WhatsApp (sin enviar mensaje), ingreso pendiente, aprobación, deseos personales seleccionados por grupo, sorteo, cuatro destinatarios únicos sin autorregalos, revelación, marcas de compra y desconexión/reconexión conservando el borrador. La privacidad de deseos y marcas también está cubierta por el recorrido de repositorios de cuatro participantes, pendiente y externo. Google OAuth conserva la configuración verificada anteriormente; no se hizo una nueva autorización humana de Google en esta entrega.

Salida final:

```text
PASS copia temporal vaciada: cero cuentas y datos personales antes de iniciar la app.
PASS cuatro identidades ficticias creadas; sin correos ni cuentas reales.
PASS navegador + Neon: 4 cuentas reales aisladas, creación/adhesión/aprobación/pistas/sorteo/revelación y reconexión sin perder borrador.
1 passed (57.4s)
PASS rama temporal y sus cuentas/datos eliminados: br-dawn-night-b4g47m8f
```

El preparador se detiene si no recibe `--sanitized-clone`. Rechaza la rama y el endpoint de producción, valida nombre/proyecto/padre de la rama, tiene caducidad de dos horas y limpieza final incluso al fallar. No carga las variables locales de producción ni deja credenciales en el repositorio. Los servicios y permisos de producción no se modifican.

Los intentos iniciales con ramas schema-only fallaron al provisionar Auth (`permission denied for database neondb`), incluso después del `CREATE` que el titular autorizó únicamente para una rama descartable. Se eliminaron esas ramas. La ruta final conserva la configuración de Auth de una copia normal y la sanea antes de usarla; **no necesita GRANT ni reprovisionar Auth**. Se retiró la ruta experimental fallida del preparador. La prueba remota también detectó dos botones con el mismo nombre en la pantalla vacía: el botón central ahora dice «Crear mi primer intercambio».

La versión principal `bbd1d49` pasó CI y quedó publicada en Netlify (deploy `6ad44a29d535565a4ebf3da3`). Se comprobaron las páginas públicas con HTTP 200, la asignación sin sesión con 401 y la función programada sin acceso público con 403. El cierre de esta comprobación y la corrección del texto se sincronizan en un commit posterior.

## Piloto del titular

El titular comprobará con su gente la instalación física en Android/iPhone, las invitaciones desde WhatsApp y el uso en las festividades. La emulación de teléfonos no certifica esos dispositivos físicos. El alcance legal y el remitente propio continúan pospuestos por instrucción del titular.
