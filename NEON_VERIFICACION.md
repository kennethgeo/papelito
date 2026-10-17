> Actualización del 17 de octubre de 2026: Google OAuth propio, recuperación, OTP, despliegue y privacidad se documentan en [CIERRE_FUNCIONAL_VERIFICACION.md](CIERRE_FUNCIONAL_VERIFICACION.md). Los pendientes anteriores de este registro histórico deben leerse con esa actualización.

# Verificación de Neon para Papelito

Configuración y comprobaciones realizadas el 16 de octubre de 2026 (Costa Rica).

## Destino y aislamiento

- Organización autorizada: `org-solitary-voice-24830396`.
- Proyecto: `spring-frog-51248337`, nombre `papelito`, plan `free_v3`.
- Rama: `production` (`br-royal-tooth-b4ru7kif`), PostgreSQL 18, AWS us-east-2.
- El esquema `public` estaba vacío antes de aplicar la migración de Papelito. No se conectaron bases de datos de otras aplicaciones.
- La migración y su repetición sin cambios pasaron primero en una rama temporal del mismo proyecto. Esa rama se eliminó al terminar.
- Las credenciales descargadas y los secretos de cookies e invitaciones permanecen en `.env.local`, excluido de Git.

## Aprovisionamiento

```text
npm i -g neon@latest
added 155 packages in 12s

neon --version
8.8.0

neon init -y --org-id org-solitary-voice-24830396 --project-id spring-frog-51248337 --branch production --services 'postgres,auth'
```

En PowerShell el argumento de servicios necesita las comillas para conservar la coma. El primer intento sin comillas fue rechazado; no aprovisionó servicios. El primer inicio de sesión venció a los 60 segundos y el titular completó después `neon login`.

Con la sesión autorizada:

```text
neon deploy
Applying to branch production (br-royal-tooth-b4ru7kif)
No changes — branch production already matches the policy.
Utilized services: Postgres, Neon Auth
Pulled 5 Neon variables into .env.local
  Postgres        DATABASE_URL, DATABASE_URL_UNPOOLED
  Branch          NEON_BRANCH
  Neon Auth       NEON_AUTH_BASE_URL, NEON_AUTH_JWKS_URL
```

`neon deploy` configura los servicios de backend; no publica el frontend en Netlify.

## Persistencia real

La migración creó y verificó 12 tablas dentro de una transacción. Su segunda ejecución conservó el esquema:

```text
npm run db:migrate
Esquema Papelito ya presente y verificado (12/12 tablas y columnas esperadas íntegras). No-op sin cambios.

npm run test:neon
Conexión activa verificada con src/lib/db/client.ts (base=neondb)
Esquema public verificado (12/12 tablas y todas las columnas esperadas presentes)
CRUD transaccional (profiles/wishes) y ROLLBACK verificados: 0 filas residuales en Neon
Prueba SQL en Neon PostgreSQL completada con éxito
```

La prueba remota usa el cliente real de la aplicación, sin PGlite ni adaptador de prueba. La prueba del backend con PGlite se conserva por separado para CI.

## Google y recorrido desde la interfaz

El titular completó las casillas de términos y consentimiento y el acceso real con Google. Se verificó:

1. Retorno al panel autenticado de Papelito.
2. Recarga completa conservando la sesión.
3. `/api/auth/get-session` con `authenticated: true` y `sessionPresent: true`, sin mostrar tokens.
4. Creación de un deseo temporal desde la interfaz mediante Server Action.
5. Recarga y consulta del mismo deseo desde Neon; precio CRC 1000 y consentimiento registrado.
6. Eliminación únicamente de ese deseo temporal de prueba.
7. Cierre de sesión desde Mi cuenta y respuesta posterior con `authenticated: false`, `sessionPresent: false`.

Fallos encontrados y corregidos durante este recorrido:

- Neon rechazaba `http://127.0.0.1:3040` con `403 Invalid callbackURL`. Se registró ese origen exacto como dominio autorizado; el inicio social respondió después `200` con redirección y cookie de verificación.
- El proxy de Next.js no ejecutaba el intercambio del verificador OAuth. Se conectó el middleware oficial de Neon, conservando acceso público y cabeceras privadas. No se implementó un intercambio manual de tokens.

## Compilación y arranque

Salida de `npm run build`, con `.env.local` presente y la integración de sesión:

```text
Next.js 16.4.2 (Turbopack)
Environments: .env.local
Compiled successfully
Finished TypeScript
Generating static pages (15/15)
```

El comando terminó con código `0`. También pasaron TypeScript, ESLint, las 8 pruebas del sorteo y las 11 suites de backend.

Después se inició la compilación con `npm run start -- --hostname 127.0.0.1 --port 3041`:

```text
Ready in 186ms
Producción local GET /: 200
Producción local GET /?mode=demo: 200
Producción local GET /api/auth/get-session: 200
Producción local GET /api/exchanges/00000000-0000-0000-0000-000000000000/my-assignment: 401
```

El recorrido interactivo autenticado se comprobó en el servidor de desarrollo de `http://127.0.0.1:3040/`. El puerto 3041 se utilizó para verificar el arranque de producción; no se agregó como origen OAuth adicional.

Las nuevas pruebas detectaron errores iniciales en sus fixtures (ruta de `.neon`, formato de fechas de sesión y expectativas de mensajes/URL). Se corrigieron y la suite completa volvió a pasar. Esos errores no se presentaron como evidencia de funcionamiento remoto.

## Límites de esta comprobación

- El proveedor Google usa credenciales compartidas de desarrollo de Neon. Antes de un lanzamiento público necesita credenciales OAuth propias y el dominio público autorizado. Referencia: [lista de producción de Neon Auth](https://neon.com/docs/auth/production-checklist).
- No se ha publicado el frontend en Netlify ni se han transferido secretos a ese servicio.
- Los datos del responsable y contacto de los documentos legales siguen pendientes por decisión del titular.
- Esta comprobación no demuestra todavía un intercambio entre tres cuentas reales ni contención simultánea de varios sorteos remotos.
- `npm audit --omit=dev` reportó cero vulnerabilidades. La auditoría completa reportó cinco alertas altas en la cadena de herramientas de ESLint (`braces` / `micromatch` / `fast-glob`); no se aplicó una degradación forzada de Next.js para silenciarlas.
