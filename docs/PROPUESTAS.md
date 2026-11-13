# Propuestas y decisiones pendientes

Este documento separa lo que **no** se implementó en las correcciones de la auditoría (commit `ae706a8`) porque depende de una decisión de producto, legal u operativa. Nada de esto está activo. El registro general de ideas sigue en [PENDIENTES_PRODUCTO.md](../PENDIENTES_PRODUCTO.md).

## Decisiones legales (titular y revisión jurídica)

| Tema | Situación | Opciones |
| --- | --- | --- |
| Versión legal tras corregir el proveedor de alojamiento y agregar el enlace personal | `/privacidad` y `/consentimiento` ya nombran a Cloudflare en lugar de Netlify. `/privacidad` también explica que quien abre su papelito personalmente lo hace con un enlace personal, que su asignación no aparece en la cuenta de quien la representa, que esa persona recibe el enlace para entregarlo y qué se guarda del enlace; `LEGAL_CONSTANTS.VERSION` sigue en `2026-10-31.1`, igual que la fecha de actualización | (a) Tratarlo como corrección editorial y dejar la versión. (b) Publicar una versión nueva: todas las cuentas vuelven a aceptar y los recordatorios se pausan hasta entonces |
| Identidad jurídica y domicilio del responsable | Pendientes, como indican los textos | Completar antes de abrir el servicio al público |
| Plazos de retención | Sin cambios: 12 meses tras el cierre y 30 días para registros de entrega | Cualquier cambio requiere actualizar los textos y, probablemente, la versión |
| Registros técnicos de Cloudflare | Los registros de invocación de Workers guardan la ruta visitada (con la consulta redactada). En `/unirse/<token>` la ruta incluye el token de invitación. El enlace personal no tiene este problema: su secreto va en el fragmento de la dirección y en el cuerpo de un POST, que no se registran. Solo accede la cuenta del titular | Aceptarlo, reducir el muestreo de registros o desactivar los registros de invocación y conservar solo los registros propios saneados |

## Decisión de producto: aislamiento frente a quien representa (enlace personal)

**Decidido para el piloto (13 de noviembre de 2026): opción A.** El titular acepta que quien conserve el enlace puede abrirlo, incluida la persona que lo crea. Se mantienen la elección por permisos («Yo gestiono su papelito» / «Lo abre personalmente») y los textos que explican esa limitación. Las opciones B y C quedan registradas por si el piloto muestra que hace falta más aislamiento.

Quien representa crea el enlace personal y lo entrega, así que podría abrirlo. Lo que hoy garantiza Papelito: la asignación no aparece en la cuenta de quien representa, y el papelito muestra cuándo se abrió por primera vez (también si se crea otro enlace), de modo que una apertura ajena queda a la vista. No lo impide. Los textos de la app ya lo dicen así.

| Opción | Qué agrega | Costo y límites |
| --- | --- | --- |
| A. Confianza y rastro (actual) | Nada más. Sirve para cualquier persona con un teléfono | Gratis. No impide que quien representa abra el enlace; lo deja visible |
| B. Registrar el teléfono antes del sorteo | Antes del sorteo la persona abre el enlace en su teléfono y lo registra; después, el papelito solo se abre ahí. Si otra persona lo registró primero, se nota antes de que exista el secreto | Gratis. Hay que usar siempre el mismo teléfono y navegador; si se pierde o se borran sus datos, alguien tiene que autorizar un enlace nuevo (por ejemplo, quien organiza). No protege si quien representa también organiza |
| C. Código enviado al correo o teléfono de la persona | Abrir o renovar el enlace exige un código que llega directamente a la persona | Correo: hace falta un remitente propio (dominio y proveedor, hoy pospuestos) y que la persona use correo. SMS: costo por mensaje. En ambos casos el contacto lo escribe quien representa, así que frena la curiosidad pero no a quien registre un contacto propio |

## Decisiones operativas

| Tema | Recomendación |
| --- | --- |
| Activar la reversión automática (`PAPELITO_AUTO_ROLLBACK`) | Solo después de ensayar una reversión manual (ver `docs/OPERACION.md`) |
| Aplicar la CSP (dejar el modo reporte) | Revisar primero los informes `csp_violation` de una o dos semanas de uso real. Para quitar `'unsafe-inline'` de los scripts hace falta un nonce por petición; eso obliga a renderizar dinámicamente y puede afectar el prerenderizado parcial y el costo de CPU |
| Tope de recordatorios por ejecución | 15 por hora (9 ejecuciones diarias). Si las métricas muestran CPU holgada, subir `PUSH_MAX_SENDS_PER_RUN` (máximo 45 en el plan gratuito) |
| Dominio propio y remitente de correo | Siguen pospuestos por el titular |

## Funciones nuevas (fuera de esta entrega)

Cada una cambia lo que ven o reciben las personas, así que necesita definición antes de construirse:

1. **Aviso de sorteo realizado y de aprobación.** Push cuando el sorteo está listo o cuando el organizador aprueba una inscripción. Decidir texto, si incluye el nombre del grupo (hoy los avisos no incluyen nombres) y cómo afecta el tope por ejecución.
2. **Recordatorio al organizador.** Por ejemplo: «hay inscripciones pendientes» o «falta sortear y la entrega es en tres días». Decidir el umbral y la frecuencia.
3. **Editar fechas, descripción o presupuesto después de crear el grupo.** El nombre ya se puede corregir mientras el intercambio siga activo, incluso tras sortear, sin cambiar asignaciones ni enviar avisos. Para fechas y otros cambios sigue pendiente definir qué se permite tras el sorteo y cuándo se avisa a los participantes.
4. **Que un participante salga por su cuenta.** Hoy solo el organizador quita o rechaza. Definir qué pasa con un sorteo vigente: invalidarlo y avisar, o bloquear la salida.
5. **Cierre automático.** Cerrar el grupo cierto tiempo después de la fecha de entrega para que empiece la retención de 12 meses. Es una decisión de retención.
6. **Moderación de mensajes anónimos.** Reportar o bloquear una conversación. Implica revisar contenido y definir quién lo hace.
7. **Aviso de eliminación del grupo.** Avisar a los participantes cuando el organizador elimina un intercambio. Hoy desaparece sin aviso.
