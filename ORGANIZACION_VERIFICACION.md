# Organización del piloto

Entrega iniciada el 19 de octubre y retomada el 6 de noviembre de 2026. Selección expresa del titular: asistencia, lista de espera y reglas (17, 18 y 20 del registro de pendientes).

## Comportamiento

- La asistencia es independiente del intercambio: `Voy`, `Tal vez` o `No voy`. Cambiarla no elimina membresías ni asignaciones. Se puede modificar hasta que el intercambio finalice o se cancele. El organizador ve respuestas individuales; los demás participantes aprobados ven totales y las respuestas propias y de familiares que representan.
- La capacidad se configura entre 3 y 100 personas, contando cada familiar representado. Los grupos existentes conservan sus aprobaciones. No se puede bajar la capacidad por debajo del número ya aprobado. La capacidad predeterminada de 100 coincide con el límite del algoritmo.
- Al llenarse los lugares, las solicitudes pendientes entran en espera. El orden usa la fecha de llegada y un identificador como desempate estable. Una persona pendiente solo ve su posición y las reglas, sin la cola de otras personas, la asistencia ni el listado del grupo. El organizador aprueba al siguiente cuando hay espacio; aumentar la capacidad no aprueba automáticamente a nadie.
- Las invitaciones y las aprobaciones respetan el mismo bloqueo de la fila del intercambio. No se salta la cola aprobando otra solicitud desde la pantalla anterior. Rechazar a un adulto también rechaza a sus familiares y retira sus registros de asistencia/espera; un familiar no puede aprobarse sin su adulto aprobado.
- Una persona en espera puede retirar su solicitud con confirmación. Su membresía queda rechazada; si vuelve a querer participar, necesita que el organizador la habilite respetando la capacidad y el orden vigente. Un adulto puede quitar a un familiar desde Personas a mi cargo antes del sorteo.
- Las reglas admiten hasta 1500 caracteres y se muestran como texto. Son visibles para miembros aprobados o pendientes. Se pueden cambiar mientras la inscripción está abierta; después del sorteo quedan cerradas. La lectura es una marca opcional por versión, sin efecto sobre los T&C de la app ni bloqueo del sorteo.
- La configuración usa una revisión para rechazar cambios basados en una versión anterior. Las actualizaciones conservan los borradores del editor; descartarlos requiere pulsar el control que lo indica.
- No se copian estas configuraciones a una nueva edición de forma implícita. No se añaden avisos push ni correos automáticos a estos cambios. El piloto con teléfonos físicos continúa a cargo del titular.

## Persistencia y privacidad

Migración aditiva `neon/migrations/20261106_organization.sql`: tres tablas (`exchange_organization`, `exchange_attendance`, `exchange_waitlist`) y dos columnas de lectura en membresías. Total esperado: 27 tablas de aplicación.

Se incluyen las respuestas, posiciones registradas y lecturas propias/de familiares en la exportación personal; las configuraciones de los intercambios que la cuenta organiza también se exportan. Los datos nuevos se eliminan en cascada con la membresía, el intercambio o la cuenta. La retención existente del intercambio sigue aplicando. No se recopilan direcciones, ubicación ni datos nuevos de identidad.

El registro administrativo `papelito_schema_migrations` se conserva y se usa mediante el sistema versionado vigente del repositorio. La nueva migración se añade después de `20261102_idempotency_and_limits.sql`; se registra con SHA-256 y se ejecuta en su propia transacción. La validación del esquema histórico se mantiene separada de las ampliaciones versionadas. La prueba descartable conserva el registro y sigue rechazando cualquier tabla ajena.

## Verificación

- `npm run test:organization`: integración con PostgreSQL/PGlite y repositorios reales. Comprueba cupos, cola, orden, permisos, familias, asistencia, cambios de versión, sorteo intacto, exportación y cascadas.
- `npm run test:backend`: conserva las pruebas vigentes del registro versionado y del rechazo de tablas de otras aplicaciones.
- `npm run test:e2e`: 51 casos en escritorio, 390 px y 320 px; la prueba de organización verifica guardado, lectura opcional, asistencia y persistencia al recargar. La misma suite se ejecuta sobre workerd.
- `npm run test:neon:e2e -- --sanitized-clone`: prepara una rama descartable, vacía sus datos de aplicación antes de iniciar y elimina la rama al terminar. Prueba reglas, borrador, tres cupos, cuarta persona en espera, ampliación a cuatro y promoción, junto con el recorrido completo anterior.

Las pruebas de navegador no sustituyen el piloto del titular ni afirman compatibilidad universal con todos los teléfonos.

## Resultado de la verificación local y remota

Antes de integrar main, el 6 de noviembre de 2026 pasaron build, type-check, lint, las suites de repositorios y las 18 pruebas de interfaz de la base anterior. El recorrido real con Neon terminó con `1 passed (2.4m)` y eliminó la rama `br-cold-hill-b4jqk1zy` junto con sus cuentas ficticias. La primera rama de diagnóstico también se eliminó tras detenerse por el registro administrativo no reconocido; la integración conserva el registro versionado vigente sin flexibilizar la protección frente a tablas de otras aplicaciones.


## Integración con la versión vigente

Al retomar se detectó que main había avanzado hasta `d5bb9ff` y que el sitio público es `https://papelitocr.pages.dev`, con despliegue del Worker tras CI. Se integraron las mejoras de esa versión en vez de restaurar Netlify o sustituir su diseño. Las verificaciones anteriores sobre el código de octubre se distinguen de las verificaciones finales del código integrado. La migración inicial era aditiva y se aplicó antes de esta integración; al registrarse como `20261106_organization.sql`, sus cláusulas `IF NOT EXISTS` conservan los objetos y datos ya presentes.

En el código integrado pasaron las compilaciones de Next y Workers; tipos y lint; organización, backend, recorrido, funciones seleccionadas, social, ciclo de vida, endurecimiento (28 grupos), conexiones de Workers, tablero y PWA. Pasaron 51 casos de navegador en Next y 51 en workerd. También pasó `test:workerd`, incluidos los estados de servicios caídos y el transporte push con destino ficticio. Se corrigió la etiqueta del editor de reglas para que conserve su nombre accesible tras guardar. Los servidores locales de workerd desactivan la carga automática de `.env` y variables heredadas para aislar los escenarios de las credenciales del equipo.

En producción, `db:migrate` registró la migración nueva, una segunda ejecución no hizo cambios y `test:neon` verificó 27/27 tablas y CRUD con rollback sin filas residuales. La concurrencia PostgreSQL se omite localmente por falta de binarios; CI la ejecuta de forma obligatoria en Ubuntu.
