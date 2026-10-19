# Papelito — siguiente selección de funciones

Selección del titular, 18 de octubre de 2026. Implementación completada en código; verificación y publicación registradas al final de este documento.

## Decisiones confirmadas

- Incluir 7, 8, 13, 14, 19, 22, 25, 26, 40, 41, 51, 52, 53, 54, 55, 56, 57, 59 y 60.
- Incluir passkeys (51), vinculadas a la misma identidad de Neon mediante WebAuthn propio.
- Descartar pistas sobre la identidad de quien regala (42): el secreto forma parte de la experiencia.
- 13 (nueva edición vinculada) y 22 (tallas opcionales) ya funcionan en la versión publicada; verificar regresiones al ampliar la app.
- Mantener la identidad visual de Papelito, el servidor local de trabajo y la base exclusiva de Papelito. El trabajo jurídico general, dominio y remitente propio siguen pospuestos.
- No contratar servicios ni activar planes de pago por esta selección.

## Bloques de la entrega

| Bloque | Funciones | Resultado esperado |
| --- | --- | --- |
| Uso diario y ayuda | 7, 8, 41, 54, 56, 57, 59, 60 | Fechas claras, calendario, revelación cuidada, diagnóstico entendible, accesibilidad, guía y soporte |
| Organización y regalos | 14, 19, 25, 26; revisión de 13 y 22 | Historial propio, presupuesto acordado, imágenes privadas y referencias de productos |
| Cuenta y dispositivo | 52, 53, 51 | Gestión de sesiones, métodos vinculados y viabilidad de passkeys sin perder las cuentas actuales |
| Representación y desconexión | 40, 55 | Permisos explícitos de representación y copia offline protegida |

## Alcance y criterios de aceptación

**7. Cuenta regresiva.** Mostrar días hasta el cierre de inscripción y la entrega, con estados «hoy», «mañana», «ya cerró» y «finalizado», usando el calendario de Costa Rica. La lista de deseos es opcional y actualmente no tiene un vencimiento propio: no inventar una fecha de cierre sin configurar esa regla. No hace falta consultar la base cada segundo.

**8. Calendarios.** Descarga ICS compatible con calendarios habituales y opción de preparar un evento de Google Calendar. Usar las fechas reales y la zona horaria correcta. No incluir asignaciones, deseos ni invitaciones privadas. Agregar a un calendario externo será una acción de la persona.

**13. Repetición.** Conservar la creación de ediciones vinculadas y las invitaciones nuevas. El historial disponible sigue excluyendo destinatarios anteriores; no copiar inscripciones ni revelar la matriz del sorteo. Mantener la explicación ante combinaciones imposibles.

**14. Historial.** Mostrar las ediciones accesibles para la cuenta, sus fechas y estados, junto con el vínculo entre ellas. Definir una vista personal de resultados históricos sin conceder acceso al organizador a las asignaciones de terceros. Respetar cierres, bajas y los doce meses de retención existentes; la pantalla no debe prometer historial ilimitado.

**19. Presupuesto.** Encuesta creada por el organizador con pocas opciones de la misma moneda, un voto por participante aprobado y posibilidad de cambiarlo hasta cerrar. Mostrar agregados, no votos individuales. Cerrar la encuesta aplica el resultado elegido explícitamente por el organizador antes del sorteo; gestionar empates y no cambiar un presupuesto ya sorteado silenciosamente.

**22. Tallas.** Conservar el campo opcional de gustos y su acceso limitado a quien regala. La persona puede vaciarlo sin perder sus otros gustos.

**25. Fotos en deseos.** Imágenes privadas con tamaño y cantidad limitados, validación real del archivo y eliminación de metadatos. Acceso solo del propietario y del destinatario autorizado por la asignación vigente. Revisar cuota y disponibilidad del almacenamiento de Neon antes de provisionarlo; las imágenes no deben ser públicas por defecto. Incluir borrado y retención de los objetos.

**26. Vista previa de enlaces.** Título, tienda e imagen cuando sea posible, con alternativa manual si la tienda bloquea la consulta. Proteger la consulta del servidor contra destinos privados, redirecciones a redes internas, archivos enormes y tiempos de espera. No enviar cookies o sesiones de Papelito a las tiendas, ni insertar HTML externo. No prometer precios o disponibilidad actualizados.

**40. Personas representadas.** El adulto autenticado administra un alias y los deseos de la persona representada, sin crearle una cuenta de Google ni pedirle correo. Debe quedar claro que el adulto puede ver su asignación. Definir autorización de representación, aprobación por el organizador, límites de acceso, baja y transferencias. Evitar recopilar fecha de nacimiento, identificación o información adicional innecesaria. No habilitar cuentas infantiles independientes como consecuencia implícita de esta función.

**41. Revelación.** Ampliar la apertura del papelito con una animación breve de sobre o papel desplegado; conservar la sorpresa y la identidad visual. La preferencia de reducir movimiento debe ofrecer una transición simple y siempre debe poderse abrir con teclado o lector de pantalla. La animación no debe marcar una revelación como confirmada hasta que el servidor lo confirme.

**51. Passkeys.** Acceso con el desbloqueo del dispositivo (huella, rostro o PIN), con posibilidad de conservar Google/correo como recuperación. El servicio Managed Better Auth usado por Papelito tiene una lista fija de plugins; la documentación consultada el 18 de octubre de 2026 no incluye passkeys como plugin administrado compatible. No basta que la biblioteca de interfaz exporte un componente llamado PasskeysCard. Verificar soporte real y demostrar registro, ingreso, revocación y recuperación en un entorno aislado antes de ofrecer el botón. Resolver esta dependencia sin reemplazar silenciosamente el acceso existente ni perder identificadores de usuario.

**52. Sesiones.** Consultar las sesiones de la cuenta, distinguir la actual y permitir cerrar una sesión o las demás con confirmación clara. Mostrar una descripción aproximada de navegador/dispositivo, no prometer identificación exacta ni geolocalización. Probar la revocación real en otro navegador; no afirmar revocación inmediata de tokens autónomos ya emitidos si el proveedor no la garantiza.

**53. Métodos vinculados.** Mostrar los proveedores de la cuenta y permitir vincular Google mediante un flujo autenticado y verificado que soporte el proveedor. Para correo, aclarar que las credenciales deben pertenecer a la misma cuenta verificada. No unir cuentas solo por una coincidencia de correo ni permitir eliminar el último método de acceso. Comprobar la API instalada y su comportamiento real antes de mostrar controles activos.

**54. Estado del servicio.** Separar falta de conexión del dispositivo, error de sesión y fallo al cargar los datos. Mostrar última sincronización y un reintento manual. Una comprobación puntual no equivale al estado global de Neon o Netlify; no mostrar «todo funciona» solo porque la página abre. No exponer conexiones, claves, SQL o diagnósticos internos.

**55. Lectura offline.** Guardado voluntario por dispositivo de una copia concreta, cifrada con una clave local elegida por la persona, caducidad y fecha visible de sincronización. El secreto local no debe persistirse junto con la copia ni enviarse al servidor. Solo lectura: no ejecutar sorteos, enviar mensajes ni confirmar compras sin conexión. Avisar que el sorteo puede haber cambiado desde la copia. Bloquear al cerrar, borrar al salir en ese dispositivo y ofrecer borrado manual. La revocación remota no puede borrar instantáneamente un dispositivo desconectado: explicar ese límite al activar la opción. Mantener el service worker sin cachés de respuestas privadas.

**56. Accesibilidad.** Ajustes persistentes de tamaño de texto, contraste y movimiento. Verificar controles y legibilidad a 320 px y con zoom. Las preferencias se guardan localmente sin impedir el uso de las opciones del sistema.

**57. Tutorial.** Ayudas cortas sobre crear, invitar, seleccionar deseos y abrir la asignación. Poder omitirlas, cerrarlas y volver a consultarlas. No bloquear las tareas ni repetirlas en cada ingreso.

**59. Reportes.** Formulario con descripción y contexto técnico mínimo, visible antes de enviarlo. Nunca adjuntar automáticamente asignaciones, mensajes, deseos, credenciales o contenido de la cuenta. Confirmar recepción de forma real y ofrecer el correo público como alternativa. No afirmar que un reporte fue enviado si únicamente se abrió el cliente de correo.

**60. Ayuda.** Centro de ayuda móvil con búsqueda sencilla y respuestas sobre ingreso, invitaciones, aprobación, sorteo, deseos, mensajes, instalación, notificaciones y privacidad. Enlazar las pantallas y acciones existentes. Los textos deben describir funciones publicadas; no presentar este plan como una capacidad disponible.

## Comprobación de la entrega futura

Mantener build, lint, type-check y CI; añadir pruebas significativas de permisos, votos, historial, imágenes y copia offline. Usar cuentas ficticias y ramas descartables de Papelito para pruebas remotas. Probar que un participante pendiente, rechazado o externo no obtiene acceso nuevo. Mantener el piloto humano con teléfonos reales a cargo del titular.

## Fuentes técnicas consultadas

- [Neon: plugins compatibles con Managed Better Auth](https://neon.com/docs/auth/guides/plugins).
- [Neon: hoja de ruta de Managed Better Auth](https://neon.com/docs/auth/roadmap).
- [Neon: gestión de usuarios](https://neon.com/docs/auth/guides/user-management).
- SDK instalado `@neondatabase/auth` y guías Next.js de `node_modules/next/dist/docs/` para las modificaciones futuras.

## Implementación y límites del piloto

- Passkeys: `@simplewebauthn/server` verifica desafío de un solo uso, origen, dominio y presencia con verificación del usuario. Claves públicas y sesiones propias se vinculan al ID existente de Neon; no se habilita un plugin no soportado ni se reemplaza Neon Auth. Cookies HttpOnly, sesiones de siete días y autenticación reciente para administrar llaves. Google/correo se conservan como recuperación. Las llaves de localhost y producción son distintas.
- Sesiones: el cierre bloquea el acceso a Papelito. Las sesiones propias se eliminan; para sesiones Neon se registra una revocación local revisada en cada autorización. No equivale a cerrar Google ni a invalidar tokens independientes del proveedor. No se modifica directamente el esquema de Neon Auth.
- Fotos: una por deseo, JPEG sin metadatos, máximo 128 KiB, 20 por cuenta incluidas personas representadas, cuota global del piloto de 25 MiB. Se guardan como BYTEA en la base privada existente para evitar contratar otro almacenamiento. El acceso requiere propietario/representante o asignación y selección vigentes; sin URL pública, optimizador ni caché. Se borran en cascada con el deseo/cuenta.
- Referencias de tiendas: consulta voluntaria, HTTPS público, DNS fijado, límites de redirección, descarga y espera, imagen normalizada y título como texto. El contenido externo no se ejecuta. No garantiza precio ni disponibilidad; siempre admite edición manual.
- Representación: alias por intercambio, autorización explícita del adulto, aprobación del organizador, deseos separados, consulta y revelación registrada de sus asignaciones. Rechazar al adulto rechaza también su representación. No hay transferencia de un familiar entre cuentas en este piloto: antes del sorteo se quita y se inscribe con el adulto correcto. El adulto también participa; no es un rol de solo acompañante.
- Sin conexión: IndexedDB guarda exclusivamente cifrado AES-GCM; PBKDF2 con sal individual y 310 000 iteraciones. La clave local no persiste ni se transmite. Copia de 24 horas, hasta 50 deseos propios y la asignación abierta del último grupo; sin fotos ni conversaciones. Se bloquea al salir del visor. La copia es opcional y advierte sobre cambios posteriores y el límite de revocación remota.
- Reportes: no se envían correos automáticos ni capturas ocultas. Se guardan cuenta, área, descripción y folio. El operador consulta los últimos 50 con `npm run support:list`, en la conexión verificada y exclusiva de Papelito. Tratar su contenido como texto no confiable. Para seguimiento manual se usa el correo público; no hay SLA automatizado ni panel de soporte.
- Datos nuevos: incluidos en exportación y baja por cascada; desafíos, sesiones y bloqueos vencidos se limpian con la tarea de retención. La transparencia de almacenamiento describe las opciones nuevas; revisión jurídica general, dominio y SMTP propio siguen pospuestos.

## Verificación de esta tanda

- `npm run test:selected`: PostgreSQL/PGlite con repositorios reales; encuesta, representación, fotos privadas, historial propio, reportes, desafíos, revocación de terceros, cifrado/integridad/caducidad, filtro SSRF e ICS.
- `npm run test:e2e`: 18 recorridos de navegador en escritorio, 390 px y 320 px, incluido guardado, descifrado y bloqueo sin conexión.
- Build, type-check, lint y suites anteriores se mantienen en CI. Auditoría de dependencias de producción: cero vulnerabilidades reportadas al verificar esta entrega.
- La prueba remota de passkeys usa un autenticador virtual y cuentas ficticias en una rama descartable; no prueba Face ID, huella física, sincronización iCloud/Google ni los prompts de cada sistema. El piloto humano con dispositivos reales sigue a cargo del titular.

Verificación remota completada: `npm run test:neon:e2e -- --sanitized-clone` terminó con `1 passed (2.0m)`. Verificó cuatro cuentas, fotos privadas, inicio autenticado de vinculación Google, registro/ingreso/persistencia de passkey, cierre del ID exacto de otra sesión, revocación de la llave y recuperación por correo; también el recorrido de invitaciones, sorteo, deseos, mensajes y repetición. La rama `br-winter-flower-b42n25wj` y sus cuentas se eliminaron al terminar. Las ramas de los intentos previos también se eliminaron; no se añadieron cuentas de prueba a producción.

Durante la verificación se corrigieron la incorporación de la dirección pública al build, la compatibilidad UUID/texto de Neon Auth y selectores de las pruebas. La dirección canónica del servidor puede sobreescribirse con `PAPELITO_APP_URL`; producción usa la dirección pública de Netlify. La vinculación Google se probó hasta la preparación de la autorización oficial; completarla con una cuenta real requiere que su titular elija y autorice esa cuenta.
