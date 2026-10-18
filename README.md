# Papelito — Amigo secreto (PWA)

Aplicación web progresiva en español diseñada para organizar intercambios de regalos (amigos secretos) en Costa Rica, con estética festiva propia, asignaciones privadas atómicas, temas por ocasión y listas de deseos seleccionables.

[![CI](https://github.com/kennethgeo/papelito/actions/workflows/ci.yml/badge.svg)](https://github.com/kennethgeo/papelito/actions/workflows/ci.yml)

**Estado: integración con Neon y despliegue en Netlify.** Se comprobaron las 12 tablas en PostgreSQL 18, el acceso real con Google y correo/contraseña, la sesión al recargar, deseos, invitaciones y cierre de sesión. Los informes de [Neon](NEON_VERIFICACION.md) y [acceso por correo](ACCESO_VERIFICACION.md) detallan las pruebas y sus límites. [papelitocr.netlify.app](https://papelitocr.netlify.app) está vinculado a este repositorio, con las cuatro variables del backend guardadas como secretos de producción y su dominio autorizado en Neon Auth. La configuración actual del titular indica producción pública y previews privados. Las credenciales propias de Google para producción, la prueba de entrega de correos y la identidad/contacto de los borradores legales siguen pendientes.

Para probar la demo con **Node.js 24**:

```bash
npm ci
npm run dev -- --hostname 127.0.0.1 --port 3040
```

Abrí [la demo local](http://127.0.0.1:3040/?mode=demo). Funciona con datos de ejemplo y sin credenciales. Para habilitar cuentas y persistencia real, seguí la guía de conexión y completá las variables de `.env.example` en un archivo `.env.local` privado.

---

## 1. Arquitectura técnica

- **Frontend & Server:** Next.js 16 (App Router + Turbopack), React 19, TypeScript en modo estricto.
- **Estilos:** CSS propio con variables de diseño, mobile-first desde 320 px, safe-areas de pantalla y tipografías autoalojadas con licencia abierta (`Bricolage Grotesque` y `Source Sans 3` bajo SIL OFL 1.1).
- **Firma visual:** Papelito, con ilustraciones vectoriales propias de sobres y notas, paleta ciruela `#46245D`, violeta `#7043A2`, amarillo `#F7D85B`, lila `#EDE5F5`, blanco `#FFFEFC` y verde `#D8E5C5`. Ver `DIRECCION_VISUAL.md`.
- **Autenticación & Persistencia:**
  - **Neon PostgreSQL** (`@neondatabase/serverless`) exclusivo en servidor (`server-only`) con transacciones SQL explícitas (`BEGIN` / `COMMIT` / `ROLLBACK`) y bloqueos por fila (`FOR UPDATE`).
  - **Neon Auth — Managed Better Auth** (`@neondatabase/auth`) para autenticación SSR con correo y contraseña (`signIn.email`, `signUp.email`, recuperación de contraseña y verificación OTP condicional) y Google OAuth mediante petición `POST` segura (`authClient.signIn.social`). La aceptación de Términos y Consentimiento Informado se registra en base de datos una sola vez por cuenta y versión legal después de autenticarse.
  - **Autorización por fila en repositorios de servidor:** cada participante aprobado solo puede consultar su propio papelito asignado en la versión activa del sorteo y los deseos que su destinatario haya vinculado explícitamente al intercambio.
  - **Protección de tokens de invitación:** la base de datos almacena únicamente el hash SHA-256 (`token_hash`) para validación pública y el texto cifrado AES-256-GCM (`encrypted_token`) con clave derivada en servidor (`INVITATION_TOKEN_SECRET` o `NEON_AUTH_COOKIE_SECRET` de al menos 32 caracteres) para que el organizador recupere su enlace activo. Si se rota el secreto de servidor, los tokens anteriores no se descifran y el organizador puede generar un enlace nuevo desde la interfaz («Renovar enlace»).
  - No se simulan credenciales ni resultados de red: cuando las variables externas no están configuradas, la aplicación informa con honestidad y mantiene disponible el modo demostración (`/?mode=demo`).
- **Algoritmo de sorteo:** Matching bipartito máximo con caminos aumentantes (Kuhn, tiempo $O(V \cdot E)$ polinómico), verificación de imposibilidad mediante condición del matrimonio de Hall y orden aleatorio criptográfico (`crypto.randomInt`).
- **PWA:** Web App Manifest (`manifest.webmanifest`), iconos propios (SVG y PNG 192/512), `apple-touch-icon`, y Service Worker (`sw.js`) con pantalla offline (`offline.html`) que protege los datos privados impidiendo su almacenamiento en cachés públicas.

---

## 2. Comandos de desarrollo y verificación

```bash
# Ejecutar verificación estricta de tipos TypeScript
npm run type-check

# Ejecutar linter oficial ESLint 9
npm run lint

# Ejecutar pruebas unitarias del algoritmo de sorteo importando el módulo real
npm run test:draw

# Ejecutar pruebas de integración de backend contra PostgreSQL real (PGlite, NODE_ENV=test)
npm run test:backend

# Aplicar o verificar de forma segura el esquema public en Neon usando DATABASE_URL_UNPOOLED
npm run db:migrate

# Probar conectividad real, esquema y CRUD transaccional con ROLLBACK en Neon (sin dejar filas residuales)
npm run test:neon

# Compilación de producción con Turbopack y Partial Prerendering
npm run build
```

---

## 3. Esquema SQL en Neon PostgreSQL

La migración oficial de producción para Neon PostgreSQL se encuentra en:
`neon/migrations/20261016_init_papelito_neon.sql`

*(La migración inicial de referencia histórica de Supabase se conserva en `supabase/migrations/` únicamente como archivo documental pasivo).*

Tablas incluidas en `neon/migrations/20261016_init_papelito_neon.sql`:
- `profiles`: perfil público (`user_id` de texto compatible con Better Auth, `alias`, `full_name`, `avatar_color`).
- `consent_records`: bitácora auditable de aceptación y revocación (`revoked_at`) de términos y privacidad con versión explícita.
- `exchanges`: grupos de intercambio con fechas, cierre de inscripción evaluado en zona horaria `America/Costa_Rica`, presupuesto, moneda (`CRC`/`USD`), tema y `current_draw_version`.
- `invitations`: enlaces criptográficos sin texto plano (`token_hash` SHA-256 + `encrypted_token` AES-256-GCM), revocación (`revoked_at`), expiración y control atómico de cupos (`use_count` / `max_uses`).
- `memberships`: participantes por intercambio (`pending`, `approved`, `rejected`) y bandera `is_organizer`.
- `exclusions`: restricciones direccionales configuradas por el organizador entre miembros aprobados antes del sorteo.
- `draw_versions` y `assignments`: historial versionado de sorteos y pares protegidos (`giver_id` $\neq$ `receiver_id`, biyección garantizada).
- `wishes`, `wish_selections` y `gift_purchases`: deseos personales, selección explícita por evento y reserva confidencial por parte del donante asignado.
- `privacy_requests`: solicitudes de exportación o eliminación de datos (derechos ARCO).

---

## 4. Guía de conexión: Neon CLI + Migración + Google OAuth + Netlify

> **Regla de aislamiento:** Este repositorio está vinculado mediante `.neon`, `neon.ts` y `EXPECTED_NEON_CONFIG` exclusivamente al proyecto dedicado de **Papelito** en Neon (`org-solitary-voice-24830396` / `spring-frog-51248337`, AWS PostgreSQL 18 `free_v3`, rama `production` `br-royal-tooth-b4ru7kif`, endpoint directo `ep-frosty-hall-b42n8gmw.c-6.us-east-2.aws.neon.tech`, base `neondb`). No reutilices ni conectes bases de datos de otras aplicaciones.

### Paso 1: Provisionar servicios con Neon CLI y aplicar migración
El repositorio incluye `neon.ts` (`auth: true`). El vínculo `.neon` es local y está excluido de Git. En una copia nueva del repositorio, después de autenticar la CLI, ejecuta `neon link --org-id org-solitary-voice-24830396 --project-id spring-frog-51248337 --branch production -y` para crear ese vínculo y descargar las variables privadas.

1. Autentica la CLI oficial de Neon en tu máquina:
   ```bash
   neon login
   ```
2. Provisiona los servicios declarados en `neon.ts` (`postgres` y `auth`) y sincroniza las variables en `.env.local`:
   ```bash
   neon deploy
   ```
3. Revisa tu archivo `.env.local` (basándote en `.env.example`) y asegúrate de definir:
   - `DATABASE_URL`: conexión **pooled** (`ep-frosty-hall-b42n8gmw-pooler.c-6.us-east-2.aws.neon.tech/neondb`) para el runtime de la aplicación.
   - `DATABASE_URL_UNPOOLED`: conexión **directa** (`ep-frosty-hall-b42n8gmw.c-6.us-east-2.aws.neon.tech/neondb`, sin `-pooler`) requerida para migraciones DDL.
   - `NEON_AUTH_BASE_URL`: URL base de Neon Auth (Managed Better Auth).
   - `NEON_AUTH_COOKIE_SECRET`: secreto aleatorio de al menos 32 caracteres (`openssl rand -hex 32`).
   - `INVITATION_TOKEN_SECRET`: secreto aleatorio de al menos 32 caracteres para el cifrado de tokens de invitación en servidor (`openssl rand -hex 32`).
4. Ejecuta la migración verificada sobre Neon:
   ```bash
   npm run db:migrate
   ```
   - Verifica que `.neon` apunte exactamente al proyecto y rama autorizados de Papelito y valida que tanto `DATABASE_URL` como `DATABASE_URL_UNPOOLED` correspondan exclusivamente al host directo `ep-frosty-hall-b42n8gmw.c-6.us-east-2.aws.neon.tech` y base `neondb`, rechazando esquemas `public` ajenos o parciales.
   - Si `public` está vacío, aplica `neon/migrations/20261016_init_papelito_neon.sql` dentro de una transacción; si existe el esquema anterior, aplica `20261017_retention_and_lifecycle.sql`; si las 12 tablas ya tienen sus columnas esperadas, realiza `no-op` sin ejecutar `DROP`, `TRUNCATE` ni `DELETE`.
5. Verifica la conectividad real y el esquema con la prueba transaccional no destructiva:
   ```bash
   npm run test:neon
   ```
   - Reutiliza `validateMigrationUrls` antes de cualquier consulta para exigir el par `DATABASE_URL` / `DATABASE_URL_UNPOOLED` del endpoint autorizado, usa el cliente real (`src/lib/db/client.ts`), ejecuta operaciones CRUD de `profiles` y `wishes` dentro de `dbTransaction`, fuerza `ROLLBACK` y comprueba `0` filas residuales para sus UUID de prueba. *(Nota: esta prueba valida SQL y transacciones en Neon; no sustituye la prueba E2E interactiva de Google OAuth en navegador).*

### Paso 2: Google OAuth propio — configurado

El proyecto independiente de Google Cloud es `papelito-costa-rica`, con audiencia externa en producción y cliente web «Papelito Web». El ID y el secreto están guardados en Neon Auth, fuera del repositorio. El callback autorizado es exactamente:

```text
<NEON_AUTH_BASE_URL>/callback/google
```

Este flujo usa redirección de servidor; no necesita agregar orígenes JavaScript del navegador. Los destinos de regreso de la app se autorizan por separado en Neon Auth: `http://127.0.0.1:3040`, `http://localhost:3040` y `https://papelitocr.netlify.app`. Al añadir un dominio propio, actualizar sus destinos exactos y la marca de Google; no usar comodines. Google puede mostrar `neon.tech` por el host del callback: publicar la audiencia no equivale a verificar una marca con dominio propio.

La recuperación por enlace y la verificación obligatoria por OTP se probaron con entrega real confirmada por el titular. El remitente propio se deja pendiente por su decisión; actualmente se usa el proveedor compartido de Neon.

### Paso 3: Configuración del despliegue en Netlify
El proyecto incluye `netlify.toml` preconfigurado con Node 24, servidor Next.js (SSR/App Router, sin export estático), cabeceras de seguridad y `Cache-Control: no-store` para `/api/*`, `/auth/*` y `/unirse/*`.
1. Conecta el repositorio en **Netlify** (`Add new site -> Import an existing project`).
2. En **Site configuration -> Environment variables**, define:
   - `DATABASE_URL`: cadena de conexión PostgreSQL **pooled** (`-pooler`) de Neon para el runtime.
   - `DATABASE_URL_UNPOOLED`: cadena de conexión PostgreSQL **directa** (sin `-pooler`) si ejecutas migraciones desde CI/CD.
   - `NEON_AUTH_BASE_URL`: URL base de Neon Auth.
   - `NEON_AUTH_COOKIE_SECRET`: secreto aleatorio de al menos 32 caracteres (`openssl rand -hex 32`).
   - `INVITATION_TOKEN_SECRET`: secreto aleatorio de al menos 32 caracteres para el cifrado de tokens de invitación en servidor (`openssl rand -hex 32`).
   - `NEXT_PUBLIC_APP_URL`: URL pública HTTPS de tu sitio en Netlify (ej. `https://papelito-cr.netlify.app`).
3. Ejecuta el despliegue (`npm run build`).

---

## 5. Textos legales y privacidad (Costa Rica — Ley N.° 8968)

La aplicación incluye borradores funcionales informativos accesibles públicamente en `/terminos`, `/privacidad`, `/consentimiento` y `/almacenamiento`, diseñados bajo los principios de separación de consentimiento, minimización de datos y derechos ARCO en Costa Rica. Antes de operar públicamente con usuarios reales, el titular del despliegue debe completar la identidad jurídica y el domicilio del responsable y revisar los textos. El nombre público es Papelito Costa Rica y el correo de soporte/privacidad es kennethgeo97@gmail.com. La configuración está en `src/lib/legal/constants.ts`. Estos textos constituyen borradores operativos y no representan una certificación legal.

## Operación de privacidad y retención

El organizador puede finalizar un intercambio sorteado, cancelar uno activo o transferir la organización a otro participante aprobado. El cierre revoca invitaciones y registra `closed_at`. Una Scheduled Function privada de Netlify, `retention-cleanup`, elimina diariamente los grupos cerrados hace 12 meses (meses calendario), junto con sus datos dependientes. Las cuentas y listas personales tienen un ciclo separado. No hay un endpoint HTTP público para ejecutar esta tarea. Se puede comprobar desde Functions → retention-cleanup → Run now.

La solicitud de baja en Mi cuenta exige un ingreso en los últimos 15 minutos, frase y confirmación expresa. La pantalla explica y pide autorización antes de transferir grupos activos o cancelar grupos sin otros aprobados. **Registrar una solicitud no borra inmediatamente la cuenta:** el operador debe revisar y procesar las solicitudes dentro del plazo indicado en la política.

```bash
npm run privacy:delete -- --list
npm run privacy:delete -- --request-id UUID
npm run privacy:delete -- --request-id UUID --execute
```

El segundo comando simula sin cambios. El tercero borra primero el usuario y sus sesiones mediante la CLI oficial de Neon; confirma su ausencia y elimina sus datos de la app en una transacción. Requiere `neon login` vigente y las variables locales de la base exclusiva de Papelito. Un fallo de Auth conserva la solicitud y los datos. Si Auth se eliminó pero falla la transacción posterior, se puede reintentar el mismo request-id. Una solicitud antigua que todavía organiza grupos activos con terceros se bloquea: revisar su impacto y transferir primero, o añadir `--confirm-organizer-transfer` de manera consciente.

Los sorteos activos afectados por una baja se invalidan y se borran sus asignaciones; las otras personas conservan sus cuentas. El nuevo organizador debe repetir el sorteo con un motivo registrado. No se escriben ni se borran usuarios de `neon_auth` mediante SQL.

Ver la evidencia y los límites de la comprobación en [CIERRE_FUNCIONAL_VERIFICACION.md](CIERRE_FUNCIONAL_VERIFICACION.md). `npm run test:lifecycle` cubre cierre, permisos, transferencia, reintentos de baja y retención con PostgreSQL aislado, además de las pruebas existentes.

## Preparación del piloto festivo

La creación usa dos pasos y fechas dinámicas. La app agrupa sus lecturas, actualiza al volver o recuperar conexión y permite compartir cada deseo en intercambios específicos. La PWA ofrece ayuda de instalación y actualización sin cachear información privada.

```bash
npm run test:ux
npm run test:journey
npm run test:pwa
npm run build
npx playwright install chromium
npm run test:e2e
```

Las pruebas de navegador arrancan una instancia de producción separada en 3041 sin conexión a servicios reales. Cubren escritorio y teléfonos emulados de 320/390 px. El recorrido de cuatro participantes usa repositorios reales sobre PostgreSQL aislado; la prueba SQL de Neon continúa disponible por separado con rollback. Ver alcance, resultados y la comprobación adicional de Auth que requiere autorización en [MEJORAS_PILOTO.md](MEJORAS_PILOTO.md). El piloto con personas y teléfonos físicos lo realiza el titular.
