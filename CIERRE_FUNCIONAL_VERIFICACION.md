# Papelito — cierre funcional (17 de octubre de 2026)

## Acceso en producción

- Sitio: https://papelitocr.netlify.app/
- Google Cloud: proyecto independiente `papelito-costa-rica`, nombre público Papelito Costa Rica.
- Soporte de la pantalla de Google: `kgcalderon1997@gmail.com`, autorizado por el titular. Contacto público de Papelito: `kennethgeo97@gmail.com`.
- Cliente OAuth web creado con callback exacto de Neon Auth; pantalla con vínculos de inicio, privacidad y términos de Papelito. Audiencia externa publicada: **En producción**.
- CLI Neon confirmó `google standard` después de actualizar el proveedor con las credenciales propias. El secreto se guardó en Neon y se eliminó el archivo local temporal; no se incorpora al repositorio.
- Recuperación real: cuenta descartable exacta autorizada `kennethgeo97+papelito-prueba-20261017@gmail.com`; signup HTTP 200 y solicitud de recuperación HTTP 200. El titular confirmó recepción del correo, cambio de contraseña e ingreso correcto. No compartió la contraseña nueva.
- Se activó verificación por OTP, requerida para ingresar con correo no verificado; envío al registrar, sin envío automático al ingresar. El titular confirmó salida, ingreso con código recibido y llegada al panel.
- El titular decidió dejar pendiente el remitente propio SMTP. No confundir una solicitud HTTP exitosa con entrega: la entrega del proveedor compartido sí fue confirmada por el titular.

## Migración de retención validada fuera de producción

Rama temporal `verify-privacy-20261017` (`br-restless-resonance-b421uecb`), con expiración. No se modificaron `.neon` ni `.env.local` para apuntar a ella.

Migración: `20261017_retention_and_lifecycle.sql`.

SHA256 probado: `cf74e456f08bff0441d35377470c95808e852ca29df5415cc8cdaff9eb1c7832`.

Resultado real de PostgreSQL:

```json
{"baselineRowsPreserved":true,"oldTerminalStartsAtMigration":true,"activeHasNoClosure":true,"repeatIsIdempotent":true,"syntheticRowsCleaned":true}
```

Se insertaron un intercambio terminal antiguo y otro activo sintéticos, se aplicó la migración, se verificó que el terminal inicia sus 12 meses en el momento de migración y el activo conserva `closed_at = NULL`. Se repitió la migración sin alterar el cierre. Se eliminaron exclusivamente las filas sintéticas y se comprobó el mismo total inicial de intercambios.

## Recorrido real con varias cuentas y tratamiento de bajas

Se arrancó la compilación de producción en `http://127.0.0.2:3042` apuntando exclusivamente a la rama temporal. Cuatro cuentas ficticias `@example.com` se registraron mediante Neon Auth real; no se enviaron correos. La verificación de correo se desactivó únicamente en esa rama y los consentimientos fueron fixtures sintéticos, nunca aceptación por una persona real. La configuración de producción mantiene OTP obligatorio.

En navegador: acceso con correo, creación de grupo con respuesta de espera visible, tres ingresos por invitación, aprobación de los tres, creación de deseo con precio CRC 10000, selección explícita para compartirlo, sorteo de cuatro y revelación individual. Nuevos accesos reconocieron el consentimiento sin casillas repetidas.

Prueba HTTP contra la compilación real, Neon Auth y PostgreSQL remoto:

```text
PASS cuenta 1 login 200, SSR 200, asignación propia 200; ignora userId ajeno y conserva privacidad
PASS cuenta 2 login 200, SSR 200, asignación propia 200; ignora userId ajeno y conserva privacidad
PASS cuenta 3 login 200, SSR 200, asignación propia 200; ignora userId ajeno y conserva privacidad
PASS cuenta 4 login 200, SSR 200, asignación propia 200; ignora userId ajeno y conserva privacidad
PASS 4 destinatarios únicos; deseo visible solo al donante; invitado 401; contraseña incorrecta 401.
```

Luego, en navegador: transferencia al segundo participante aprobado, solicitud de baja con frase y confirmación, procesamiento administrativo con Auth real de la rama y borrado transaccional del perfil. La recarga rechazó la sesión previamente autenticada. El grupo conservó los tres miembros restantes, mostró el motivo de invalidación y permitió sortear la versión 2 con motivo obligatorio. El nuevo organizador lo finalizó: invitaciones desactivadas y cierre registrado.

```text
PASS rama aislada: dry-run preservó datos; CLI eliminó Auth real; perfil eliminado;
sorteo invalidado; tres participantes conservados.
```

El recorrido detectó un aviso de Next.js por consultar la hora de expiración durante el prerender de invitaciones. Se añadió `connection()` antes de consultar la invitación, según la guía instalada de Next 16.4.2. También se corrigieron el falso mensaje de intercambio inexistente durante carga, acciones de gestión visibles tras el cierre y marcas de tiempo sin formato. La creación y el guardado de deseos bloquean doble envío y muestran espera/error.

## Comandos de verificación

```text
npm run type-check     -> exit 0
npm run lint           -> exit 0
npm run test:draw      -> 8 pruebas, exit 0
npm run test:backend   -> 12 suites, exit 0
npm run test:lifecycle -> permisos, transferencia, baja/reintentos y retención, exit 0
npm run build         -> Compiled successfully; 16/16 páginas; exit 0
next start            -> Ready in 166ms; recorrido autenticado y APIs probados
npm run db:migrate    -> migración incremental aplicada; 12/12 tablas verificadas
npm run test:neon     -> conexión, esquema y CRUD transaccional; 0 filas residuales
```

La primera compilación encontró EPERM al crear una carpeta generada en `.next`; la repetición con acceso normal al proyecto y la compilación final terminaron con código 0. En el entorno aislado, Next construyó una salida hacia `localhost:3042` pese a entrar por `127.0.0.2`; se regresó explícitamente al origen aislado para continuar. No se amplió la confianza de producción ni se mezclaron cookies con la sesión local humana.

## Limpieza real y operación

Se usó el comando definitivo `privacy:delete` en modo simulación y después `--execute` para la cuenta descartable exacta autorizada de recuperación/OTP. Ambos terminaron con código 0; Auth, perfil y solicitudes residuales: cero. El grupo descartable creado en producción se canceló y se eliminó únicamente después de comprobar su ID, nombre, organizador y ausencia de terceros. Se conservó la cuenta humana.

Las solicitudes de baja requieren procesamiento administrativo; no son borrado instantáneo. El README describe cómo listarlas, simularlas y ejecutarlas, incluidos los reintentos después de fallos. El acceso a Neon Auth se elimina mediante la CLI oficial, nunca mediante SQL sobre el esquema administrado.

## Límites pendientes del titular

- Remitente SMTP propio: aplazado expresamente; se conserva el proveedor compartido de Neon, cuya entrega sí se comprobó.
- Identidad jurídica y domicilio del responsable: no definidos; el nombre público no se presenta como razón social inscrita. Textos sujetos a revisión jurídica.
- Dominio propio y verificación de marca en Google: pendientes; el callback puede seguir mostrando neon.tech aunque el OAuth propio ya funciona y su audiencia es pública.
- Instalación y uso en teléfonos físicos Android/iPhone: no probados por esta sesión; comprobar un viewport no sustituye esa prueba.

El acceso real de Google con las credenciales propias se completó desde el sitio publicado y regresó al panel. La publicación final de código y la invocación de la Scheduled Function se verifican tras el despliegue de este cambio.

## Verificaciones posteriores

La compilación final volvió a arrancar correctamente. GET `/`, `/?mode=demo` y la invitación revocada devolvieron HTTP 200, esta última con el aviso de invitación no disponible. El proceso no registró avisos de prerender en estas consultas después de la corrección. A 320 y 390 píxeles no hubo desbordamiento horizontal.

Se eliminó la rama temporal al terminar: la CLI lista únicamente `production`. Se borraron los archivos privados de credenciales de prueba y conexión temporal. La configuración de producción conserva `Require Verification: true`, método `otp`, envío al registrar y sin envío al iniciar sesión.

El primer intento de Netlify del commit `2a908e4` compiló Next y empaquetó las dos funciones, pero su escáner detuvo la publicación al encontrar en README la URL de Auth marcada como secreta en el entorno. Se sustituyó por `<NEON_AUTH_BASE_URL>/callback/google`, manteniendo activo el escaneo; no se expuso un Client Secret, una contraseña ni una conexión de base de datos.
