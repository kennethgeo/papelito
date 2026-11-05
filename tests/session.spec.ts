import { createHash, randomBytes, randomUUID } from "node:crypto";
import { test, expect, type Browser, type Page } from "@playwright/test";
// @ts-expect-error -- the project has no types for pg; `db` below declares what this file uses.
import pg from "pg";

// Real sessions, server actions and writes on the temporary database that
// scripts/serve-session.mjs starts. Every person here is fictional.
const ORIGIN = "http://127.0.0.1:3044";
const db: { query<T = unknown>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>; end(): Promise<void> } = new pg.Pool({ host: "127.0.0.1", port: 54329, user: "papelito", password: "solo-para-esta-prueba-local", database: "postgres" });
const REQUESTS = "Solicitudes por revisar";

test.afterAll(async () => {
  await db.end();
});

async function person(name: string) {
  const id = randomUUID();
  await db.query(`INSERT INTO neon_auth."user" (id, email, name) VALUES ($1, $2, $3)`, [id, `${id}@example.com`, name]);
  await db.query(`INSERT INTO profiles (user_id, alias, full_name) VALUES ($1, $2, $2)`, [id, name]);
  await db.query(
    `INSERT INTO consent_records (user_id, terms_version, privacy_version) VALUES ($1, '2026-10-31.1', '2026-10-31.1')`,
    [id],
  );
  await db.query(
    `INSERT INTO app_passkeys (credential_id, user_id, public_key, rp_id, label) VALUES ($1, $2, '\\x00', '127.0.0.1', 'Ficticia')`,
    [`cred-${id}`, id],
  );
  return id;
}

async function groupWith(requests: string[], approved = ["Ana", "Beto"]) {
  const owner = await person("Dueña");
  const name = `Grupo ${randomUUID().slice(0, 8)}`;
  const created = await db.query<{ id: string }>(
    `INSERT INTO exchanges (organizer_id, name, description, event_date, registration_deadline, budget_amount, currency, suggested_theme, selected_theme, requires_approval)
     VALUES ($1, $2, '', '2099-12-24', '2099-12-17', 10000, 'CRC', 'general', 'general', true) RETURNING id`,
    [owner, name],
  );
  const exchangeId = created.rows[0].id;
  const join = (id: string, status: string, organizer = false) =>
    db.query(
      `INSERT INTO memberships (exchange_id, user_id, is_organizer, status, approved_at, approved_by) VALUES ($1, $2, $3, $4, CASE WHEN $4 = 'approved' THEN now() END, CASE WHEN $4 = 'approved' THEN $5::text END)`,
      [exchangeId, id, organizer, status, owner],
    );
  await join(owner, "approved", true);
  for (const alias of approved) await join(await person(alias), "approved");
  const pending: Record<string, string> = {};
  for (const alias of requests) {
    pending[alias] = await person(alias);
    await join(pending[alias], "pending");
  }
  return { owner, name, exchangeId, pending };
}

const statusOf = async (exchangeId: string, userId: string) =>
  (await db.query<{ status: string }>(`SELECT status FROM memberships WHERE exchange_id = $1 AND user_id = $2`, [exchangeId, userId])).rows[0].status;

/** A browser session of its own: the app's real session cookie and lookup. */
async function signedIn(browser: Browser, userId: string, testInfo: { project: { use: { viewport?: { width: number; height: number } | null; isMobile?: boolean; hasTouch?: boolean } } }) {
  const { viewport, isMobile, hasTouch } = testInfo.project.use;
  const context = await browser.newContext({
    baseURL: ORIGIN,
    viewport: viewport ?? undefined,
    isMobile,
    hasTouch,
    locale: "es-CR",
    timezoneId: "America/Costa_Rica",
  });
  const token = randomBytes(32).toString("base64url");
  await db.query(
    `INSERT INTO app_passkey_sessions (token_hash, user_id, credential_id, browser) VALUES ($1, $2, $3, 'Prueba aislada')`,
    [createHash("sha256").update(token).digest("hex"), userId, `cred-${userId}`],
  );
  await context.addCookies([{ name: "papelito_passkey_dev", value: token, url: ORIGIN, httpOnly: true, sameSite: "Lax" }]);
  await context.addInitScript(() => localStorage.setItem("papelito-guide-seen", "yes"));
  return context;
}

async function openRequests(page: Page, count: number) {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Mis intercambios", level: 1 })).toBeVisible();
  const label = count === 1 ? "Revisar 1 solicitud" : `Revisar ${count} solicitudes`;
  await page.locator(".paper-task").filter({ hasText: label }).click();
  await expect(page.getByRole("heading", { name: REQUESTS })).toBeFocused();
  return page.getByRole("region", { name: REQUESTS });
}

const focusedName = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    return el?.getAttribute("aria-label") ?? el?.textContent?.trim() ?? "";
  });

const inView = async (page: Page, target: ReturnType<Page["locator"]>) => {
  const navTop = (await page.locator(".paper-navigation").boundingBox())!.y;
  const box = (await target.boundingBox())!;
  return box.y >= 0 && box.y + box.height <= navTop;
};

test("sesión: aprobar y rechazar actualizan la lista, y el foco sigue en un lugar útil", async ({ browser }, testInfo) => {
  const group = await groupWith(["Sofía", "Jorge", "Mari"]);
  const context = await signedIn(browser, group.owner, testInfo);
  const page = await context.newPage();
  const section = await openRequests(page, 3);
  const people = page.locator(".participant-list");
  await expect(section.locator(".join-request")).toHaveCount(3);

  // Aprobar: la fila se va, la persona entra a la lista y el foco pasa a la siguiente solicitud.
  await section.getByRole("button", { name: "Aprobar a Sofía", exact: true }).click();
  await expect(section.getByRole("status")).toHaveText("Sofía ya está en el intercambio.");
  await expect(section.locator(".join-request")).toHaveCount(2);
  await expect(people).toContainText("Sofía");
  await expect(section.getByRole("button", { name: "Aprobar a Jorge", exact: true })).toBeFocused();
  expect(await inView(page, section.getByRole("status"))).toBe(true);
  expect(await statusOf(group.exchangeId, group.pending["Sofía"])).toBe("approved");

  // Rechazar: confirma en la fila, la persona no entra y el foco pasa a la que queda.
  await section.getByRole("button", { name: "Rechazar a Jorge", exact: true }).click();
  await section.getByRole("button", { name: "Sí, rechazar", exact: true }).click();
  await expect(section.getByRole("status")).toHaveText("Rechazaste la solicitud de Jorge.");
  await expect(section.locator(".join-request")).toHaveCount(1);
  await expect(people).not.toContainText("Jorge");
  await expect(section.getByRole("button", { name: "Aprobar a Mari", exact: true })).toBeFocused();
  expect(await statusOf(group.exchangeId, group.pending["Jorge"])).toBe("rejected");

  // La última: la sección queda con la confirmación, que recibe el foco.
  await section.getByRole("button", { name: "Aprobar a Mari", exact: true }).click();
  await expect(section.getByRole("status")).toHaveText("Mari ya está en el intercambio.");
  await expect(section.locator(".join-request")).toHaveCount(0);
  await expect(section.getByRole("status")).toBeFocused();
  await expect(section).toContainText("No quedan solicitudes por revisar.");
  expect(await inView(page, section.getByRole("status"))).toBe(true);
  expect(await statusOf(group.exchangeId, group.pending["Mari"])).toBe("approved");

  // El tablero ya no ofrece revisar nada.
  await page.getByRole("button", { name: "← Mis intercambios" }).click();
  await expect(page.getByRole("heading", { name: "Mis intercambios", level: 1 })).toBeVisible();
  await expect(page.locator(".paper-task").filter({ hasText: "solicitud" })).toHaveCount(0);
  await context.close();
});

test("sesión: rechazar la última solicitud deja el foco en la confirmación", async ({ browser }, testInfo) => {
  const group = await groupWith(["Mari"]);
  const context = await signedIn(browser, group.owner, testInfo);
  const page = await context.newPage();
  const section = await openRequests(page, 1);

  await section.getByRole("button", { name: "Rechazar a Mari", exact: true }).click();
  await expect(section.getByRole("heading", { name: "¿Rechazar a Mari?" })).toBeFocused();
  await section.getByRole("button", { name: "Sí, rechazar", exact: true }).click();
  await expect(section.getByRole("status")).toHaveText("Rechazaste la solicitud de Mari.");
  await expect(section.getByRole("status")).toBeFocused();
  await expect(section.locator(".join-request")).toHaveCount(0);
  expect(await statusOf(group.exchangeId, group.pending["Mari"])).toBe("rejected");
  await context.close();
});

test("sesión: volver a entrar desde el tablero también llega a las solicitudes", async ({ browser }, testInfo) => {
  const group = await groupWith(["Sofía", "Jorge"]);
  const context = await signedIn(browser, group.owner, testInfo);
  const page = await context.newPage();
  const section = await openRequests(page, 2);
  await section.getByRole("button", { name: "Aprobar a Sofía", exact: true }).click();
  await expect(section.getByRole("status")).toHaveText("Sofía ya está en el intercambio.");
  await page.getByRole("button", { name: "← Mis intercambios" }).click();
  await page.locator(".paper-task").filter({ hasText: "Revisar 1 solicitud" }).click();
  await expect(page.getByRole("heading", { name: REQUESTS })).toBeFocused();
  await expect(section.locator(".join-request")).toHaveCount(1);
  await expect(section.getByRole("status")).toHaveCount(0);
  await context.close();
});

for (const action of ["approve", "reject"] as const) {
  test(`dos sesiones: una sortea mientras la otra intenta ${action === "approve" ? "aprobar" : "rechazar"}`, async ({ browser }, testInfo) => {
    const group = await groupWith(["Sofía", "Jorge"]);
    const first = await signedIn(browser, group.owner, testInfo);
    const second = await signedIn(browser, group.owner, testInfo);
    const page = await first.newPage();
    const other = await second.newPage();
    const section = await openRequests(page, 2);

    // La otra sesión sortea; esta sigue viendo los botones de antes.
    await other.goto(`/?vista=intercambio&intercambio=${group.exchangeId}`);
    await other.getByRole("button", { name: "Preparar sorteo", exact: true }).click();
    await other.getByRole("button", { name: "Confirmar sorteo", exact: true }).click();
    await expect(other.getByText("¡Sorteo listo!", { exact: false })).toBeVisible();
    await expect(section.getByRole("button", { name: "Aprobar a Sofía", exact: true })).toBeVisible();

    if (action === "approve") {
      await section.getByRole("button", { name: "Aprobar a Sofía", exact: true }).click();
    } else {
      await section.getByRole("button", { name: "Rechazar a Sofía", exact: true }).click();
      await section.getByRole("button", { name: "Sí, rechazar", exact: true }).click();
    }

    // Al refrescar se van los botones, pero el aviso sigue a la vista y explica qué pasó.
    await expect(page.getByRole("button", { name: /^(Aprobar|Rechazar) a / })).toHaveCount(0);
    const notice = page.getByRole("alert").filter({ hasText: "Sofía" });
    await expect(notice).toContainText("quedó fuera del sorteo");
    await expect(notice).toBeVisible();
    await expect(notice).toBeFocused();
    expect(await inView(page, notice)).toBe(true);
    await expect(page.getByText("2 solicitudes quedaron fuera de este sorteo", { exact: false })).toBeVisible();

    // Las reglas no cambiaron: la solicitud sigue pendiente y sin papelito.
    expect(await statusOf(group.exchangeId, group.pending["Sofía"])).toBe("pending");
    const assigned = await db.query(
      `SELECT 1 FROM assignments a JOIN exchanges e ON e.id = a.exchange_id WHERE e.id = $1 AND a.giver_id = $2`,
      [group.exchangeId, group.pending["Sofía"]],
    );
    expect(assigned.rows).toHaveLength(0);

    // Al volver a entrar ya no hay aviso viejo, solo el estado vigente.
    await page.reload();
    await expect(page.getByRole("heading", { name: group.name, level: 1 })).toBeVisible();
    await expect(page.getByRole("alert").filter({ hasText: "Sofía" })).toHaveCount(0);
    await expect(page.getByText("2 solicitudes quedaron fuera de este sorteo", { exact: false })).toBeVisible();
    await first.close();
    await second.close();
  });
}
