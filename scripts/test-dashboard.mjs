// Datos del tablero «Mis intercambios»: autoridad, estado propio del papelito,
// privacidad y cantidad de consultas. Solo identidades sintéticas sobre PGlite.
import assert from "node:assert/strict";
import fs from "node:fs";
import { randomBytes, randomUUID } from "node:crypto";
import { register } from "node:module";
import { PGlite } from "@electric-sql/pglite";

register("./ts-loader.mjs", import.meta.url);
process.env.NODE_ENV = "test";
process.env.INVITATION_TOKEN_SECRET = randomBytes(32).toString("hex");

const { setTestDbAdapter } = await import("../src/lib/db/client.ts");
const {
  createExchangeWithInvitation,
  acceptInvitationAtomic,
  manageMemberStatus,
  getMyExchanges,
  transferExchangeOrganizer,
} = await import("../src/lib/repositories/exchanges.ts");
const { getOrCreateProfile, recordConsent, getLatestConsentStatus } =
  await import("../src/lib/repositories/profiles.ts");
const { saveWish, toggleWishInExchange } =
  await import("../src/lib/repositories/wishes.ts");
const { executeAndCommitDraw } = await import("../src/lib/repositories/draw.ts");
const { revealAssignment } = await import("../src/lib/repositories/assignments.ts");
const { readAppSnapshot } = await import("../src/lib/repositories/app-snapshot.ts");
const { LEGAL_CONSTANTS } = await import("../src/lib/legal/constants.ts");
const { nextAction, buildDashboard } = await import("../src/lib/dashboard/next-action.ts");
const { canManageRequests, registrationExpired } = await import("../src/lib/exchanges/join-requests.ts");
const { getCostaRicaTodayDate } = await import("../src/lib/date/costa-rica.ts");

const pg = new PGlite();
let queries = 0;
for (const file of fs.readdirSync(new URL("../neon/migrations/", import.meta.url)).sort())
  await pg.exec(fs.readFileSync(new URL(`../neon/migrations/${file}`, import.meta.url), "utf8"));
setTestDbAdapter({
  async query(sql, params = []) {
    queries++;
    const r = await pg.query(sql, params);
    return { rows: r.rows, rowCount: r.rows.length || r.affectedRows || 0 };
  },
});

async function person(label) {
  const id = randomUUID();
  await getOrCreateProfile(id, `${label}@example.com`, label);
  await recordConsent(id, LEGAL_CONSTANTS.VERSION, LEGAL_CONSTANTS.VERSION, null, "synthetic-dashboard");
  return id;
}
const group = (owner, name) =>
  createExchangeWithInvitation(owner, {
    name,
    description: "",
    eventDate: "2099-12-24",
    registrationDeadline: "2099-12-17",
    budgetAmount: 10000,
    currency: "CRC",
    suggestedTheme: "general",
    selectedTheme: "general",
    requiresApproval: true,
  });
const summary = async (userId, exchangeId) =>
  (await getMyExchanges(userId)).find((item) => item.id === exchangeId);

try {
  const [owner, ana, beto, carla, pendiente, rechazada] = await Promise.all(
    ["Dueña", "Ana", "Beto", "Carla", "Pendiente", "Rechazada"].map(person),
  );
  const { exchangeId, inviteToken } = await group(owner, "Grupo principal");
  for (const id of [ana, beto, carla, pendiente, rechazada])
    assert.equal((await acceptInvitationAtomic(inviteToken, id)).status, "pending");
  for (const id of [ana, beto, carla]) await manageMemberStatus(exchangeId, id, "approved", owner);
  await manageMemberStatus(exchangeId, rechazada, "rejected", owner);

  // Conteo de solicitudes: solo para quien organiza hoy.
  assert.equal((await summary(owner, exchangeId)).pendingRequestCount, 1);
  assert.equal((await summary(ana, exchangeId)).pendingRequestCount, 0);
  assert.equal((await summary(pendiente, exchangeId)).pendingRequestCount, 0);

  // Antes del sorteo nadie tiene papelito, sin importar la membresía.
  for (const id of [owner, ana, pendiente, rechazada])
    assert.equal((await summary(id, exchangeId)).ownPaperState, "sin_asignacion");
  assert.equal((await summary(pendiente, exchangeId)).memberStatus, "pending");
  assert.equal((await summary(rechazada, exchangeId)).memberStatus, "rejected");

  // Deseos propios elegidos para este grupo, no los del resto.
  const wish = await saveWish(ana, { title: "Un libro" });
  await saveWish(ana, { title: "Idea sin compartir" });
  await toggleWishInExchange(ana, exchangeId, wish.wishId, true);
  assert.equal((await summary(ana, exchangeId)).myWishCount, 1);
  assert.equal((await summary(beto, exchangeId)).myWishCount, 0);

  // Sorteo: la organizadora también participa y recibe su propio estado.
  await executeAndCommitDraw(exchangeId, owner, 0);
  for (const id of [owner, ana, beto, carla])
    assert.equal((await summary(id, exchangeId)).ownPaperState, "sin_abrir");
  for (const id of [pendiente, rechazada])
    assert.equal((await summary(id, exchangeId)).ownPaperState, "sin_asignacion");

  // Abrir el propio no cambia el de nadie más.
  await revealAssignment(exchangeId, ana);
  assert.equal((await summary(ana, exchangeId)).ownPaperState, "abierto");
  assert.equal((await summary(beto, exchangeId)).ownPaperState, "sin_abrir");
  assert.equal((await summary(owner, exchangeId)).ownPaperState, "sin_abrir");

  // Sorteo repetido: lo abierto en la versión anterior ya no cuenta.
  await executeAndCommitDraw(exchangeId, owner, 1, "Se repite por prueba");
  assert.equal((await summary(ana, exchangeId)).ownPaperState, "sin_abrir");

  // Membresía que deja de estar aprobada: una asignación vigente no produce aviso.
  await pg.query(`UPDATE memberships SET status = 'rejected' WHERE exchange_id = $1 AND user_id = $2`, [exchangeId, carla]);
  assert.equal((await summary(carla, exchangeId)).ownPaperState, "sin_asignacion");
  await pg.query(`UPDATE memberships SET status = 'pending' WHERE exchange_id = $1 AND user_id = $2`, [exchangeId, carla]);
  assert.equal((await summary(carla, exchangeId)).ownPaperState, "sin_asignacion");
  await pg.query(`UPDATE memberships SET status = 'approved' WHERE exchange_id = $1 AND user_id = $2`, [exchangeId, carla]);
  assert.equal((await summary(carla, exchangeId)).ownPaperState, "sin_abrir");

  // Aprobada después del sorteo, sin fila en la versión actual: tampoco hay aviso.
  await pg.query(`UPDATE memberships SET status = 'approved' WHERE exchange_id = $1 AND user_id = $2`, [exchangeId, pendiente]);
  assert.equal((await summary(pendiente, exchangeId)).ownPaperState, "sin_asignacion");
  await pg.query(`UPDATE memberships SET status = 'pending' WHERE exchange_id = $1 AND user_id = $2`, [exchangeId, pendiente]);

  // Un grupo cerrado deja de ofrecer el papelito aunque la asignación exista.
  await pg.query(`UPDATE exchanges SET status = 'finalizado' WHERE id = $1`, [exchangeId]);
  assert.equal((await summary(beto, exchangeId)).ownPaperState, "sin_asignacion");
  await pg.query(`UPDATE exchanges SET status = 'sorteado' WHERE id = $1`, [exchangeId]);

  // El tablero recibe el estado y nada del destinatario ni de otras aperturas.
  const receivers = await pg.query(`SELECT receiver_id FROM assignments WHERE exchange_id = $1`, [exchangeId]);
  const payload = JSON.stringify(await getMyExchanges(ana));
  for (const { receiver_id } of receivers.rows) if (receiver_id !== ana) assert.ok(!payload.includes(receiver_id), "no expone destinatarios");
  assert.deepEqual(
    Object.keys((await getMyExchanges(ana))[0]).filter((key) => /receiver|giver|assign|reveal/i.test(key)),
    [],
  );

  // Transferencia: la autoridad sigue al organizador actual aunque quede un dato viejo.
  const { exchangeId: transferred, inviteToken: transferToken } = await group(owner, "Grupo transferido");
  for (const id of [ana, pendiente]) await acceptInvitationAtomic(transferToken, id);
  await manageMemberStatus(transferred, ana, "approved", owner);
  await transferExchangeOrganizer(transferred, owner, ana);
  assert.equal((await summary(owner, transferred)).pendingRequestCount, 0);
  assert.equal((await summary(owner, transferred)).isOrganizer, false);
  assert.equal((await summary(ana, transferred)).pendingRequestCount, 1);
  assert.equal((await summary(ana, transferred)).isOrganizer, true);
  await pg.query(`UPDATE memberships SET is_organizer = true WHERE exchange_id = $1 AND user_id = $2`, [transferred, owner]);
  assert.equal((await summary(owner, transferred)).pendingRequestCount, 0, "is_organizer viejo no da autoridad");
  assert.equal((await summary(owner, transferred)).isOrganizer, false);
  await pg.query(`UPDATE memberships SET is_organizer = false WHERE exchange_id = $1 AND user_id = $2`, [transferred, owner]);

  // El mismo grupo antes y después del sorteo: la solicitud sigue en la base, pero
  // solo se ofrece revisarla mientras quien organiza todavía puede gestionarla.
  const [dueno, uno, dos, tardia] = await Promise.all(["Dueño", "Uno", "Dos", "Tardía"].map(person));
  const { exchangeId: lateGroup, inviteToken: lateToken } = await group(dueno, "Grupo con solicitud tardía");
  for (const id of [uno, dos, tardia]) await acceptInvitationAtomic(lateToken, id);
  for (const id of [uno, dos]) await manageMemberStatus(lateGroup, id, "approved", dueno);
  const boardFor = async (userId) => {
    const item = await summary(userId, lateGroup);
    const exchange = {
      ...item,
      isCurrentUserOrganizer: item.isOrganizer,
      currentUserMemberStatus: item.memberStatus,
      participants: [],
      minParticipants: 3,
    };
    const today = "2026-11-04";
    return { item, action: nextAction(exchange, today), board: buildDashboard([exchange], today) };
  };
  const antes = await boardFor(dueno);
  assert.equal(antes.item.pendingRequestCount, 1);
  assert.equal(antes.action.kind, "review_requests", "antes del sorteo se ofrece revisar");
  assert.equal(antes.action.text, "Revisar 1 solicitud");

  await executeAndCommitDraw(lateGroup, dueno, 0);
  await revealAssignment(lateGroup, dueno);
  const despues = await boardFor(dueno);
  assert.equal(despues.item.pendingRequestCount, 1, "el dato sigue: lo que cambia es lo que se ofrece");
  assert.equal(despues.item.ownPaperState, "abierto");
  assert.equal(despues.action.kind, "add_wishes", "sin solicitudes que gestionar, sigue la tarea propia");
  assert.ok(despues.board.tasks.every((task) => task.action.kind !== "review_requests"));
  assert.equal(despues.board.envelope, null, "con el papelito abierto no hay sobre");

  const ownWish = await saveWish(dueno, { title: "Un cuaderno" });
  await toggleWishInExchange(dueno, lateGroup, ownWish.wishId, true);
  const alDia = await boardFor(dueno);
  assert.equal(alDia.action.kind, "none");
  assert.equal(alDia.action.text, "Papelito abierto");
  assert.deepEqual(alDia.board.tasks, []);
  assert.equal(alDia.board.pendingCount, 0, "una solicitud que ya no se puede gestionar no cuenta como pendiente");

  // Las reglas de aprobación no cambian: el servidor sigue rechazando y nada se mueve.
  await assert.rejects(manageMemberStatus(lateGroup, tardia, "approved", dueno), /sorteo/);
  await assert.rejects(manageMemberStatus(lateGroup, tardia, "rejected", dueno), /sorteo/);
  assert.equal((await summary(tardia, lateGroup)).memberStatus, "pending");
  assert.equal((await boardFor(dueno)).item.pendingRequestCount, 1);

  // Privacidad: abrir el propio no revela al destinatario ni las aperturas ajenas.
  const lateReceivers = await pg.query(`SELECT receiver_id FROM assignments WHERE exchange_id = $1`, [lateGroup]);
  const boardPayload = JSON.stringify(await getMyExchanges(dueno));
  for (const { receiver_id } of lateReceivers.rows) {
    if (receiver_id !== dueno) assert.ok(!boardPayload.includes(receiver_id), "el tablero no expone destinatarios");
  }
  for (const id of [uno, dos]) assert.equal((await summary(id, lateGroup)).ownPaperState, "sin_abrir");
  for (const id of [uno, dos]) assert.equal((await summary(id, lateGroup)).pendingRequestCount, 0);

  // La regla de la interfaz coincide con la del servidor, estado por estado.
  for (const status of ["borrador", "inscripcion_abierta", "inscripcion_cerrada", "sorteado", "finalizado", "cancelado"]) {
    await pg.query(`UPDATE exchanges SET status = $1 WHERE id = $2`, [status, lateGroup]);
    const allowed = await manageMemberStatus(lateGroup, tardia, "approved", dueno).then(() => true, () => false);
    assert.equal(canManageRequests(status), allowed, `solicitudes en ${status}`);
    await pg.query(`UPDATE memberships SET status = 'pending' WHERE exchange_id = $1 AND user_id = $2`, [lateGroup, tardia]);
  }
  await pg.query(`UPDATE exchanges SET status = 'sorteado' WHERE id = $1`, [lateGroup]);

  // De 6 a 20 grupos: la misma cantidad de consultas, sin y con detalle abierto.
  const [volumen, otra] = await Promise.all(["Volumen", "Otra"].map(person));
  const consent = await getLatestConsentStatus(volumen);
  const created = [];
  const addGroups = async (until) => {
    while (created.length < until) {
      const made = await group(volumen, `Grupo ${created.length + 1}`);
      await acceptInvitationAtomic(made.inviteToken, otra);
      created.push(made.exchangeId);
    }
  };
  const measure = async (run) => {
    const before = queries;
    const result = await run();
    return { count: queries - before, result };
  };
  await addGroups(6);
  const list6 = await measure(() => readAppSnapshot(volumen, consent));
  const detail6 = await measure(() => readAppSnapshot(volumen, consent, created[0]));
  const only6 = await measure(() => getMyExchanges(volumen));
  assert.equal(list6.result.exchanges.length, 6);
  await addGroups(20);
  const list20 = await measure(() => readAppSnapshot(volumen, consent));
  const detail20 = await measure(() => readAppSnapshot(volumen, consent, created[0]));
  const only20 = await measure(() => getMyExchanges(volumen));
  assert.equal(list20.result.exchanges.length, 20);
  assert.equal(only6.count, 1, "getMyExchanges es una sola consulta");
  assert.equal(only20.count, only6.count);
  assert.equal(list20.count, list6.count, "tablero solo: misma cantidad con 6 y 20 grupos");
  assert.equal(detail20.count, detail6.count, "con detalle abierto: misma cantidad con 6 y 20 grupos");
  assert.equal(list20.result.exchanges.every((item) => item.pendingRequestCount === 1), true);

  console.log(`PASS datos del tablero: autoridad, papelito propio, privacidad. Consultas: tablero ${list6.count}=${list20.count}, con detalle ${detail6.count}=${detail20.count}.`);
} finally {
  setTestDbAdapter(null);
  await pg.close();
}

// Regla de siguiente acción: pura, con el calendario de Costa Rica como entrada.
const TODAY = "2026-11-04";
const make = (over = {}) => ({
  id: over.id ?? randomUUID(),
  name: "Grupo",
  description: "",
  eventDate: "2026-12-24",
  registrationDeadline: "2026-12-01",
  timezone: "America/Costa_Rica",
  budgetAmount: 1,
  currency: "CRC",
  status: "inscripcion_abierta",
  suggestedTheme: "general",
  selectedTheme: "general",
  organizerName: "Quien organiza",
  isCurrentUserOrganizer: false,
  inviteCode: "",
  requiresApproval: true,
  participants: [],
  minParticipants: 3,
  participantCount: 5,
  currentUserMemberStatus: "approved",
  pendingRequestCount: 0,
  myWishCount: 1,
  ownPaperState: "sin_asignacion",
  ...over,
});
const organizer = (over = {}) => make({ isCurrentUserOrganizer: true, ...over });
const kind = (over, builder = make, today = TODAY) => nextAction(builder(over), today).kind;

// Papelito: solo una membresía aprobada, grupo sorteado y estado propio sin abrir.
assert.equal(kind({ status: "sorteado", ownPaperState: "sin_abrir" }), "open_paper");
assert.equal(kind({ status: "sorteado", ownPaperState: "sin_abrir" }, organizer), "open_paper", "quien organiza también abre el suyo");
assert.equal(kind({ status: "sorteado", ownPaperState: "abierto" }), "none");
assert.equal(kind({ status: "sorteado", ownPaperState: "sin_asignacion" }), "none");
assert.equal(kind({ status: "sorteado", ownPaperState: "sin_abrir", currentUserMemberStatus: "pending" }), "none");
assert.equal(kind({ status: "sorteado", ownPaperState: "sin_abrir", currentUserMemberStatus: "rejected" }), "none");
assert.equal(kind({ status: "finalizado", ownPaperState: "sin_abrir" }), "none");

// Membresía sin aprobar: nunca hay tarea y el estado se dice con texto.
assert.equal(nextAction(make({ currentUserMemberStatus: "pending", myWishCount: 0 }), TODAY).isTask, false);
assert.match(nextAction(make({ currentUserMemberStatus: "pending" }), TODAY).text, /aprob/i);
assert.match(nextAction(make({ currentUserMemberStatus: "rejected" }), TODAY).text, /no aprobada/i);

// Prioridad del organizador.
assert.equal(nextAction(organizer({ pendingRequestCount: 3 }), TODAY).text, "Revisar 3 solicitudes");
assert.equal(nextAction(organizer({ pendingRequestCount: 1 }), TODAY).text, "Revisar 1 solicitud");
assert.equal(nextAction(organizer({ participantCount: 2 }), TODAY).text, "Invitar: falta 1 persona");
assert.equal(nextAction(organizer({ participantCount: 1 }), TODAY).text, "Invitar: faltan 2 personas");
assert.equal(kind({ participantCount: 2, minParticipants: 1 }, organizer), "invite", "el mínimo real del sorteo es 3");
assert.equal(kind({ participantCount: 5, minParticipants: 8 }, organizer), "invite");

// «Revisar sorteo»: invita a mirar, no promete un sorteo válido.
const review = nextAction(organizer({ registrationDeadline: "2026-11-05" }), TODAY);
assert.equal(review.kind, "review_draw");
assert.equal(review.text, "Revisar sorteo");
assert.doesNotMatch(`${review.text} ${review.due}`, /list|válid|podés sortear|pueden sortear/i);
assert.equal(kind({ registrationDeadline: "2026-11-11" }, organizer), "review_draw", "a siete días");
const far = nextAction(organizer({ registrationDeadline: "2026-11-12" }), TODAY);
assert.equal(far.kind, "none", "a ocho días no hace falta revisarlo");
assert.equal(far.isTask, false);

// Último día de inscripción y día siguiente, por fecha de Costa Rica.
const lastDay = nextAction(organizer({ registrationDeadline: TODAY }), TODAY);
assert.equal(lastDay.kind, "review_draw");
assert.match(lastDay.due, /cierra hoy/i);
assert.equal(lastDay.urgent, true);
const dayAfter = nextAction(organizer({ registrationDeadline: "2026-11-03" }), TODAY);
assert.equal(dayAfter.kind, "review_draw");
assert.match(dayAfter.due, /venció/i);
assert.equal(kind({ registrationDeadline: "2026-11-03", participantCount: 2 }, organizer), "review_expired");
assert.equal(kind({ registrationDeadline: TODAY, participantCount: 2 }, organizer), "invite", "el último día todavía se puede invitar");

// Deseos propios: para todos, sin tapar las tareas de organización.
assert.equal(kind({ myWishCount: 0 }), "add_wishes");
assert.equal(kind({ myWishCount: 0, pendingRequestCount: 2 }, organizer), "review_requests");
assert.equal(kind({ myWishCount: 0, registrationDeadline: "2026-12-20" }, organizer), "add_wishes");
assert.equal(kind({ myWishCount: 0, status: "sorteado", ownPaperState: "abierto" }), "add_wishes");
assert.equal(kind({ myWishCount: 1 }), "none");

// Después de la entrega solo quien organiza tiene algo pendiente.
assert.equal(kind({ status: "sorteado", ownPaperState: "abierto", eventDate: "2026-11-01" }, organizer), "close_group");
assert.equal(kind({ status: "sorteado", ownPaperState: "abierto", eventDate: "2026-11-01" }), "none");
assert.equal(kind({ status: "sorteado", ownPaperState: "abierto", eventDate: TODAY }, organizer), "none", "el día de la entrega todavía no");

// Tablero: sobre único, sin repetir su tarea, orden por próximo vencimiento y archivo aparte.
const board = buildDashboard([
  make({ id: "navidad", name: "Navidad", status: "sorteado", ownPaperState: "sin_abrir", eventDate: "2026-12-24" }),
  make({ id: "posterior", name: "Posterior", status: "sorteado", ownPaperState: "sin_abrir", eventDate: "2027-01-10" }),
  organizer({ id: "oficina", name: "Oficina", pendingRequestCount: 3, registrationDeadline: "2026-11-20", eventDate: "2026-12-12" }),
  organizer({ id: "futbol", name: "Fútbol", registrationDeadline: "2026-11-05", eventDate: "2026-12-05" }),
  make({ id: "espera", name: "Espera", currentUserMemberStatus: "pending", registrationDeadline: "2026-11-09", eventDate: "2026-12-30" }),
  make({ id: "pasado", name: "Pasado", status: "sorteado", ownPaperState: "abierto", eventDate: "2026-10-01" }),
  make({ id: "cerrado", name: "Cerrado", status: "finalizado" }),
  make({ id: "cancelado", name: "Cancelado", status: "cancelado" }),
  make({ id: "rechazado", name: "Rechazado", currentUserMemberStatus: "rejected" }),
], TODAY);
assert.equal(board.envelope?.id, "navidad", "el sobre es el papelito sin abrir más próximo");
assert.deepEqual(board.tasks.map((task) => task.exchange.id), ["futbol", "oficina", "posterior"]);
assert.deepEqual(board.active.map((item) => item.exchange.id), ["futbol", "espera", "oficina", "navidad", "posterior", "pasado"]);
assert.deepEqual(board.archive.map((item) => item.exchange.id).sort(), ["cancelado", "cerrado", "rechazado"]);
assert.equal(board.pendingCount, 4, "el sobre también cuenta como pendiente");
assert.equal(board.showRoleFilter, true);

const noPaper = buildDashboard([organizer({ id: "a" }), organizer({ id: "b" })], TODAY);
assert.equal(noPaper.envelope, null, "sin papelito propio no hay sobre");
assert.equal(noPaper.showRoleFilter, false, "el filtro de rol no aporta si todos son del mismo rol");
const noApproved = buildDashboard([make({ id: "a", status: "sorteado", ownPaperState: "sin_abrir", currentUserMemberStatus: "pending" })], TODAY);
assert.equal(noApproved.envelope, null);
assert.deepEqual(noApproved.tasks, []);

// Inscripción vencida: el último día sigue vigente, y el corte es el de Costa Rica.
assert.equal(registrationExpired("inscripcion_abierta", "2026-11-20", "2026-11-20"), false);
assert.equal(registrationExpired("inscripcion_abierta", "2026-11-20", "2026-11-21"), true);
assert.equal(registrationExpired("sorteado", "2026-11-20", "2026-11-21"), false, "solo aplica mientras sigue abierta");
assert.equal(registrationExpired("inscripcion_abierta", "2026-11-20", getCostaRicaTodayDate(new Date("2026-11-21T05:59:00Z"))), false);
assert.equal(registrationExpired("inscripcion_abierta", "2026-11-20", getCostaRicaTodayDate(new Date("2026-11-21T06:00:00Z"))), true);

console.log("PASS regla de siguiente acción y armado del tablero.");
