# Papelito — Amigo secreto (PWA)

Aplicación web progresiva en español diseñada para organizar intercambios de regalos (amigos secretos) en Costa Rica, con estética festiva propia, asignaciones privadas atómicas, temas por ocasión y listas de deseos seleccionables.

[![CI](https://github.com/kennethgeo/papelito/actions/workflows/ci.yml/badge.svg)](https://github.com/kennethgeo/papelito/actions/workflows/ci.yml)

**Estado: en desarrollo.** El código y las pruebas locales están disponibles; el acceso real con Google, Neon y el despliegue en Netlify requieren configuración y validación externa. Los documentos legales son borradores con responsable y contacto pendientes.

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
  - **Neon Auth — Managed Better Auth** (`@neondatabase/auth`) para autenticación SSR con Google OAuth mediante petición `POST` segura (`authClient.signIn.social`).
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

## 4. Guía de conexión: Neon + Google OAuth + Netlify

> **Regla de aislamiento:** Crea un proyecto y una base de datos de Neon dedicados exclusivamente a **Papelito**. No reutilices ni conectes bases de datos de otras aplicaciones.

### Paso 1: Crear base de datos y activar Neon Auth
1. En [Neon Console](https://console.neon.tech), crea un proyecto dedicado llamado `papelito` (PostgreSQL 16 o 17).
2. Abre el **SQL Editor** de Neon y ejecuta el contenido completo de `neon/migrations/20261016_init_papelito_neon.sql`.
3. Copia la cadena de conexión (`DATABASE_URL`) desde **Connection Details**.
4. En el menú lateral de Neon, entra en **Auth** y habilita **Neon Auth (Managed Better Auth)**.
5. Copia el **Auth Base URL** (`NEON_AUTH_BASE_URL`).

### Paso 2: Configurar credenciales de Google Cloud OAuth
Con Neon Auth (Managed Better Auth), Google redirige al endpoint de callback gestionado por Neon Auth, y posteriormente Neon Auth redirige de vuelta a la aplicación (`callbackURL`).
1. En [Google Cloud Console](https://console.cloud.google.com/apis/credentials), crea un **OAuth 2.0 Client ID** de tipo **Web application**.
2. En **Authorized JavaScript origins**, agrega el origen del servicio Neon Auth y los de tu aplicación:
   - `http://127.0.0.1:3040`
   - `http://localhost:3000`
   - `https://<tu-sitio>.netlify.app` (y tu dominio personalizado si aplica)
3. En **Authorized redirect URIs** de Google Cloud, agrega la URL de callback entregada por Neon Auth en tu proyecto (correspondiente a `<NEON_AUTH_BASE_URL>/callback/google`; verifica el valor exacto mostrado en **Neon Console -> Auth -> OAuth Providers -> Google**).
4. En **Neon Console -> Auth -> OAuth Providers -> Google**, pega el **Client ID** y **Client Secret** obtenidos de Google Cloud.
5. En **Neon Console -> Auth -> Configuration (Trusted Origins / Redirect URLs)**, agrega los orígenes de la aplicación (`http://127.0.0.1:3040`, `http://localhost:3000` y `https://<tu-sitio>.netlify.app`), que son los destinos válidos para `callbackURL`.

### Paso 3: Despliegue en Netlify
El proyecto incluye `netlify.toml` preconfigurado con Node 24, servidor Next.js (SSR/App Router, sin export estático), cabeceras de seguridad y `Cache-Control: no-store` para `/api/*`, `/auth/*` y `/unirse/*`.
1. Conecta el repositorio en **Netlify** (`Add new site -> Import an existing project`).
2. En **Site configuration -> Environment variables**, define:
   - `DATABASE_URL`: cadena de conexión PostgreSQL de Neon.
   - `NEON_AUTH_BASE_URL`: URL base de Neon Auth.
   - `NEON_AUTH_COOKIE_SECRET`: secreto aleatorio de al menos 32 caracteres (`openssl rand -hex 32`).
   - `INVITATION_TOKEN_SECRET`: secreto aleatorio de al menos 32 caracteres para el cifrado de tokens de invitación en servidor (`openssl rand -hex 32`).
   - `NEXT_PUBLIC_APP_URL`: URL pública HTTPS de tu sitio en Netlify (ej. `https://papelito-cr.netlify.app`).
3. Ejecuta el despliegue (`npm run build`).

---

## 5. Textos legales y privacidad (Costa Rica — Ley N.° 8968)

La aplicación incluye borradores funcionales informativos accesibles públicamente en `/terminos`, `/privacidad`, `/consentimiento` y `/almacenamiento`, diseñados bajo los principios de separación de consentimiento, minimización de datos y derechos ARCO en Costa Rica. Antes de operar públicamente con usuarios reales, el titular del despliegue debe completar los datos definitivos de identificación del responsable y correo de contacto en `src/lib/legal/constants.ts` y validarlos según su operación particular (estos textos constituyen borradores operativos y no representan una certificación legal).
