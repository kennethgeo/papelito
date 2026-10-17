> Actualización del 17 de octubre de 2026: Google OAuth propio, recuperación, OTP, despliegue y privacidad se documentan en [CIERRE_FUNCIONAL_VERIFICACION.md](CIERRE_FUNCIONAL_VERIFICACION.md). Los pendientes anteriores de este registro histórico deben leerse con esa actualización.

# Acceso por correo y consentimiento por cuenta

Verificación realizada el 17 de octubre de 2026, Costa Rica.

## Comportamiento

- Acceso y registro con correo/contraseña mediante Neon Auth, además de Google. Las contraseñas permanecen a cargo del servicio de autenticación.
- Los formularios de acceso y registro no piden aceptar documentos legales antes de identificarse. La cuenta autenticada confirma la versión vigente una sola vez; cambios de versión o una revocación requieren una nueva confirmación explícita.
- Mi cuenta, exportación, solicitudes de privacidad y salida siguen accesibles sin consentimiento vigente. Las operaciones del intercambio se verifican también en el servidor.
- El acceso desde una invitación conserva su destino. Autenticarse y visitar el enlace no incorporan automáticamente a la persona: debe pulsar «Unirme al intercambio».
- Recuperación en `/auth/recuperar`, con mensajes para enlaces inválidos o vencidos. La verificación de correo con OTP se muestra si la configuración de Neon la exige.

## Prueba local con Neon real

Se usó una cuenta sintética con dirección reservada `@example.com` y contraseña aleatoria, una invitación aislada y ningún participante real.

1. Alta por la API, credencial incorrecta rechazada (401), acceso válido (200), sesión y salida comprobados.
2. Acceso real por la interfaz desde una invitación: aparece la confirmación inicial y el estado en PostgreSQL sigue `hasCurrentConsent=false`, `consentRows=0`, sin membresía automática.
3. Se preparó un registro de consentimiento exclusivamente como dato de prueba de esa cuenta sintética; no se aceptó un contrato por un usuario humano. La invitación permitió entonces unirse explícitamente y PostgreSQL confirmó membresía `approved`.
4. Salida, nuevo acceso por correo y recarga: panel visible, cero casillas legales y un único registro de consentimiento, sin duplicados.
5. Recuperación de una cuenta inexistente devuelve 200 y una respuesta neutral; un token falso devuelve 400 `INVALID_TOKEN`. También se verificaron la solicitud desde la interfaz y la pantalla de enlace inválido. No se envió correo a una persona real ni se verificó su entrega en un buzón.
6. Interfaz revisada a 320 y 390 px sin desbordamiento horizontal. El acceso aparece primero en teléfonos; se mantiene la composición de escritorio.

Al terminar se eliminaron la cuenta sintética de Neon Auth y sus sesiones, los perfiles de prueba, la invitación, membresías y consentimiento. También se retiró el archivo privado que contenía sus credenciales.

## Comandos

```text
npm run type-check     → exit 0
npm run lint           → exit 0
npm run test:draw      → 8/8 pruebas, exit 0
npm run test:backend   → 12/12 suites, exit 0
npm run build         → Compiled successfully; 16/16 rutas generadas, exit 0
next start            → invitado 200, login real 200, SSR autenticado 200,
                        logout 303, invitado 200; sin HANGING_PROMISE_REJECTION
```

La suite nueva prueba validaciones, normalización de errores, destinos internos, recuperación y persistencia/revocación del consentimiento usando los módulos reales y PostgreSQL en memoria (PGlite). La prueba de navegador anterior usa el servicio Neon remoto, sin simular sus respuestas.

## Netlify

Proyecto existente `papelitocr`, conectado a `kennethgeo/papelito`, rama `main`. Se guardaron `DATABASE_URL`, `NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET` e `INVITATION_TOKEN_SECRET` como secretos exclusivamente del contexto de producción, con autorización del titular. No se copiaron al repositorio ni se habilitaron para previews, otras ramas o agentes de Netlify. La visibilidad observada pasó de producción privada a pública durante la verificación; los previews continúan privados. Codex no modificó esos controles.

Neon Auth autoriza los orígenes exactos `http://127.0.0.1:3040`, `http://localhost:3040` y `https://papelitocr.netlify.app`. La comprobación del despliegue remoto se realiza por separado; la compilación local y las pruebas anteriores no la sustituyen.

El commit `3d827c4` superó CI y Netlify lo publicó en 49 segundos. Desde el dominio principal se comprobó con otra cuenta sintética el acceso, un deseo guardado por la interfaz y confirmado directamente en PostgreSQL, la persistencia tras recargar y dos ciclos de entrada/salida sin casillas repetidas.

Durante la prueba, el formulario de salida abierto en el dominio principal devolvió en ocasiones al permalink temporal del despliegue, que no es un origen autorizado. Neon rechazó entonces el siguiente callback con HTTP 403 `INVALID_CALLBACK_URL`; al volver al dominio principal, el acceso pasó. La salida construía su redirección con el origen de la petición, que en Netlify podía resultar ser el del despliegue. Se configuró `NEXT_PUBLIC_APP_URL=https://papelitocr.netlify.app` exclusivamente en producción para usar ese origen público validado al salir. En servidores locales se conserva su propio origen. No se autorizaron comodines ni todos los previews para sortear esta restricción.

También se detectó que el SDK iniciaba `get-session` durante el prerender y registraba `HANGING_PROMISE_REJECTION`, aunque las sesiones funcionaban. La lectura de sesión ahora espera una petición real mediante `connection()` fuera del `try`; los bloques que la envuelven propagan los errores internos de control de flujo de Next con `unstable_rethrow`. Se conserva la generación parcial de páginas y no se cachea la identidad. La solución inicial con `await cookies()` no eliminó el aviso en `next start` y fue sustituida. El diagnóstico temporal de errores se retiró antes de publicar para evitar registrar datos de autenticación.

## Pendientes

- Entrega y uso completo de un enlace de recuperación en un buzón de prueba autorizado; OTP real si se activa la verificación obligatoria de correo.
- Google OAuth propio para operar públicamente, en lugar de las credenciales compartidas de desarrollo.
- Completar y revisar responsable/contacto de los borradores legales para la operación pública.
