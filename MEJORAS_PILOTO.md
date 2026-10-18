# Papelito — preparación del piloto festivo

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
| `npm audit --omit=dev` | Sin vulnerabilidades reportadas en dependencias de producción al comprobar esta entrega. |

CI ejecuta las comprobaciones locales sin secretos y guarda evidencia de navegador si hay fallos. Las pruebas de interfaz usan un puerto separado, servicios externos deshabilitados y contextos de navegador aislados. El localhost del titular permanece en 3040.

### Comprobación remota adicional pendiente

Se preparó `scripts/test-neon-journey.mjs` y `tests/neon.spec.ts` para repetir el recorrido de navegador con cuatro cuentas ficticias y Neon real. La rama schema-only copia la estructura de `neon_auth`, pero no habilita su servicio ni conserva el permiso necesario de creación de esquema. La provisión devolvió `permission denied for database neondb`.

La revisión automática rechazó conceder `CREATE` al propietario del esquema. Se comprobó mediante una consulta de solo lectura que ese rol es `neon_auth`. **No se ejecutó ese GRANT ni se cambiaron los permisos de producción.** Todas las ramas temporales creadas se eliminaron y se verificó que solo permanece `production`.

El preparador se detiene antes de crear recursos si falta la autorización explícita `--authorize-neon-auth-create`. Su alcance está limitado al proyecto exclusivo de Papelito, una rama nueva descartable `codex-e2e-*`, base `neondb` y rol `neon_auth`. Tiene guardas contra la rama de producción, caducidad de dos horas y limpieza final. Este recorrido remoto sigue **sin aprobarse** y no debe contarse entre las pruebas exitosas.

## Piloto del titular

El titular comprobará con su gente la instalación física en Android/iPhone, las invitaciones desde WhatsApp y el uso en las festividades. La emulación de teléfonos no certifica esos dispositivos físicos. El alcance legal y el remitente propio continúan pospuestos por instrucción del titular.
