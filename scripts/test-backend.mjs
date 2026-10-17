process.env.NODE_ENV = 'test';

import { register } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

register('./ts-loader.mjs', import.meta.url);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FALLO: ${message}`);
    process.exit(1);
  }
}

async function assertThrows(fn, expectedSubstring, label) {
  let threw = false;
  let errMessage = '';
  try {
    await fn();
  } catch (err) {
    threw = true;
    errMessage = err instanceof Error ? err.message : String(err);
  }
  assert(threw, `${label} debía lanzar error pero tuvo éxito`);
  if (expectedSubstring) {
    assert(
      errMessage.toLowerCase().includes(expectedSubstring.toLowerCase()),
      `${label} lanzó "${errMessage}", se esperaba que incluyera "${expectedSubstring}"`
    );
  }
}

function createMemoryCookieStore(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    get(name) {
      if (!map.has(name)) return undefined;
      return { value: map.get(name) };
    },
    set(name, value) {
      map.set(name, value);
    },
    delete(name) {
      map.delete(name);
    },
    has(name) {
      return map.has(name);
    },
  };
}

async function runTests() {
  console.log('=== Pruebas de Integración Backend Papelito (PGlite PostgreSQL + Repositorios Reales) ===');

  // 1. Inicializar PGlite en memoria y ejecutar migración SQL de Neon (sin extensión pgcrypto externa)
  const pg = new PGlite();
  const migrationPath = path.join(rootDir, 'neon', 'migrations', '20261016_init_papelito_neon.sql');
  const migrationSql = fs.readFileSync(migrationPath, 'utf8');
  assert(!migrationSql.includes('CREATE EXTENSION'), 'La migración no debe requerir CREATE EXTENSION pgcrypto');
  await pg.exec(migrationSql);
  await pg.exec(fs.readFileSync(path.join(rootDir, 'neon/migrations/20261017_retention_and_lifecycle.sql'), 'utf8'));
  console.log('✓ 1. Esquema SQL de Neon ejecutado limpiamente en PostgreSQL (PGlite, gen_random_uuid nativo)');

  // 2. Verificar guardia NODE_ENV==='test' en setTestDbAdapter e inyectar adaptador PGlite
  const { setTestDbAdapter, dbQuery } = await import('../src/lib/db/client.ts');
  process.env.NODE_ENV = 'production';
  await assertThrows(
    () => setTestDbAdapter({ async query() { return { rows: [], rowCount: 0 }; } }),
    'NODE_ENV === "test"',
    'Bloqueo de setTestDbAdapter fuera de NODE_ENV=test'
  );
  process.env.NODE_ENV = 'test';

  setTestDbAdapter({
    async query(text, params = []) {
      const res = await pg.query(text, params);
      return {
        rows: res.rows,
        rowCount: res.rows.length > 0 ? res.rows.length : (res.affectedRows ?? 0),
      };
    },
  });

  // Importar repositorios reales, flujo de consentimiento y constantes
  const { LEGAL_CONSTANTS } = await import('../src/lib/legal/constants.ts');
  const {
    PENDING_CONSENT_COOKIE,
    formatPendingConsentCookieValue,
    consumePendingConsentIntent,
    revokeConsentAndClearCookie,
  } = await import('../src/lib/legal/consent-flow.ts');
  const {
    getOrCreateProfile,
    updateProfileAlias,
    recordConsent,
    getLatestConsentStatus,
    submitPrivacyRequest,
    exportUserData,
  } = await import('../src/lib/repositories/profiles.ts');
  const {
    createExchangeWithInvitation,
    getMyExchanges,
    getExchangeDetails,
    regenerateExchangeInvitation,
    updateExchangeTheme,
    manageMemberStatus,
    setExchangeExclusions,
    getInvitationPreview,
    acceptInvitationAtomic,
  } = await import('../src/lib/repositories/exchanges.ts');
  const { executeAndCommitDraw } = await import('../src/lib/repositories/draw.ts');
  const {
    getMyWishes,
    saveWish,
    toggleWishInExchange,
  } = await import('../src/lib/repositories/wishes.ts');
  const {
    getMyAssignment,
    revealAssignment,
    toggleWishPurchase,
  } = await import('../src/lib/repositories/assignments.ts');

  // 3. Crear perfiles e identidades de prueba (A=Organizador, B=Miembro, C=Miembro, D=Pendiente, E=Rechazado, F=Externo)
  const userA = 'user_org_a';
  const userB = 'user_mem_b';
  const userC = 'user_mem_c';
  const userD = 'user_pen_d';
  const userE = 'user_rej_e';
  const userF = 'user_out_f';

  await getOrCreateProfile(userA, 'ana@example.com', 'Ana Organizadora', '#C83E37');
  await getOrCreateProfile(userB, 'bruno@example.com', 'Bruno Miembro', '#1F6A52');
  await getOrCreateProfile(userC, 'clara@example.com', 'Clara Miembro', '#46245D');
  await getOrCreateProfile(userD, 'diego@example.com', 'Diego Pendiente', '#9B6B15');
  await getOrCreateProfile(userE, 'elena@example.com', 'Elena Rechazada', '#24527A');
  await getOrCreateProfile(userF, 'felipe@example.com', 'Felipe Externo', '#7A3E24');

  await updateProfileAlias(userA, 'Anita');
  const profA = await getOrCreateProfile(userA, 'ana@example.com', 'Ana Organizadora');
  assert(profA.alias === 'Anita', 'El alias actualizado debe persistir');

  await assertThrows(
    () => updateProfileAlias(userA, 'X'),
    'entre 2 y 40',
    'Validación de alias corto'
  );

  // 4. Regresión de flujo completo de consentimiento (Punto 1 de CIERRE_REPOSITORIO_PAPELITO.md)
  // Verificar que src/app/page.tsx NO escriba consentimientos en GET/render
  const pageSource = fs.readFileSync(path.join(rootDir, 'src', 'app', 'page.tsx'), 'utf8');
  assert(
    !pageSource.includes('recordConsent') && !pageSource.includes('papelito_pending_consent'),
    'HomeContent en src/app/page.tsx no debe escribir consentimientos ni consumir cookies durante render GET'
  );

  const initialConsent = await getLatestConsentStatus(userA);
  assert(initialConsent.hasCurrentConsent === false, 'Sin registro previo no hay consentimiento activo');

  await assertThrows(
    () => recordConsent(userA, '0.9.0-falsa', '0.9.0-falsa', '127.0.0.1', 'test-agent'),
    'Versión legal inválida',
    'Rechazo de versión legal manipulada'
  );

  // Simular flujo real: marcar casillas -> cookie con timestamp t1 -> retorno OAuth consume cookie una sola vez en POST
  const t1 = Date.now() - 5000;
  const cookieStore = createMemoryCookieStore({
    [PENDING_CONSENT_COOKIE]: formatPendingConsentCookieValue(LEGAL_CONSTANTS.VERSION, t1),
  });

  const consumed1 = await consumePendingConsentIntent(userA, cookieStore, Date.now());
  assert(consumed1.hasCurrentConsent === true, 'El intento pendiente válido debe registrar el consentimiento');
  assert(
    !cookieStore.has(PENDING_CONSENT_COOKIE),
    'consumePendingConsentIntent debe eliminar la cookie inmediatamente tras consumirla'
  );

  // Si la cookie volviera a enviarse mientras ya tiene consentimiento vigente, igual debe limpiarse
  cookieStore.set(PENDING_CONSENT_COOKIE, formatPendingConsentCookieValue(LEGAL_CONSTANTS.VERSION, t1));
  const consumedWhileActive = await consumePendingConsentIntent(userA, cookieStore, Date.now());
  assert(consumedWhileActive.hasCurrentConsent === true, 'El consentimiento sigue activo');
  assert(
    !cookieStore.has(PENDING_CONSENT_COOKIE),
    'consumePendingConsentIntent debe limpiar la cookie incluso si ya existía consentimiento vigente'
  );

  // Ahora la usuaria revoca su consentimiento: debe revocar en BD y borrar cualquier cookie pendiente
  cookieStore.set(PENDING_CONSENT_COOKIE, formatPendingConsentCookieValue(LEGAL_CONSTANTS.VERSION, t1));
  await revokeConsentAndClearCookie(userA, cookieStore);
  assert(!cookieStore.has(PENDING_CONSENT_COOKIE), 'revokeConsentAndClearCookie debe borrar la cookie pendiente');
  const afterRevoke = await getLatestConsentStatus(userA);
  assert(afterRevoke.hasCurrentConsent === false && Boolean(afterRevoke.revokedAt), 'El consentimiento debe quedar revocado');

  // Regresión crítica: si una cookie antigua (emitida en t1, antes de revoked_at) se reenvía antes de 600s,
  // NO debe reotorgar el consentimiento revocado y debe eliminarse.
  cookieStore.set(PENDING_CONSENT_COOKIE, formatPendingConsentCookieValue(LEGAL_CONSTANTS.VERSION, t1));
  const replayOldCookie = await consumePendingConsentIntent(userA, cookieStore, Date.now());
  assert(
    replayOldCookie.hasCurrentConsent === false,
    'Una cookie con timestamp anterior o igual a la revocación NO debe reactivar el consentimiento'
  );
  assert(!cookieStore.has(PENDING_CONSENT_COOKIE), 'La cookie antigua rechazada también debe eliminarse');

  // Un nuevo intento explícito posterior a la revocación (t2 > revoked_at) sí debe otorgar consentimiento
  const revokedAtMs = new Date(afterRevoke.revokedAt).getTime();
  const t2 = Math.max(Date.now(), revokedAtMs + 1000);
  cookieStore.set(PENDING_CONSENT_COOKIE, formatPendingConsentCookieValue(LEGAL_CONSTANTS.VERSION, t2));
  const freshReconsent = await consumePendingConsentIntent(userA, cookieStore, t2 + 500);
  assert(freshReconsent.hasCurrentConsent === true, 'Un nuevo consentimiento posterior a la revocación debe activarse');
  console.log('✓ 2. Perfiles y flujo completo de consentimiento (consumo único POST, limpieza y bloqueo de cookie pre-revocación) verificados');

  // 5. Clave de invitación sin fallback público ni DATABASE_URL (Punto 2 de CIERRE_REPOSITORIO_PAPELITO.md)
  const prevInvSecret = process.env.INVITATION_TOKEN_SECRET;
  const prevAuthSecret = process.env.NEON_AUTH_COOKIE_SECRET;
  const prevDbUrl = process.env.DATABASE_URL;
  delete process.env.INVITATION_TOKEN_SECRET;
  delete process.env.NEON_AUTH_COOKIE_SECRET;
  process.env.DATABASE_URL = 'postgresql://user:pass@ep-test.us-east-1.aws.neon.tech/neondb';

  await assertThrows(
    () =>
      createExchangeWithInvitation(userA, {
        name: 'Intercambio Sin Secreto',
        description: 'Debe fallar cerrado',
        eventDate: '2027-12-24',
        registrationDeadline: '2027-12-10',
        budgetAmount: 10000,
        currency: 'CRC',
        suggestedTheme: 'navidad',
        selectedTheme: 'navidad',
        requiresApproval: false,
      }),
    'INVITATION_TOKEN_SECRET',
    'Fallo cerrado cuando no hay INVITATION_TOKEN_SECRET ni NEON_AUTH_COOKIE_SECRET (DATABASE_URL no se acepta como clave)'
  );

  if (prevDbUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = prevDbUrl;

  // Inyectar secreto explícito de prueba únicamente en este proceso
  process.env.INVITATION_TOKEN_SECRET = 'test-only-invitation-secret-key-with-at-least-32-chars-v1';

  const { exchangeId, inviteToken: firstToken } = await createExchangeWithInvitation(userA, {
    name: 'Intercambio Familiar Papelito',
    description: 'Cena de diciembre',
    eventDate: '2027-12-24',
    registrationDeadline: '2027-12-10',
    budgetAmount: 15000,
    currency: 'CRC',
    suggestedTheme: 'navidad',
    selectedTheme: 'navidad',
    requiresApproval: false,
  });

  // Verificar que el token en claro NO exista en la tabla invitations
  const rawInvRow = await dbQuery(`SELECT token_hash, encrypted_token FROM invitations WHERE exchange_id = $1`, [exchangeId]);
  assert(
    rawInvRow.rows[0].token_hash !== firstToken && !rawInvRow.rows[0].encrypted_token.includes(firstToken),
    'Hallazgo 49: La base de datos nunca debe guardar el token de invitación en texto plano'
  );

  const detailsForOrganizer = await getExchangeDetails(exchangeId, userA);
  assert(detailsForOrganizer !== null, 'Organizador debe ver detalles del intercambio');
  assert(
    detailsForOrganizer.invitationToken === firstToken,
    'Hallazgo 5: getExchangeDetails debe recuperar el token real de invitación para el organizador'
  );

  // Verificar rotación de secreto de servidor: si cambia INVITATION_TOKEN_SECRET, no promete descifrar el token viejo (devuelve null)
  // y el organizador puede regenerar un enlace nuevo con regenerateExchangeInvitation
  process.env.INVITATION_TOKEN_SECRET = 'rotated-invitation-secret-key-with-at-least-32-characters-v2';
  const detailsAfterKeyRotation = await getExchangeDetails(exchangeId, userA);
  assert(
    detailsAfterKeyRotation.invitationToken === null,
    'Tras rotar INVITATION_TOKEN_SECRET los tokens cifrados con la clave anterior no se descifran (devuelve null sin fallar)'
  );

  const { inviteToken } = await regenerateExchangeInvitation(exchangeId, userA);
  assert(inviteToken !== firstToken, 'El nuevo token regenerado debe ser distinto al anterior');
  const detailsAfterRegen = await getExchangeDetails(exchangeId, userA);
  assert(
    detailsAfterRegen.invitationToken === inviteToken,
    'Tras regenerar invitación con la nueva clave, el organizador recupera el nuevo token activo'
  );

  const oldPreview = await getInvitationPreview(firstToken);
  assert(oldPreview.valid === false && oldPreview.reason.includes('revocado'), 'El token anterior debe quedar revocado');

  const previewFromNewToken = await getInvitationPreview(inviteToken);
  assert(previewFromNewToken.valid === true, 'El nuevo token regenerado debe abrir la vista previa');
  console.log('✓ 3. Clave de invitación sin fallback público, rotación de secreto y regeneración de invitación verificadas');

  // 6. Aceptación de invitación, idempotencia de cupos (Hallazgo 6) y zona horaria Costa Rica (Hallazgos 7 y 50)
  await dbQuery(`UPDATE invitations SET max_uses = 3 WHERE exchange_id = $1 AND revoked_at IS NULL`, [exchangeId]);

  const joinB1 = await acceptInvitationAtomic(inviteToken, userB);
  assert(joinB1.status === 'approved', 'Bruno debe entrar aprobado');
  const joinB2 = await acceptInvitationAtomic(inviteToken, userB);
  assert(joinB2.status === 'approved', 'Reaceptación de Bruno debe devolver su estado actual');

  const invAfterRepeat = await dbQuery(
    `SELECT use_count FROM invitations WHERE exchange_id = $1 AND revoked_at IS NULL`,
    [exchangeId]
  );
  assert(
    invAfterRepeat.rows[0].use_count === 1,
    `Hallazgo 6: Reaceptar invitación NO debe incrementar use_count (esperado 1, actual ${invAfterRepeat.rows[0].use_count})`
  );

  // Unir a Clara (use_count = 2) y Elena (use_count = 3, llena el cupo de 3)
  await acceptInvitationAtomic(inviteToken, userC);
  await acceptInvitationAtomic(inviteToken, userE);

  // Aunque max_uses=3 está lleno, Bruno (que ya es miembro) puede volver a abrir el link sin error
  const joinB3 = await acceptInvitationAtomic(inviteToken, userB);
  assert(joinB3.status === 'approved', 'Miembro existente puede reabrir invitación aunque max_uses esté lleno');

  // Pero un usuario nuevo (Diego) debe ser rechazado por max_uses agotado
  const previewExhausted = await getInvitationPreview(inviteToken);
  assert(previewExhausted.valid === false, 'Preview debe reportar valid=false cuando use_count >= max_uses');
  await assertThrows(
    () => acceptInvitationAtomic(inviteToken, userD),
    'límite de usos',
    'Bloqueo por límite de usos agotado'
  );

  // Ampliar max_uses a 10 para probar fecha límite en zona horaria America/Costa_Rica (UTC-6)
  await dbQuery(`UPDATE invitations SET max_uses = 10 WHERE exchange_id = $1 AND revoked_at IS NULL`, [exchangeId]);

  // Fecha límite del intercambio es 2027-12-10.
  // A las 2027-12-11T03:00:00Z ya es 11 de diciembre en UTC, pero en Costa Rica son las 21:00 del 2027-12-10 -> DEBE SEGUIR ABIERTO
  const crStillOpenDate = new Date('2027-12-11T03:00:00Z');
  const previewStillOpenInCR = await getInvitationPreview(inviteToken, crStillOpenDate);
  assert(
    previewStillOpenInCR.valid === true,
    'Hallazgo 50: A las 21:00 hora Costa Rica del día límite (03:00 UTC del día siguiente) la inscripción debe seguir abierta'
  );

  // A las 2027-12-11T06:05:00Z son las 00:05 del 2027-12-11 en Costa Rica -> DEBE ESTAR CERRADO
  const crClosedDate = new Date('2027-12-11T06:05:00Z');
  const previewClosedInCR = await getInvitationPreview(inviteToken, crClosedDate);
  assert(
    previewClosedInCR.valid === false && previewClosedInCR.reason.includes('cerró'),
    'Hallazgo 7/50: Pasada la medianoche en America/Costa_Rica la vista previa debe reportar inscripción cerrada'
  );
  await assertThrows(
    () => acceptInvitationAtomic(inviteToken, userD, crClosedDate),
    'plazo de inscripción',
    'Hallazgo 7/50: acceptInvitationAtomic debe rechazar inscripciones pasadas las 23:59:59 de Costa Rica'
  );

  // Unir a Diego dentro del plazo con requires_approval = true
  await dbQuery(`UPDATE exchanges SET requires_approval = true WHERE id = $1`, [exchangeId]);
  const joinD = await acceptInvitationAtomic(inviteToken, userD, crStillOpenDate);
  assert(joinD.status === 'pending', 'Diego debe entrar como pending cuando requires_approval=true');
  console.log('✓ 4. Invitaciones: idempotencia de cupos (Hallazgo 6) y cierre en hora de Costa Rica (Hallazgos 7 y 50) verificados');

  // 7. Gestión de miembros, tema y autorizaciones (Hallazgos 6, 12 y 13)
  await assertThrows(
    () => manageMemberStatus(exchangeId, userD, 'approved', userB),
    'Solo el organizador',
    'Bloqueo de no-organizador en manageMemberStatus'
  );
  await assertThrows(
    () => manageMemberStatus(exchangeId, userA, 'rejected', userA),
    'estado del organizador',
    'Hallazgo 12: La persona organizadora no puede auto-rechazarse'
  );
  await assertThrows(
    () => manageMemberStatus(exchangeId, userF, 'approved', userA),
    'no pertenece a este intercambio',
    'Hallazgo 12: Error claro si el miembro objetivo no existe en el intercambio'
  );

  // Rechazar a Elena (queda rejected) y verificar que si reintenta aceptar invitación conserva 'rejected' y no gasta cupo
  await manageMemberStatus(exchangeId, userE, 'rejected', userA);
  const useCountBeforeRejectedRetry = (
    await dbQuery(`SELECT use_count FROM invitations WHERE exchange_id = $1 AND revoked_at IS NULL`, [exchangeId])
  ).rows[0].use_count;
  const rejectedRetry = await acceptInvitationAtomic(inviteToken, userE, crStillOpenDate);
  assert(rejectedRetry.status === 'rejected', 'Miembro rechazado que reabre invitación debe conservar estado rejected');
  const useCountAfterRejectedRetry = (
    await dbQuery(`SELECT use_count FROM invitations WHERE exchange_id = $1 AND revoked_at IS NULL`, [exchangeId])
  ).rows[0].use_count;
  assert(
    useCountBeforeRejectedRetry === useCountAfterRejectedRetry,
    'Miembro rechazado que reabre invitación no debe consumir cupo adicional'
  );

  // Cambio de tema real (Hallazgo 13)
  await assertThrows(
    () => updateExchangeTheme(exchangeId, userB, 'amistad'),
    'Solo el organizador',
    'Solo organizador puede cambiar el tema del intercambio'
  );
  await updateExchangeTheme(exchangeId, userA, 'amistad');
  const detailsAfterTheme = await getExchangeDetails(exchangeId, userB);
  assert(detailsAfterTheme.exchange.selectedTheme === 'amistad', 'El cambio de tema debe persistir en PostgreSQL');
  assert(detailsAfterTheme.invitationToken === null, 'Participante no organizador no debe recibir invitationToken');

  // Verificar conteo real de participantes aprobados en getMyExchanges (Hallazgo 13)
  const myExchangesB = await getMyExchanges(userB);
  assert(
    myExchangesB.length === 1 && myExchangesB[0].participantCount === 3,
    `getMyExchanges debe devolver participantCount=3 aprobados (actual: ${myExchangesB[0]?.participantCount})`
  );

  await assertThrows(
    () => getExchangeDetails(exchangeId, userF),
    'No tienes acceso',
    'Usuario externo no debe poder leer detalles del intercambio'
  );
  console.log('✓ 5. Gestión de miembros, preservación de estado rejected, tema y conteo real verificados');

  // 8. Reglas del sorteo, min_participants dinámico, exclusiones imposibles y expectedVersion obligatorio (Hallazgos 8 y 51)
  await assertThrows(
    () => executeAndCommitDraw(exchangeId, userB, 0),
    'Solo el organizador',
    'Bloqueo de sorteo por participante no organizador'
  );

  await assertThrows(
    () => executeAndCommitDraw(exchangeId, userA, undefined),
    'expectedVersion',
    'Hallazgo 51: expectedVersion debe ser obligatorio en executeAndCommitDraw'
  );

  // Si subimos min_participants a 4 y solo hay 3 aprobados, debe fallar respetando min_participants de la tabla
  await dbQuery(`UPDATE exchanges SET min_participants = 4 WHERE id = $1`, [exchangeId]);
  await assertThrows(
    () => executeAndCommitDraw(exchangeId, userA, 0),
    'al menos 4 participantes aprobados',
    'Hallazgo 8: executeAndCommitDraw debe respetar min_participants configurado en exchanges'
  );
  await dbQuery(`UPDATE exchanges SET min_participants = 3 WHERE id = $1`, [exchangeId]);

  // Exclusión con miembro no aprobado (Diego está pending) debe rechazarse
  await assertThrows(
    () => setExchangeExclusions(exchangeId, userA, [{ giverUserId: userA, excludedReceiverUserId: userD }]),
    'participantes aprobados',
    'Validación de membresía aprobada al configurar exclusiones'
  );

  // Exclusión imposible con 3 personas: si Ana no puede regalar a Bruno ni a Clara, no tiene a quién regalar
  await setExchangeExclusions(exchangeId, userA, [
    { giverUserId: userA, excludedReceiverUserId: userB },
    { giverUserId: userA, excludedReceiverUserId: userC },
  ]);
  await assertThrows(
    () => executeAndCommitDraw(exchangeId, userA, 0),
    'no tiene ningún destinatario posible',
    'Sorteo imposible por exclusiones debe abortar sin persistir cambios'
  );

  // Verificar que tras el fallo la versión sigue en 0 y estado inscripcion_abierta
  const exAfterFailedDraw = await getExchangeDetails(exchangeId, userA);
  assert(exAfterFailedDraw.exchange.currentDrawVersion === 0, 'Tras sorteo fallido currentDrawVersion debe seguir en 0');
  assert(exAfterFailedDraw.exchange.status === 'inscripcion_abierta', 'Tras sorteo fallido el estado debe seguir inscripcion_abierta');

  // Ahora dejamos una sola exclusión válida en grupo de 3: Ana no regala a Bruno
  // Solución única válida: Ana -> Clara, Clara -> Bruno, Bruno -> Ana
  await setExchangeExclusions(exchangeId, userA, [
    { giverUserId: userA, excludedReceiverUserId: userB },
  ]);

  const drawRes1 = await executeAndCommitDraw(exchangeId, userA, 0);
  assert(drawRes1.success === true && drawRes1.version === 1 && drawRes1.count === 3, 'Sorteo v1 debe completarse con 3 pares');

  // Verificar que manageMemberStatus real está bloqueado tras realizar el sorteo
  await assertThrows(
    () => manageMemberStatus(exchangeId, userB, 'rejected', userA),
    'una vez realizado el sorteo',
    'No se permite cambiar estado de miembros tras el sorteo mediante manageMemberStatus'
  );

  // Verificar idempotencia / bloqueo de versión obsoleta (expectedVersion = 0 cuando ya está en 1)
  await assertThrows(
    () => executeAndCommitDraw(exchangeId, userA, 0, 'Intento duplicado con versión obsoleta'),
    'Conflicto de versión',
    'Hallazgo 8/51: Protección contra doble ejecución concurrente de sorteo (expectedVersion)'
  );

  // Verificar que re-sorteo con expectedVersion=1 pero sin motivo sea rechazado
  await assertThrows(
    () => executeAndCommitDraw(exchangeId, userA, 1, 'corto'),
    'motivo válido',
    'Re-sorteo sin motivo suficiente debe rechazarse'
  );
  console.log('✓ 6. Ejecución atómica del sorteo, rollback ante imposibilidad y expectedVersion obligatorio verificados');

  // 9. Privacidad de asignaciones, membresía approved obligatoria (Punto 3), revelación (Hallazgo 9) y deseos/reservas (Hallazgo 10)
  // Clara (destinataria de Ana) crea 2 deseos, pero solo vincula 1 al intercambio
  const wishClaraLinked = await saveWish(userC, {
    title: 'Libro de edición especial',
    description: 'Tapa dura',
    url: 'https://example.com/libro',
    approximatePrice: 14000,
    currency: 'CRC',
    priority: 'alta',
  });
  const wishClaraPrivate = await saveWish(userC, {
    title: 'Deseo personal no vinculado',
    description: 'Solo en mi lista general',
    approximatePrice: 9000,
    currency: 'CRC',
    priority: 'baja',
  });

  await toggleWishInExchange(userC, exchangeId, wishClaraLinked.wishId, true);

  // Usuarios pendientes/rechazados/externos no pueden vincular deseos ni ver asignaciones ni revelar
  await assertThrows(
    () => toggleWishInExchange(userD, exchangeId, wishClaraLinked.wishId, true),
    'no pertenece a tu cuenta',
    'Bloqueo de vincular deseo ajeno'
  );
  assert((await getMyAssignment(exchangeId, userD)) === null, 'Pendiente no tiene asignación');
  assert((await getMyAssignment(exchangeId, userE)) === null, 'Rechazado no tiene asignación');
  assert((await getMyAssignment(exchangeId, userF)) === null, 'Externo no tiene asignación');

  // Hallazgo 9: revealAssignment debe lanzar error si el usuario no tiene asignación activa
  await assertThrows(
    () => revealAssignment(exchangeId, userD),
    'No tienes una asignación activa',
    'Hallazgo 9: revealAssignment debe fallar para miembro pendiente sin asignación'
  );
  await assertThrows(
    () => revealAssignment(exchangeId, userF),
    'No tienes una asignación activa',
    'Hallazgo 9: revealAssignment debe fallar para usuario externo'
  );

  // Punto 3 de CIERRE_REPOSITORIO_PAPELITO.md: Fixture de defensa en profundidad
  // Si la membresía de Bruno (quien sí tiene fila en assignments del sorteo v1) cambia a 'rejected' en BD,
  // lectura (getMyAssignment), revelación (revealAssignment), compra (toggleWishPurchase) y exportación (exportUserData)
  // deben rechazarse sin revelar pares.
  await dbQuery(`UPDATE memberships SET status = 'rejected' WHERE exchange_id = $1 AND user_id = $2`, [
    exchangeId,
    userB,
  ]);
  assert(
    (await getMyAssignment(exchangeId, userB)) === null,
    'Punto 3: getMyAssignment debe devolver null sin revelar par si la membresía ya no es approved'
  );
  await assertThrows(
    () => revealAssignment(exchangeId, userB),
    'No tienes una asignación activa',
    'Punto 3: revealAssignment debe rechazar si la membresía ya no es approved'
  );
  await assertThrows(
    () => toggleWishPurchase(exchangeId, userB, wishClaraLinked.wishId, true),
    'No tienes asignación autorizada',
    'Punto 3: toggleWishPurchase debe rechazar si la membresía ya no es approved'
  );
  const exportRejectedB = await exportUserData(userB);
  assert(
    exportRejectedB.myGiverAssignments.length === 0,
    'Punto 3: exportUserData no debe exportar asignaciones de sorteos donde la membresía no sea approved'
  );
  // Restaurar membresía de Bruno a approved tras la prueba de regresión
  await dbQuery(`UPDATE memberships SET status = 'approved' WHERE exchange_id = $1 AND user_id = $2`, [
    exchangeId,
    userB,
  ]);

  // Ana consulta su asignación: como Ana tenía excluido a Bruno, Ana debe regalarle a Clara
  const assignA = await getMyAssignment(exchangeId, userA);
  assert(assignA !== null, 'Ana debe tener asignación activa');
  assert(assignA.giverId === userA, 'El giver debe ser Ana');
  assert(assignA.receiverId === userC, 'Ana debe regalarle a Clara (única solución válida con exclusión Ana!->Bruno)');
  assert(assignA.revealed === false, 'Inicialmente revealed debe ser false');
  assert(
    assignA.wishes.length === 1 && assignA.wishes[0].id === wishClaraLinked.wishId,
    'Ana solo debe ver los deseos que Clara vinculó explícitamente a este intercambio'
  );

  // Ana revela su asignación
  await revealAssignment(exchangeId, userA);
  const assignAAfterReveal = await getMyAssignment(exchangeId, userA);
  assert(assignAAfterReveal.revealed === true && Boolean(assignAAfterReveal.revealedAt), 'Revelación debe persistir en BD');

  // Hallazgo 10: Reserva de deseos (toggleWishPurchase)
  // 1) Bruno (que le regala a Ana, NO a Clara) intenta reservar el deseo de Clara -> debe fallar
  await assertThrows(
    () => toggleWishPurchase(exchangeId, userB, wishClaraLinked.wishId, true),
    'no pertenece a la persona asignada',
    'Hallazgo 10: Bloqueo de reserva por alguien que no es el donante asignado'
  );

  // 2) Ana (donante de Clara) intenta reservar el deseo privado de Clara que NO fue seleccionado en este intercambio -> debe fallar
  await assertThrows(
    () => toggleWishPurchase(exchangeId, userA, wishClaraPrivate.wishId, true),
    'no fue seleccionado en este intercambio',
    'Hallazgo 10: Bloqueo de reserva de un deseo que no está en wish_selections del intercambio'
  );

  // 3) Ana reserva el deseo vinculado de Clara -> éxito
  const reserveRes1 = await toggleWishPurchase(exchangeId, userA, wishClaraLinked.wishId, true);
  assert(reserveRes1 === true, 'Ana debe poder reservar el deseo vinculado de su destinataria Clara');

  // Ana ve que está reservado en la vista de asignación
  const assignWithReserved = await getMyAssignment(exchangeId, userA);
  assert(assignWithReserved.wishes[0].isPurchasedByGiver === true, 'Donante ve el deseo marcado como reservado');

  // Clara consulta sus propios deseos: NO debe saber que su deseo fue reservado (sorpresa intacta)
  const claraOwnWishes = await getMyWishes(userC);
  assert(
    claraOwnWishes.every((w) => !('isPurchased' in w) && !('isPurchasedByGiver' in w)),
    'La dueña del deseo nunca debe ver si su deseo fue reservado para no arruinar la sorpresa'
  );
  console.log('✓ 7. Defensa en profundidad de membresía approved (Punto 3), revelación (Hallazgo 9) y reservas (Hallazgo 10) verificadas');

  // 10. Re-sorteo auditado (v2) preservando historial v1
  const drawRes2 = await executeAndCommitDraw(exchangeId, userA, 1, 'Ajuste auditado de prueba para verificar versión 2');
  assert(drawRes2.version === 2, 'El re-sorteo debe avanzar a versión 2');
  const runsHistory = await dbQuery(
    `SELECT version_number, invalidation_reason FROM draw_versions WHERE exchange_id = $1 ORDER BY version_number ASC`,
    [exchangeId]
  );
  assert(
    runsHistory.rows.length === 2 &&
      runsHistory.rows[0].version_number === 1 &&
      runsHistory.rows[1].version_number === 2 &&
      runsHistory.rows[1].invalidation_reason.includes('Ajuste auditado'),
    'El historial de draw_versions debe conservar v1 y registrar v2 con su motivo de invalidación'
  );
  console.log('✓ 8. Re-sorteo auditado con preservación de historial v1 -> v2 verificado');

  // 11. Exportación de datos personales y solicitudes ARCO (Hallazgo 11)
  await submitPrivacyRequest(userA, 'export', 'Solicitud de prueba');
  const exportedA = await exportUserData(userA);
  assert(exportedA.profile?.alias === 'Anita', 'Exportación incluye perfil');
  assert(exportedA.consents.length === 2, 'Exportación incluye historial de consentimientos');
  assert(exportedA.memberships.length === 1, 'Exportación incluye membresías');
  assert(exportedA.myGiftPurchases.length === 1, 'Hallazgo 11: Exportación incluye compras/reservas hechas por la usuaria');
  assert(
    exportedA.myGiverAssignments.length === 1 &&
      exportedA.myGiverAssignments[0].version_number === 2 &&
      exportedA.myGiverAssignments[0].receiver_alias === 'Clara Miembro',
    'Hallazgo 11: Exportación incluye únicamente a quién regala la usuaria en la versión vigente (v2) sin revelar quién le regala a ella'
  );
  console.log('✓ 9. Exportación completa de datos personales en versión vigente (Hallazgo 11) verificada');

  // 12. Verificación de ruta OAuth GET /auth/login/google y proxy de intercambio de verificador (Observaciones de supervisión)
  const { GET: loginGoogleGet } = await import('../src/app/auth/login/google/route.ts');
  const { proxy } = await import('../src/proxy.ts');
  const { NextRequest } = await import('next/server');
  const os = await import('node:os');

  // Caso A: Sin configurar -> redirige a /auth/unconfigured, nunca a OAuth
  const getUnconfiguredRes = await loginGoogleGet(new Request('http://127.0.0.1:3040/auth/login/google?next=/'));
  assert(
    getUnconfiguredRes.status === 307 && getUnconfiguredRes.headers.get('location')?.includes('/auth/unconfigured'),
    `GET /auth/login/google sin credenciales debe redirigir a /auth/unconfigured (status: ${getUnconfiguredRes.status})`
  );

  // Caso B: Con variables configuradas -> GET /auth/login/google devuelve 405, y proxy.ts permite invitados en / y /unirse e intercambia neon_auth_session_verifier
  const prevBaseUrl = process.env.NEON_AUTH_BASE_URL;
  process.env.NEON_AUTH_BASE_URL = 'https://ep-example.neonauth.us-east-1.aws.neon.tech/neondb/auth';
  process.env.NEON_AUTH_COOKIE_SECRET = '0123456789abcdef0123456789abcdef0123456789abcdef';
  const originalFetch = globalThis.fetch;
  try {
    const getConfiguredRes = await loginGoogleGet(new Request('http://127.0.0.1:3040/auth/login/google?next=/'));
    assert(
      getConfiguredRes.status === 405,
      `GET /auth/login/google con credenciales configuradas debe rechazar GET con HTTP 405 (recibido: ${getConfiguredRes.status})`
    );
    assert(
      getConfiguredRes.headers.get('Allow') === 'POST',
      'Respuesta 405 en /auth/login/google debe incluir cabecera Allow: POST'
    );

    // Invitados en / y /unirse/[token] no deben ser redirigidos a /auth/sign-in
    const guestHomeRes = await proxy(new NextRequest('http://127.0.0.1:3040/'));
    assert(
      guestHomeRes.status === 200 && guestHomeRes.headers.get('location') === null,
      'proxy.ts debe permitir acceso de invitados a / sin redirigir a /auth/sign-in'
    );
    const guestJoinRes = await proxy(new NextRequest('http://127.0.0.1:3040/unirse/token-prueba'));
    assert(
      guestJoinRes.status === 200 && guestJoinRes.headers.get('location') === null,
      'proxy.ts debe permitir acceso de invitados a /unirse/[token] sin redirigir a /auth/sign-in'
    );

    // Intercambio de verificador OAuth (?neon_auth_session_verifier=...) mediante getNeonAuth().middleware()
    const nowIso = new Date().toISOString();
    const expIso = new Date(Date.now() + 3600_000).toISOString();
    globalThis.fetch = async (input) => {
      const reqUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (reqUrl.includes('/get-session')) {
        return new Response(
          JSON.stringify({
            session: {
              id: 'sess_1',
              userId: 'usr_1',
              token: 'tok_123',
              createdAt: nowIso,
              updatedAt: nowIso,
              expiresAt: expIso,
            },
            user: {
              id: 'usr_1',
              email: 'ana@example.com',
              name: 'Ana',
              emailVerified: true,
              createdAt: nowIso,
              updatedAt: nowIso,
            },
          }),
          {
            status: 200,
            headers: {
              'content-type': 'application/json',
              'set-cookie': '__Secure-neon-auth.session_token=tok_123; Path=/; HttpOnly; Secure; SameSite=Lax',
            },
          }
        );
      }
      throw new Error(`Fetch inesperado en prueba de proxy: ${reqUrl}`);
    };

    const verifierReq = new NextRequest('http://127.0.0.1:3040/?neon_auth_session_verifier=verif_test_999', {
      headers: {
        cookie: '__Secure-neon-auth.session_challenge=chal_abc',
      },
    });
    const verifierRes = await proxy(verifierReq);
    const verifierLocation = verifierRes.headers.get('location') || '';
    const parsedVerifierLoc = new URL(verifierLocation, 'http://127.0.0.1:3040');
    assert(
      verifierRes.status === 307 &&
        parsedVerifierLoc.pathname === '/' &&
        !parsedVerifierLoc.searchParams.has('neon_auth_session_verifier'),
      `proxy.ts debe intercambiar el verificador OAuth y redirigir a URL limpia sin verificador (location: ${verifierLocation})`
    );
    assert(
      verifierRes.headers.getSetCookie().some((c) => c.includes('__Secure-neon-auth.session_token=tok_123')),
      'proxy.ts debe propagar la cookie de sesión emitida durante el intercambio OAuth'
    );
    assert(
      verifierRes.headers.get('Cache-Control')?.includes('private') &&
        verifierRes.headers.get('Cache-Control')?.includes('no-store'),
      'proxy.ts debe incluir Cache-Control: private, no-store en respuestas con verificador/sesión'
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (prevBaseUrl === undefined) delete process.env.NEON_AUTH_BASE_URL;
    else process.env.NEON_AUTH_BASE_URL = prevBaseUrl;
    if (prevAuthSecret === undefined) delete process.env.NEON_AUTH_COOKIE_SECRET;
    else process.env.NEON_AUTH_COOKIE_SECRET = prevAuthSecret;
    if (prevInvSecret === undefined) delete process.env.INVITATION_TOKEN_SECRET;
    else process.env.INVITATION_TOKEN_SECRET = prevInvSecret;
  }
  console.log('✓ 10. Protección OAuth (405 en GET /auth/login/google) y proxy.ts (invitados en / y /unirse + intercambio de verificador OAuth) verificados');

  // 13. Verificación de guardas de migración Neon (scripts/db-migrate.mjs) contra esquemas vacíos, completos, parciales y ajenos
  const {
    verifyNeonLinkFile,
    validateMigrationUrls,
    inspectAndMigratePublicSchema,
  } = await import('./db-migrate.mjs');

  // 13.1 Verificar verifyNeonLinkFile con directorio temporal (sin depender de .neon local que está en .gitignore para CI)
  const tmpNeonDir = fs.mkdtempSync(path.join(os.tmpdir(), 'papelito-neon-test-'));
  try {
    await assertThrows(
      async () => verifyNeonLinkFile(tmpNeonDir),
      'No se encontró el archivo .neon',
      'verifyNeonLinkFile debe fallar si no existe .neon en el directorio'
    );

    fs.writeFileSync(
      path.join(tmpNeonDir, '.neon'),
      JSON.stringify({
        orgId: 'org-solitary-voice-24830396',
        projectId: 'wrong-project-000',
        branch: 'production',
      }),
      'utf8'
    );
    await assertThrows(
      async () => verifyNeonLinkFile(tmpNeonDir),
      'no coincide con el proyecto/rama autorizados',
      'verifyNeonLinkFile debe rechazar un .neon que apunte a otro proyecto'
    );

    fs.writeFileSync(
      path.join(tmpNeonDir, '.neon'),
      JSON.stringify({
        orgId: 'org-solitary-voice-24830396',
        projectId: 'spring-frog-51248337',
        branch: 'production',
      }),
      'utf8'
    );
    const neonLink = verifyNeonLinkFile(tmpNeonDir);
    assert(
      neonLink.orgId === 'org-solitary-voice-24830396' &&
        neonLink.projectId === 'spring-frog-51248337' &&
        neonLink.branch === 'production',
      'verifyNeonLinkFile debe aceptar únicamente el proyecto y rama autorizados de Papelito'
    );
  } finally {
    fs.rmSync(tmpNeonDir, { recursive: true, force: true });
  }

  // 13.2 Verificar validación de URLs (directa sin -pooler, coincidencia con pooled y host/base exclusivos de Papelito)
  const validUrls = validateMigrationUrls(
    'postgresql://neondb_owner:secret@ep-frosty-hall-b42n8gmw-pooler.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require',
    'postgresql://neondb_owner:secret@ep-frosty-hall-b42n8gmw.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require'
  );
  assert(
    validUrls.directHost === 'ep-frosty-hall-b42n8gmw.c-6.us-east-2.aws.neon.tech' &&
      validUrls.databaseName === 'neondb',
    'validateMigrationUrls debe aceptar únicamente el par pooled/unpooled del endpoint y base autorizados de Papelito'
  );

  await assertThrows(
    async () =>
      validateMigrationUrls(
        'postgresql://neondb_owner:secret@ep-frosty-hall-b42n8gmw-pooler.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require',
        'postgresql://neondb_owner:secret@ep-frosty-hall-b42n8gmw-pooler.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require'
      ),
    'no debe contener "-pooler"',
    'validateMigrationUrls debe rechazar DATABASE_URL_UNPOOLED con -pooler'
  );

  await assertThrows(
    async () =>
      validateMigrationUrls(
        'postgresql://neondb_owner:secret@ep-frosty-hall-b42n8gmw-pooler.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require',
        'postgresql://neondb_owner:secret@ep-other-project-999999.us-east-2.aws.neon.tech/neondb?sslmode=require'
      ),
    'no coincide con el endpoint de DATABASE_URL',
    'validateMigrationUrls debe rechazar endpoints distintos entre DATABASE_URL y DATABASE_URL_UNPOOLED'
  );

  await assertThrows(
    async () =>
      validateMigrationUrls(
        'postgresql://neondb_owner:secret@ep-calm-meadow-123456-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require',
        'postgresql://neondb_owner:secret@ep-calm-meadow-123456.us-east-2.aws.neon.tech/neondb?sslmode=require'
      ),
    'no coincide con el host directo autorizado de Papelito',
    'validateMigrationUrls debe rechazar un par pooled/unpooled coherente pero perteneciente a otro proyecto Neon'
  );

  await assertThrows(
    async () =>
      validateMigrationUrls(
        'postgresql://neondb_owner:secret@ep-frosty-hall-b42n8gmw-pooler.c-6.us-east-2.aws.neon.tech/otradb?sslmode=require',
        'postgresql://neondb_owner:secret@ep-frosty-hall-b42n8gmw.c-6.us-east-2.aws.neon.tech/otradb?sslmode=require'
      ),
    'no coincide con la base autorizada de Papelito',
    'validateMigrationUrls debe rechazar una base de datos distinta a neondb'
  );

  // 13.3 Probar inspectAndMigratePublicSchema sobre PGlite limpio -> aplica migración y luego hace noop idempotente
  const pgliteMigrationTest = new PGlite();
  const pglitePartialTest = new PGlite();
  try {
    const appliedRes = await inspectAndMigratePublicSchema(pgliteMigrationTest, migrationSql);
    assert(
      appliedRes.status === 'migrated' && appliedRes.tablesCount === 12,
      'inspectAndMigratePublicSchema debe aplicar las 12 tablas cuando public está vacío'
    );
    const noopRes = await inspectAndMigratePublicSchema(pgliteMigrationTest, migrationSql);
    assert(
      noopRes.status === 'noop' && noopRes.tablesCount === 12,
      'inspectAndMigratePublicSchema debe hacer no-op seguro cuando las 12 tablas y columnas ya existen'
    );

    // 13.4 Probar rechazo ante tabla ajena en public
    await pgliteMigrationTest.exec('CREATE TABLE public.quiniela_matches (id int);');
    await assertThrows(
      () => inspectAndMigratePublicSchema(pgliteMigrationTest, migrationSql),
      'tablas ajenas a Papelito',
      'inspectAndMigratePublicSchema debe abortar si detecta tablas ajenas en public'
    );

    // 13.5 Probar rechazo ante esquema parcial
    await pglitePartialTest.exec('CREATE TABLE public.profiles (user_id text primary key);');
    await assertThrows(
      () => inspectAndMigratePublicSchema(pglitePartialTest, migrationSql),
      'esquema public parcial detectado',
      'inspectAndMigratePublicSchema debe abortar si public tiene solo parte de las tablas esperadas'
    );
  } finally {
    await pgliteMigrationTest.close();
    await pglitePartialTest.close();
  }
  console.log('✓ 11. Guardas de migración Neon (.neon, host/base autorizados exclusivos, rechazo de esquemas ajenos/parciales y no-op validado) verificadas');

  // 14. Suite 12: Acceso con correo/contraseña, normalización de errores, destinos seguros y consentimiento post-autenticación por cuenta
  const {
    MIN_PASSWORD_LENGTH,
    MAX_PASSWORD_LENGTH,
    OTP_RESEND_COOLDOWN_SECONDS,
    normalizeEmailInput,
    validateEmailInput,
    validatePasswordInput,
    validateNameOrAliasInput,
    buildSafeAuthDestination,
    buildAbsoluteCallbackUrl,
    buildPasswordResetRedirectTo,
    isInvalidRecoveryTokenState,
    mapAuthErrorToSpanish,
  } = await import('../src/lib/auth/auth-helpers.ts');

  assert(MIN_PASSWORD_LENGTH === 8, 'El mínimo de contraseña del SDK debe ser 8 caracteres');
  assert(MAX_PASSWORD_LENGTH === 128, 'El máximo de contraseña del SDK debe ser 128 caracteres');
  assert(OTP_RESEND_COOLDOWN_SECONDS === 60, 'El enfriamiento de reenvío OTP debe ser de 60 segundos');

  // 14.1 Validación de entradas (sin recortar contraseñas)
  assert(normalizeEmailInput('  UsuarIO@Papelito.CR ') === 'usuario@papelito.cr', 'normalizeEmailInput debe limpiar y pasar a minúsculas');
  assert(validateEmailInput('invalido') !== null, 'validateEmailInput debe rechazar correos sin formato válido');
  assert(validateEmailInput('ana@papelito.cr') === null, 'validateEmailInput debe aceptar un correo válido');
  assert(validateNameOrAliasInput('A') !== null, 'validateNameOrAliasInput debe rechazar alias de 1 carácter');
  assert(validateNameOrAliasInput('Camila') === null, 'validateNameOrAliasInput debe aceptar nombre/alias válido');

  assert(
    validatePasswordInput('1234567', 'signup') !== null,
    'validatePasswordInput debe rechazar contraseñas menores a 8 caracteres'
  );
  assert(
    validatePasswordInput('       a', 'signup') === null,
    'validatePasswordInput NO debe hacer trim de espacios en la contraseña (8 caracteres con espacios iniciales son válidos)'
  );
  assert(
    validatePasswordInput('x'.repeat(129), 'signup')?.includes('128') === true,
    'validatePasswordInput debe rechazar contraseñas mayores a 128 caracteres indicando el máximo'
  );

  // 14.2 Mapeo de errores en español (PASSWORD_TOO_LONG, prioridad 429, OTP, credenciales, origen no autorizado e INVALID_TOKEN)
  const errTooLong = mapAuthErrorToSpanish({ code: 'PASSWORD_TOO_LONG', message: 'Password too long' }, 'signup');
  assert(
    errTooLong.code === 'PASSWORD_TOO_LONG' && errTooLong.message.includes('128'),
    'PASSWORD_TOO_LONG debe indicar el máximo (128), no el mínimo'
  );

  const errTooShort = mapAuthErrorToSpanish({ code: 'PASSWORD_TOO_SHORT', message: 'Password too short' }, 'signup');
  assert(
    errTooShort.message.includes('8 caracteres'),
    'PASSWORD_TOO_SHORT debe indicar el mínimo de 8 caracteres'
  );

  const err429Otp = mapAuthErrorToSpanish(
    { code: 'INVALID_OTP', status: 429, message: 'Too many requests for verification code' },
    'otp'
  );
  assert(
    err429Otp.code === 'INVALID_OTP' &&
      err429Otp.requiresEmailVerification === false &&
      err429Otp.message.includes('demasiados intentos'),
    'El estado HTTP 429 debe priorizarse como límite de intentos sobre errores de OTP'
  );

  const errUnverified = mapAuthErrorToSpanish({ code: 'EMAIL_NOT_VERIFIED', status: 403 }, 'signin');
  assert(
    errUnverified.requiresEmailVerification === true,
    'EMAIL_NOT_VERIFIED debe activar requiresEmailVerification'
  );

  const errInvalidCreds = mapAuthErrorToSpanish({ code: 'INVALID_EMAIL_OR_PASSWORD', status: 401 }, 'signin');
  assert(
    errInvalidCreds.suggestGoogleOrReset === true &&
      errInvalidCreds.message.includes('Continuar con Google') &&
      errInvalidCreds.message.includes('¿Olvidaste tu contraseña?'),
    'Credenciales inválidas deben orientar en español sobre cuentas Google o recuperación de contraseña'
  );

  const errInvalidOrigin = mapAuthErrorToSpanish({ code: 'INVALID_CALLBACK_URL', status: 403 }, 'signin');
  assert(
    errInvalidOrigin.code === 'INVALID_CALLBACK_URL' &&
      errInvalidOrigin.message.includes('dirección principal'),
    'INVALID_CALLBACK_URL / INVALID_ORIGIN debe indicar abrir Papelito desde su dirección principal'
  );

  const errInvalidToken = mapAuthErrorToSpanish({ code: 'INVALID_TOKEN', status: 401 }, 'reset');
  assert(
    errInvalidToken.isInvalidToken === true,
    'INVALID_TOKEN debe marcar isInvalidToken=true'
  );

  // 14.3 Destinos internos seguros y URLs de recuperación/callback sin open redirects
  assert(
    buildSafeAuthDestination('/unirse/token_valido_123') === '/unirse/token_valido_123',
    'buildSafeAuthDestination debe preservar rutas internas /unirse/...'
  );
  assert(
    buildSafeAuthDestination('https://sitio-externo.malicioso/phishing') === '/' &&
      buildSafeAuthDestination('//sitio-externo.malicioso') === '/' &&
      buildSafeAuthDestination('/\\sitio-externo.malicioso') === '/',
    'buildSafeAuthDestination debe bloquear open redirects hacia orígenes externos'
  );
  assert(
    buildAbsoluteCallbackUrl('http://127.0.0.1:3040/', '/unirse/abc12345') ===
      'http://127.0.0.1:3040/unirse/abc12345',
    'buildAbsoluteCallbackUrl debe construir callbackURL absoluto preservando /unirse/...'
  );
  assert(
    buildPasswordResetRedirectTo('http://127.0.0.1:3040', '/unirse/abc12345') ===
      'http://127.0.0.1:3040/auth/recuperar?next=%2Funirse%2Fabc12345',
    'buildPasswordResetRedirectTo debe preservar destino seguro next en recuperación'
  );
  assert(
    buildPasswordResetRedirectTo('http://127.0.0.1:3040', '//evil.com') ===
      'http://127.0.0.1:3040/auth/recuperar',
    'buildPasswordResetRedirectTo debe descartar destinos externos maliciosos'
  );
  assert(
    isInvalidRecoveryTokenState({ token: null, error: null }) === true &&
      isInvalidRecoveryTokenState({ token: 'abc', error: 'INVALID_TOKEN' }) === true &&
      isInvalidRecoveryTokenState({ token: 'INVALID_TOKEN', error: null }) === true &&
      isInvalidRecoveryTokenState({ token: 'token_real_123', error: null }) === false,
    'isInvalidRecoveryTokenState debe detectar tokens faltantes o INVALID_TOKEN'
  );

  // 14.3b Origen canónico en /auth/logout (permalink de Netlify -> dominio principal, config inválida/credenciales y preservación de orígenes locales)
  const { resolveLogoutRedirectUrl } = await import('../src/lib/security/urls.ts');
  const { POST: logoutPost } = await import('../src/app/auth/logout/route.ts');

  assert(
    resolveLogoutRedirectUrl(
      'https://6ad381b30d8aaecb76a882aa--papelitocr.netlify.app/auth/logout?from=nav',
      'https://papelitocr.netlify.app'
    ).toString() === 'https://papelitocr.netlify.app/',
    'resolveLogoutRedirectUrl debe redirigir desde permalink de Netlify al dominio principal configurado en la raíz sin query/path'
  );
  assert(
    resolveLogoutRedirectUrl(
      'https://6ad381b30d8aaecb76a882aa--papelitocr.netlify.app/auth/logout',
      'https://papelitocr.netlify.app/subruta?x=1#hash'
    ).toString() === 'https://papelitocr.netlify.app/',
    'resolveLogoutRedirectUrl debe normalizar a la raíz limpia sin path, query ni hash'
  );
  assert(
    resolveLogoutRedirectUrl(
      'https://papelitocr.netlify.app/auth/logout?foo=1',
      'https://usuario:clave@evil.example.com'
    ).toString() === 'https://papelitocr.netlify.app/' &&
      resolveLogoutRedirectUrl(
        'https://papelitocr.netlify.app/auth/logout',
        'ftp://papelitocr.netlify.app'
      ).toString() === 'https://papelitocr.netlify.app/' &&
      resolveLogoutRedirectUrl(
        'https://papelitocr.netlify.app/auth/logout',
        'no-es-una-url'
      ).toString() === 'https://papelitocr.netlify.app/' &&
      resolveLogoutRedirectUrl(
        'https://papelitocr.netlify.app/auth/logout',
        ''
      ).toString() === 'https://papelitocr.netlify.app/',
    'resolveLogoutRedirectUrl debe hacer fallback seguro al origen de request si NEXT_PUBLIC_APP_URL falta, es inválida o incluye credenciales'
  );
  assert(
    resolveLogoutRedirectUrl(
      'http://localhost:3040/auth/logout',
      'https://papelitocr.netlify.app'
    ).toString() === 'http://localhost:3040/' &&
      resolveLogoutRedirectUrl(
        'http://127.0.0.1:3040/auth/logout',
        'https://papelitocr.netlify.app'
      ).toString() === 'http://127.0.0.1:3040/' &&
      resolveLogoutRedirectUrl(
        'http://[::1]:3040/auth/logout',
        'https://papelitocr.netlify.app'
      ).toString() === 'http://[::1]:3040/',
    'resolveLogoutRedirectUrl debe conservar el origen local (localhost, 127.0.0.1, ::1) para no alterar cookies locales'
  );

  const prevPublicAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  try {
    process.env.NEXT_PUBLIC_APP_URL = 'https://papelitocr.netlify.app';
    const permalinkLogoutReq = new NextRequest(
      'https://6ad381b30d8aaecb76a882aa--papelitocr.netlify.app/auth/logout',
      {
        method: 'POST',
        headers: {
          origin: 'https://sitio-arbitrario.malicioso',
          'x-forwarded-host': 'sitio-arbitrario.malicioso',
        },
      }
    );
    const logoutRes = await logoutPost(permalinkLogoutReq);
    assert(
      logoutRes.status === 303 &&
        logoutRes.headers.get('location') === 'https://papelitocr.netlify.app/',
      `POST /auth/logout debe responder 303 hacia NEXT_PUBLIC_APP_URL ignorando permalink y x-forwarded-host arbitrarios (location: ${logoutRes.headers.get('location')})`
    );
  } finally {
    if (prevPublicAppUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = prevPublicAppUrl;
  }

  // 14.4 Ciclo de consentimiento en DB: el login/alta nunca autoacepta, persiste entre sesiones y exige confirmar nueva versión una sola vez
  const emailAuthUser = 'correo-user-01';
  await getOrCreateProfile(emailAuthUser, 'correo@papelito.cr', 'Usuario Correo', '#7043A2');

  const statusAfterAuthOnly = await getLatestConsentStatus(emailAuthUser);
  assert(
    statusAfterAuthOnly.hasCurrentConsent === false && statusAfterAuthOnly.latestVersion === null,
    'Autenticarse o crear perfil nunca debe registrar ni dar por aceptado el consentimiento automáticamente'
  );

  const emptyCookies = createMemoryCookieStore();
  const statusWithoutCookie = await consumePendingConsentIntent(emailAuthUser, emptyCookies);
  assert(
    statusWithoutCookie.hasCurrentConsent === false && statusWithoutCookie.latestVersion === null,
    'Sin cookie pre-auth ni registro en DB, la cuenta autenticada permanece sin consentimiento hasta confirmar explícitamente'
  );

  // Simular cuenta con versión anterior (2026-10-16.1): recordConsent rechaza grabar versiones viejas y getLatestConsentStatus exige confirmar la nueva versión vigente (2026-10-16.2)
  await assertThrows(
    () => recordConsent(emailAuthUser, '2026-10-16.1', '2026-10-16.1'),
    LEGAL_CONSTANTS.VERSION,
    'recordConsent debe rechazar versiones anteriores a la vigente'
  );
  await pg.query(
    `INSERT INTO public.consent_records (user_id, terms_version, privacy_version, accepted_at)
     VALUES ($1, '2026-10-16.1', '2026-10-16.1', now() - interval '2 days')`,
    [emailAuthUser]
  );
  const statusOldVersion = await getLatestConsentStatus(emailAuthUser);
  assert(
    statusOldVersion.hasCurrentConsent === false && statusOldVersion.latestVersion === '2026-10-16.1',
    `Un registro de versión anterior (2026-10-16.1) debe requerir confirmar la versión vigente (${LEGAL_CONSTANTS.VERSION})`
  );

  // Confirmar versión vigente una sola vez
  await recordConsent(emailAuthUser, LEGAL_CONSTANTS.VERSION, LEGAL_CONSTANTS.VERSION);
  const statusCurrent = await getLatestConsentStatus(emailAuthUser);
  assert(
    statusCurrent.hasCurrentConsent === true && statusCurrent.latestVersion === LEGAL_CONSTANTS.VERSION,
    'Tras confirmar explícitamente la versión vigente, el consentimiento queda activo en la base de datos'
  );

  // Simular cierre de sesión y nuevo ingreso en otro navegador (sin cookies previas): persiste sin crear registros nuevos
  const countBeforeRelogin = await pg.query(
    'SELECT COUNT(*)::int AS total FROM public.consent_records WHERE user_id = $1',
    [emailAuthUser]
  );
  await getOrCreateProfile(emailAuthUser, 'correo@papelito.cr', 'Usuario Correo', '#7043A2');
  const statusOnRelogin = await consumePendingConsentIntent(emailAuthUser, createMemoryCookieStore());
  const countAfterRelogin = await pg.query(
    'SELECT COUNT(*)::int AS total FROM public.consent_records WHERE user_id = $1',
    [emailAuthUser]
  );
  assert(
    statusOnRelogin.hasCurrentConsent === true &&
      countBeforeRelogin.rows[0].total === countAfterRelogin.rows[0].total,
    'Los siguientes ingresos deben reconocer el consentimiento vigente en DB sin pedir casillas ni crear registros nuevos'
  );

  // Revocar consentimiento invalida el estado inmediatamente
  await revokeConsentAndClearCookie(emailAuthUser, createMemoryCookieStore());
  const statusAfterRevoke = await getLatestConsentStatus(emailAuthUser);
  assert(
    statusAfterRevoke.hasCurrentConsent === false,
    'Tras revocar el consentimiento, la cuenta debe volver a requerir aceptación explícita'
  );

  await pg.close();
  console.log('✓ 12. Acceso con correo/contraseña, errores en español, destinos seguros y consentimiento por cuenta (v' + LEGAL_CONSTANTS.VERSION + ') verificados');

  console.log('=== Todas las pruebas de integración de backend pasaron con éxito ===');
}

runTests().catch((err) => {
  console.error('❌ Error fatal en pruebas de backend:', err);
  process.exit(1);
});
