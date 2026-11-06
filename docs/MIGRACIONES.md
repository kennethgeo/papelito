# Migraciones de base de datos

Papelito usa una sola base Neon PostgreSQL (proyecto exclusivo, ver `README.md`). Los archivos SQL están en `neon/migrations/` y solo se aplican con `npm run db:migrate`, que usa `DATABASE_URL_UNPOOLED` (conexión directa) y valida antes que el destino sea el proyecto, la rama y el host autorizados.

## Cómo decide `db:migrate`

1. **Esquema histórico (hasta el 18 de octubre).** `scripts/db-migrate.mjs` detecta el estado por tablas y columnas, no por un registro: base vacía → `20261016_init_papelito_neon.sql`; esquema anterior → `20261017_retention_and_lifecycle.sql`; después aplica las ampliaciones aditivas `20261018_social_and_reminders.sql` y `20261018_z_selected_features.sql` cuando faltan sus tablas o columnas. Si todo está presente, no hace nada. Nunca ejecuta `DROP`, `TRUNCATE` ni `DELETE` sobre datos.
2. **Migraciones versionadas (desde el 2 de noviembre).** `VERSIONED_MIGRATIONS` lista cada archivo nuevo con las columnas que debe dejar. La tabla `papelito_schema_migrations (name, sha256, applied_at)` registra lo aplicado. Cada migración corre en su propia transacción: si falla o no deja las columnas esperadas, se revierte completa y no se registra.
3. **Archivos inmutables.** Si un archivo ya aplicado cambió (SHA-256 distinto), `db:migrate` se detiene sin tocar nada. Para corregir algo se crea una migración nueva.

Para agregar una migración: crear `neon/migrations/AAAAMMDD_descripcion.sql` aditiva y compatible con PGlite, añadirla al final de `VERSIONED_MIGRATIONS` con sus columnas esperadas y ejecutar las suites (`test:backend`, `test:journey`, `test:lifecycle` y `test:hardening` aplican todos los archivos en orden; `test:concurrency` usa PostgreSQL real).

## `20261102_idempotency_and_limits.sql`

| | |
| --- | --- |
| Cambios | Columnas `client_request_id uuid` (nulas) en `exchanges` y `wishes`; índices únicos parciales `uq_exchanges_client_request (organizer_id, client_request_id)` y `uq_wishes_client_request (user_id, client_request_id)` con `WHERE client_request_id IS NOT NULL`; índices `idx_wishes_user (user_id)` e `idx_exchanges_organizer_status (organizer_id, status)` |
| Datos existentes | No se modifican: las filas actuales quedan con `NULL`, que los índices parciales ignoran |
| Para qué | Reintentar la misma creación (respuesta de red incierta) devuelve el intercambio o deseo ya creado en vez de duplicarlo; los índices sirven a los cupos (20 intercambios activos por organizador, 100 deseos por persona) |
| Bloqueos | `CREATE INDEX` sin `CONCURRENTLY` (no se permite dentro de una transacción): bloquea escrituras en `exchanges` y `wishes` mientras se construye. Con el volumen del piloto dura milisegundos |

### Orden (obligatorio)

El código de esta versión escribe `client_request_id`. **Si se publica antes de migrar, crear intercambios y deseos falla.** Como fusionar en `main` publica automáticamente, el orden es:

1. Crear un punto de recuperación en Neon (rama o instantánea de `production`).
2. `npm run db:migrate` contra producción. Debe mostrar `20261102_idempotency_and_limits.sql` como aplicada.
3. Repetir `npm run db:migrate`: debe informar que las migraciones versionadas están al día (comprueba el registro).
4. Fusionar el PR; `deploy-web` publica después de `verify`.

La migración es compatible con el código anterior (lo ignora), así que entre los pasos 2 y 4 producción sigue funcionando sin cambios.

### Recuperación

- **Falla durante la migración:** la transacción se revierte y no queda nada aplicado ni registrado. Corregir la causa (conexión, permisos) y repetir.
- **Hay que revertir el código:** no hace falta tocar la base; la versión anterior no usa las columnas nuevas. Usar `wrangler rollback` como indica `docs/OPERACION.md`.
- **Hay que revertir el esquema (solo en emergencia, y después de revertir el código a una versión que no use estas columnas):**

  ```sql
  BEGIN;
  DROP INDEX IF EXISTS uq_exchanges_client_request, uq_wishes_client_request, idx_wishes_user, idx_exchanges_organizer_status;
  ALTER TABLE exchanges DROP COLUMN IF EXISTS client_request_id;
  ALTER TABLE wishes DROP COLUMN IF EXISTS client_request_id;
  DELETE FROM papelito_schema_migrations WHERE name = '20261102_idempotency_and_limits.sql';
  COMMIT;
  ```

  Solo se pierden los identificadores de reintento; ningún intercambio ni deseo.
- **Daño inesperado de datos:** restaurar desde el punto de recuperación del paso 1. No borrar ni rotar secretos durante la recuperación.

No hay migraciones nuevas para el resto de las correcciones de esta entrega (sesiones, errores, recordatorios, CSP): no cambian el esquema.


## `20261106_organization.sql`

Añade las tablas `exchange_organization`, `exchange_attendance` y `exchange_waitlist`, y las columnas `memberships.rules_read_version` y `memberships.rules_read_at`. Sus registros se eliminan en cascada con la membresía o el intercambio. La migración es aditiva, idempotente y compatible con la versión anterior de la app; no cambia aprobaciones ni asignaciones existentes. Se aplica y registra antes de publicar el código que la utiliza. Los índices y columnas no contienen datos de terceros ni recursos de otras aplicaciones.

El esquema histórico de 24 tablas se verifica antes de las migraciones versionadas; el esquema completo pasa a 27 tablas de aplicación, además del registro administrativo. Tras aplicar la migración se verifica también el esquema completo. Revertir el código no requiere borrar estas tablas ni sus datos.
