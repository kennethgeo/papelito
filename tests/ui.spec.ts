import { test, expect } from "@playwright/test";
import fs from 'node:fs';

test('calendario privado y presupuesto acordado con confirmación',async({page})=>{
  await page.getByRole('button',{name:'Crear intercambio',exact:true}).click();
  await page.getByLabel('¿Cómo se llama el intercambio?').fill('Fiesta de presupuesto');
  await page.getByLabel('¿Cuándo se entregan los regalos?').fill('2099-12-24');
  await page.getByRole('button',{name:'Revisar mi intercambio',exact:true}).click();
  await page.getByRole('button',{name:'Crear intercambio',exact:true}).click();
  await page.getByText('Guardar la fecha en mi calendario',{exact:true}).click();
  const download=page.waitForEvent('download');
  await page.getByRole('button',{name:'Descargar para mi calendario',exact:true}).click();
  const file=await download;const content=fs.readFileSync((await file.path())!,'utf8');
  expect(content).toContain('DTSTART;VALUE=DATE:20991224');
  expect(content).toContain('SUMMARY:Fiesta de presupuesto');
  expect(content).not.toMatch(/unirse\/|receiver|Kenneth/);
  await expect(page.getByRole('link',{name:'Preparar en Google Calendar ↗',exact:true})).toHaveAttribute('href',/^https:\/\/calendar.google.com\/calendar\/render\?/);
  await page.getByText('Acordar el presupuesto',{exact:true}).click();
  const poll=page.locator('.budget-sheet');
  await poll.getByRole('button',{name:'Abrir encuesta',exact:true}).click();
  await poll.getByRole('button',{name:/10.*000.*0 votos/}).click();
  await expect(poll.getByRole('button',{name:/Tu voto/})).toHaveAttribute('aria-pressed','true');
  await poll.getByRole('combobox',{name:'Presupuesto que se aplicará',exact:true}).selectOption('10000');
  await poll.getByRole('button',{name:'Cerrar encuesta',exact:true}).click();
  await expect(poll.getByRole('status')).toHaveCount(0);
  await poll.getByRole('button',{name:'Confirmar presupuesto',exact:true}).click();
  await expect(poll.getByRole('status')).toContainText('Presupuesto acordado:');
  await page.getByText('Reglas y cupos del intercambio',{exact:true}).click();
  await page.getByText('Editar reglas y capacidad',{exact:true}).click();
  await page.getByLabel('Cantidad máxima de participantes',{exact:true}).fill('3');
  await page.getByLabel('Reglas para este grupo',{exact:true}).fill('Regalo envuelto sin nombre, listo para sorprender.');
  await page.getByRole('button',{name:'Guardar reglas y cupos',exact:true}).click();
  await expect(page.getByRole('status').filter({hasText:'Reglas y capacidad guardadas.'})).toBeVisible();
  await expect(page.locator('.group-rules-paper')).toContainText('Regalo envuelto sin nombre');
  await page.getByRole('button',{name:/Marcar reglas leídas para/}).click();
  await expect(page.getByText(/1 de 1 personas marcaron esta versión/)).toBeVisible();
  await page.getByText('¿Nos vemos en la entrega?',{exact:true}).click();
  await page.getByRole('button',{name:'No voy',exact:true}).click();
  await expect(page.getByRole('button',{name:'No voy',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(page.getByRole('status').filter({hasText:'Tu participación en el sorteo se conserva.'})).toBeVisible();
  await page.reload();
  await page.getByRole('button',{name:'Intercambios',exact:true}).click();
  await page.getByRole('button',{name:/Fiesta de presupuesto/}).click();
  await page.getByText('Reglas y cupos del intercambio',{exact:true}).click();
  await expect(page.locator('.group-rules-paper')).toContainText('Regalo envuelto sin nombre');
  await page.getByText('¿Nos vemos en la entrega?',{exact:true}).click();
  await expect(page.getByRole('button',{name:'No voy',exact:true})).toHaveAttribute('aria-pressed','true');
  await noOverflow(page);
});

test('preferencias, guía, ayuda y copia cifrada de lectura sin conexión', async ({page,context})=>{
  await page.getByRole('button',{name:'Mi cuenta',exact:true}).click();
  await page.getByText('Verlo a tu manera',{exact:true}).click();
  await page.getByLabel('Texto más grande',{exact:true}).check();
  await page.getByLabel('Mayor contraste',{exact:true}).check();
  await page.getByLabel('Reducir animaciones',{exact:true}).check();
  await noOverflow(page);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-large-text','true');
  await expect(page.locator('html')).toHaveAttribute('data-high-contrast','true');
  await page.getByRole('button',{name:'Mi cuenta',exact:true}).click();
  await page.getByText('Guía y ayuda',{exact:true}).click();
  await page.getByRole('button',{name:'Ver guía inicial',exact:true}).click();
  await expect(page.getByRole('complementary',{name:'Guía de Papelito'})).toBeVisible();
  await page.getByRole('button',{name:'Omitir guía',exact:true}).click();
  await page.getByLabel('Buscar ayuda',{exact:true}).fill('passkey');
  await expect(page.getByText('Entrar a mi cuenta',{exact:true})).toBeVisible();
  await page.getByText('Reportar un problema',{exact:true}).click();
  await page.getByLabel('¿Qué estabas intentando hacer y qué ocurrió?',{exact:true}).fill('Reporte ficticio que no se envía desde la demo.');
  await page.getByRole('button',{name:'Revisar reporte',exact:true}).click();
  await expect(page.getByText('Estás en la demo. No se envía este reporte.',{exact:true})).toBeVisible();
  await page.getByText('Mi copia privada sin conexión',{exact:true}).click();
  await page.getByLabel('Elegí una clave local',{exact:true}).fill('Solo para prueba E2E');
  await page.getByLabel('Repetí la clave local',{exact:true}).fill('Solo para prueba E2E');
  await page.getByLabel('Quiero guardar esta copia cifrada y entiendo que puede haber cambios posteriores.',{exact:true}).check();
  await page.getByRole('button',{name:'Guardar copia privada',exact:true}).click();
  await expect(page.getByRole('link',{name:'Abrir copia de lectura',exact:true})).toBeVisible();
  await page.evaluate(async()=>{await navigator.serviceWorker.ready;if(!navigator.serviceWorker.controller)await new Promise<void>(resolve=>navigator.serviceWorker.addEventListener('controllerchange',()=>resolve(),{once:true}));});
  await page.getByRole('link',{name:'Abrir copia de lectura',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Tu papelito, a mano.',exact:true})).toBeVisible();
  await context.setOffline(true);
  await page.reload();
  await page.getByLabel('Clave local de la copia',{exact:true}).fill('Solo para prueba E2E');
  await page.getByRole('button',{name:'Abrir mi copia',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Tu copia de lectura',exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Mis deseos',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Bloquear copia',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Tu copia de lectura',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Eliminar copia local',exact:true}).click();
  await expect(page.getByRole('status')).toHaveText('Copia eliminada de este navegador.');
  await context.setOffline(false);
});

// Every test also checks the report-only CSP: nothing the app does may be
// reported, so the policy can later be enforced without breaking a flow.
const policyViolations = new WeakMap<import("@playwright/test").Page, string[]>();
test.beforeEach(async ({ page }) => {
  const violations: string[] = [];
  policyViolations.set(page, violations);
  await page.exposeBinding("__papelitoPolicyViolation", (_source, text: string) => { violations.push(text); });
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (event) => {
      (window as unknown as { __papelitoPolicyViolation: (text: string) => void }).__papelitoPolicyViolation(`${event.effectiveDirective} ${event.blockedURI} (${event.disposition}) ${event.sourceFile}:${event.lineNumber}:${event.columnNumber}`);
    });
  });
  await page.goto("/?mode=demo");
  await expect(
    page.getByRole("button", { name: "Crear intercambio", exact: true }),
  ).toBeVisible();
});

test.afterEach(async ({ page }) => {
  expect(policyViolations.get(page) ?? [], "la política de seguridad en modo reporte no debe registrar violaciones").toEqual([]);
});

async function noOverflow(page: import("@playwright/test").Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}

test("crear en dos pasos, corregir errores y conservar tema manual", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "Crear intercambio", exact: true })
    .click();
  await page.getByRole("button", { name: "Revisar mi intercambio" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Revisemos estos detalles" }),
  ).toContainText("Poné un nombre");
  await page
    .getByLabel("¿Cómo se llama el intercambio?")
    .fill("Fiesta de familia y amistades con un nombre bastante largo");
  await page.getByLabel("¿Cuándo se entregan los regalos?").fill("2099-12-24");
  await page.getByRole("button", { name: "Cumpleaños", exact: true }).click();
  await page.getByLabel("¿Cuándo se entregan los regalos?").fill("2099-02-14");
  await expect(
    page.getByRole("button", { name: "Cumpleaños", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await noOverflow(page);
  await page.getByRole("button", { name: "Revisar mi intercambio" }).click();
  await expect(
    page.getByRole("heading", { name: "Así queda tu invitación." }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Editar detalles", exact: true })
    .click();
  await expect(page.getByLabel("¿Cómo se llama el intercambio?")).toHaveValue(
    /Fiesta de familia/,
  );
  await page.getByRole("button", { name: "Revisar mi intercambio" }).click();
  await page
    .getByRole("button", { name: "Crear intercambio", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: /Fiesta de familia/, level: 1 }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Faltan 2 para sortear." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Preparar sorteo", exact: true }),
  ).toBeDisabled();
  await noOverflow(page);
});

test("deseo rápido, selección persistente, edición y borrado confirmado", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Mis deseos", exact: true }).click();
  await page
    .getByLabel("Idea de regalo", { exact: true })
    .fill("Una plantita y una maceta amarilla");
  await page.getByRole("button", { name: "Guardar idea", exact: true }).click();
  const card = page
    .getByRole("article")
    .filter({
      has: page.getByRole("heading", {
        name: "Una plantita y una maceta amarilla",
      }),
    });
  await expect(card).toBeVisible();
  await card.locator("summary").click();
  await card.getByLabel("Navidad en Familia Carvajal", { exact: true }).check();
  await expect(
    card.getByLabel("Navidad en Familia Carvajal", { exact: true }),
  ).toBeChecked();
  await page.reload();
  await page.getByRole("button", { name: "Mis deseos", exact: true }).click();
  await card.locator("summary").click();
  await expect(
    card.getByLabel("Navidad en Familia Carvajal", { exact: true }),
  ).toBeChecked();
  await card
    .getByRole("button", {
      name: "Editar Una plantita y una maceta amarilla",
      exact: true,
    })
    .click();
  await page
    .getByText("Agregar enlace, precio o detalles", { exact: true })
    .click();
  await page
    .getByLabel("Enlace al regalo", { exact: false })
    .fill("javascript:alert(1)");
  await page
    .getByRole("button", { name: "Guardar cambios", exact: true })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: "El enlace debe" }),
  ).toContainText("https://");
  await expect(page.getByLabel("Idea de regalo", { exact: true })).toHaveValue(
    "Una plantita y una maceta amarilla",
  );
  await page
    .getByLabel("Enlace al regalo", { exact: false })
    .fill("https://example.com/regalo");
  await page.getByLabel("Precio aproximado", { exact: true }).fill("0");
  await page
    .getByRole("button", { name: "Guardar cambios", exact: true })
    .click();
  await expect(card.getByRole("link", { name: "Ver regalo" })).toHaveAttribute(
    "href",
    "https://example.com/regalo",
  );
  await noOverflow(page);
  await card
    .getByRole("button", {
      name: "Borrar Una plantita y una maceta amarilla",
      exact: true,
    })
    .click();
  await card.getByRole("button", { name: "Conservar idea" }).click();
  await expect(card).toBeVisible();
  await card
    .getByRole("button", {
      name: "Borrar Una plantita y una maceta amarilla",
      exact: true,
    })
    .click();
  await card
    .getByRole("button", { name: "Sí, borrar idea", exact: true })
    .click();
  await expect(card).toHaveCount(0);
});

test("cuenta, guía de instalación y borrador durante desconexión", async ({
  page,
  context,
}) => {
  await page.getByRole("button", { name: "Mi cuenta", exact: true }).click();
  await page
    .getByText("Cómo agregarla en mi teléfono", { exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "iPhone o iPad" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Android", exact: true }),
  ).toBeVisible();
  await noOverflow(page);
  await page.getByRole("button", { name: "Mis deseos", exact: true }).click();
  await page
    .getByLabel("Idea de regalo", { exact: true })
    .fill("Mi idea sigue aquí");
  await context.setOffline(true);
  await expect(
    page.getByRole("status").filter({ hasText: "Sin conexión." }),
  ).toBeVisible();
  await expect(page.getByLabel("Idea de regalo", { exact: true })).toHaveValue(
    "Mi idea sigue aquí",
  );
  await context.setOffline(false);
  await expect(
    page.getByRole("status").filter({ hasText: "Volvió la conexión." }),
  ).toBeVisible();
  await expect(page.getByLabel("Idea de regalo", { exact: true })).toHaveValue(
    "Mi idea sigue aquí",
  );
});

test('gustos, instalación visible, mensajes de demo, QR y nueva edición', async ({ page, context }) => {
  await page.getByRole('button', { name: 'Instalar Papelito', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'iPhone o iPad' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Android', exact: true })).toBeVisible();
  expect(await page.evaluate(() => Notification.permission)).not.toBe('granted');
  await page.getByRole('button', { name: 'Mi cuenta', exact: true }).click();
  await page.getByLabel('Mis gustos y pasatiempos', { exact: true }).fill('Libros, plantas y rompecabezas');
  await page.getByLabel('Prefiero no recibir', { exact: true }).fill('Perfumes');
  await page.getByRole('button', { name: 'Guardar mis gustos' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Tus pistas quedaron guardadas' })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Mi cuenta', exact: true }).click();
  await expect(page.getByLabel('Mis gustos y pasatiempos', { exact: true })).toHaveValue('Libros, plantas y rompecabezas');
  await noOverflow(page);
  await page.getByRole('button', { name: 'Intercambios', exact: true }).click();
  await page.getByRole('button', { name: 'Ver intercambio', exact: true }).click();
  const chat = page.locator('.anonymous-sheet');
  await chat.getByLabel('Tu mensaje', { exact: true }).fill('¿Preferís azul o verde?');
  await chat.getByRole('button', { name: 'Enviar mensaje', exact: true }).click();
  await expect(chat.getByText('¿Preferís azul o verde?', { exact: true })).toBeVisible();
  await chat.getByRole('button', { name: 'Quien me regala', exact: true }).click();
  await expect(chat.getByText('¿Preferís azul o verde?', { exact: true })).toHaveCount(0);
  await noOverflow(page);
  await page.getByRole('button', { name: 'Intercambios', exact: true }).click();
  await page.getByRole('button', { name: 'Crear intercambio', exact: true }).click();
  await page.getByLabel('¿Cómo se llama el intercambio?').fill('Grupo para repetir');
  await page.getByRole('button', { name: 'Revisar mi intercambio' }).click();
  await page.getByRole('button', { name: 'Crear intercambio', exact: true }).click();
  await page.getByRole('button', { name: 'Mostrar QR de invitación' }).click();
  await expect(page.getByRole('img', { name: 'Código QR para unirse a Grupo para repetir' })).toHaveAttribute('src', /^data:image\/png;base64,/);
  await noOverflow(page);
  await page.getByText('Repetir este intercambio', { exact: true }).click();
  await page.getByLabel('Nombre de la nueva edición').fill('Segunda edición');
  await page.getByRole('button', { name: 'Crear nueva edición' }).click();
  await expect(page.getByRole('heading', { name: 'Segunda edición', exact: true })).toBeVisible();
  await noOverflow(page);
  await context.clearPermissions();
});

test('Atrás del sistema, recarga y foco conservan la vista sin datos privados en la URL', async ({ page }) => {
  await page.locator('.paper-invitation').first().click();
  const heading = page.getByRole('heading', { level: 1 }).first();
  await expect(heading).toBeVisible();
  const exchangeName = await heading.innerText();
  expect(page.url()).toMatch(/vista=intercambio&intercambio=/);
  await expect(page).toHaveTitle(new RegExp(exchangeName.slice(0, 12)));
  await page.getByRole('button', { name: 'Mis deseos', exact: true }).click();
  await expect(page).toHaveURL(/vista=deseos/);
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeFocused();
  await page.goBack();
  await expect(page.getByRole('heading', { name: exchangeName, level: 1 })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: exchangeName, level: 1 })).toBeVisible();
  await page.getByRole('button', { name: '← Mis intercambios' }).click();
  await expect(page).not.toHaveURL(/vista=/);
  await expect(page.getByRole('button', { name: 'Crear intercambio', exact: true })).toBeVisible();
  expect(decodeURIComponent(page.url())).not.toMatch(/regalo|deseo=|asignaci|alias|@/i);
  await noOverflow(page);
});

test('la vista previa de tiendas solo se ofrece donde el servidor puede consultarla', async ({ page }) => {
  await page.getByRole('button', { name: 'Mis deseos', exact: true }).click();
  await page.getByText('Agregar enlace, precio o detalles', { exact: true }).click();
  await page.locator('#wish-url').fill('https://tienda.example/producto');
  const button = page.getByRole('button', { name: 'Preparar vista previa del enlace' });
  // The Workers bundle cannot pin DNS for store lookups; next start can.
  if (process.env.PAPELITO_E2E_WORKERD === '1') await expect(button).toHaveCount(0);
  else await expect(button).toBeVisible();
});

test('la navegación inferior se oculta solo con teclado en pantalla y no tapa campos', async ({ page }) => {
  await page.getByRole('button', { name: 'Mis deseos', exact: true }).click();
  const nav = page.getByRole('navigation', { name: 'Navegación principal' });
  const field = page.getByLabel('Idea de regalo', { exact: true });
  await field.focus();
  await expect(nav).toBeVisible(); // focusing a field without a keyboard (desktop, emulation) keeps it
  await page.evaluate(() => {
    const viewport = window.visualViewport!;
    Object.defineProperty(viewport, 'height', { configurable: true, get: () => window.innerHeight - 320 });
    viewport.dispatchEvent(new Event('resize'));
  });
  await expect(nav).toBeHidden();
  await page.getByRole('heading', { level: 1 }).first().focus();
  await expect(nav).toBeVisible();
  await page.evaluate(() => { const viewport = window.visualViewport!; Reflect.deleteProperty(viewport, 'height'); viewport.dispatchEvent(new Event('resize')); });
  const layout = await page.evaluate(() => {
    const navBox = document.querySelector('.paper-navigation')!.getBoundingClientRect();
    return { navTop: navBox.top, scrollPadding: getComputedStyle(document.documentElement).scrollPaddingBottom };
  });
  expect(parseFloat(layout.scrollPadding)).toBeGreaterThanOrEqual(96);
  expect(layout.navTop).toBeGreaterThan(0);
});

test('guía solo en la lista y página de error 404 en español', async ({ page }) => {
  await expect(page.getByRole('complementary', { name: 'Guía de Papelito' })).toBeVisible();
  await page.getByRole('button', { name: 'Mis deseos', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Guía de Papelito' })).toHaveCount(0);
  await page.goto('/esta-pagina-no-existe');
  await expect(page.getByRole('heading', { name: 'No encontramos esta página.' })).toBeVisible();
});

test('acceso: Google primero, luego correo y la passkey como opción secundaria', async ({ page }) => {
  await page.goto('/');
  const card = page.locator('.paper-access');
  const google = card.getByRole('button', { name: 'Continuar con Google' });
  const email = card.getByLabel('Correo electrónico');
  await expect(google).toBeVisible();
  const [googleBox, emailBox] = [await google.boundingBox(), await email.boundingBox()];
  expect(googleBox!.y).toBeLessThan(emailBox!.y);
  await noOverflow(page);
});

test('cabeceras de seguridad: CSP en modo reporte, Permissions-Policy y detección de recursos externos', async ({ page }) => {
  const response = await page.goto('/?mode=demo');
  const headers = response!.headers();
  expect(headers['content-security-policy-report-only']).toContain("default-src 'self'");
  expect(headers['content-security-policy']).toBeUndefined();
  expect(headers['permissions-policy']).toContain('camera=()');
  // Report-only never blocks: an external image is reported (so the collector works) but still requested.
  await page.evaluate(() => { const img = document.createElement('img'); img.src = 'https://tienda.invalid/foto.png'; document.body.append(img); });
  const violations = policyViolations.get(page)!;
  await expect.poll(() => violations.length).toBe(1);
  expect(violations[0]).toMatch(/^img-src https:\/\/tienda\.invalid\/foto\.png \(report\) /);
  violations.length = 0;
});

// Tablero con los seis grupos de la demo, en una fecha fija de Costa Rica.
async function openBoard(page: import("@playwright/test").Page) {
  await page.clock.setFixedTime(new Date("2026-11-04T12:00:00-06:00"));
  await page.evaluate(() => localStorage.setItem("papelito-guide-seen", "yes"));
  await page.reload();
  await expect(page.getByRole("heading", { name: "Mis intercambios", level: 1 })).toBeVisible();
}
const aboveNav = async (page: import("@playwright/test").Page, locator: import("@playwright/test").Locator) => {
  const navTop = (await page.locator(".paper-navigation").boundingBox())!.y;
  const box = (await locator.boundingBox())!;
  return box.y >= 0 && box.y + box.height <= navTop;
};

test("tablero: qué hacer primero, orden por vencimiento y sobre solo con papelito propio", async ({ page }) => {
  await openBoard(page);
  const envelope = page.getByRole("region", { name: "Tu papelito sin abrir" });
  await expect(envelope.getByRole("heading", { name: "Navidad en Familia Carvajal" })).toBeVisible();
  await expect(envelope.getByRole("button", { name: "Abrir mi papelito", exact: true })).toBeVisible();
  const tasks = page.getByRole("region", { name: "Por hacer" }).locator(".paper-task");
  await expect(tasks.first()).toContainText("Revisar sorteo");
  await expect(tasks.first()).toContainText("Fútbol de los jueves");
  await expect(tasks.first()).toContainText("Cierra mañana");
  await expect(tasks.nth(1)).toContainText("Revisar 3 solicitudes");
  await expect(page.locator(".paper-invitation")).toHaveCount(6);
  await expect(page.locator(".paper-invitation").first()).toContainText("Fútbol de los jueves");
  await expect(page.locator(".paper-invitation").filter({ hasText: "Cumpleaños de Sofi" })).toContainText("En preparación");
  // El tablero no recibe destinatarios: el nombre real solo existe tras abrir.
  await expect(page.locator("#app-content")).not.toContainText("María Eugenia");
  await noOverflow(page);

  await envelope.getByRole("button", { name: "Abrir mi papelito", exact: true }).click();
  await page.locator(".paper-reveal-closed").getByRole("button", { name: "Abrir mi papelito", exact: true }).click();
  await expect(page.locator(".paper-secret-card")).toBeVisible();
  await page.getByRole("button", { name: "Intercambios", exact: true }).click();
  await expect(page.getByRole("region", { name: "Tu papelito sin abrir" })).toHaveCount(0);
  await expect(page.locator(".paper-invitation").filter({ hasText: "Navidad en Familia Carvajal" })).toContainText("Papelito abierto");
});

test("tablero: filtro de rol y tareas adicionales", async ({ page }) => {
  await openBoard(page);
  const filters = page.getByRole("group", { name: "Filtrar intercambios" });
  await filters.getByRole("button", { name: "Organizo", exact: true }).click();
  await expect(page.locator(".paper-invitation")).toHaveCount(4);
  await expect(page.locator(".paper-invitation").filter({ hasText: "Navidad en Familia Carvajal" })).toHaveCount(0);
  await filters.getByRole("button", { name: "Me invitaron", exact: true }).click();
  await expect(page.locator(".paper-invitation")).toHaveCount(2);
  await filters.getByRole("button", { name: "Todos", exact: true }).click();
  await expect(page.locator(".paper-invitation")).toHaveCount(6);
});

test("tablero: primera pantalla por tamaño, sin desbordes", async ({ page }, testInfo) => {
  const tasks = () => page.getByRole("region", { name: "Por hacer" }).getByRole("button");
  if (testInfo.project.name === "mobile-320") {
    await page.setViewportSize({ width: 320, height: 640 });
    await openBoard(page);
    expect(await aboveNav(page, page.getByRole("region", { name: "Tu papelito sin abrir" }).getByRole("button", { name: "Abrir mi papelito", exact: true }))).toBe(true);
    expect(await aboveNav(page, page.locator(".paper-invitation").first())).toBe(true);
    await tasks().filter({ hasText: "Ver 3 más" }).click();
    await expect(tasks().filter({ hasText: "Revisar 3 solicitudes" })).toBeVisible();
  } else if (testInfo.project.name === "mobile-390") {
    await openBoard(page);
    expect(await aboveNav(page, tasks().nth(1))).toBe(true);
    expect(await aboveNav(page, page.locator(".paper-invitation").nth(1))).toBe(true);
  } else {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openBoard(page);
    for (let i = 0; i < 6; i++) expect(await aboveNav(page, page.locator(".paper-invitation").nth(i))).toBe(true);
  }
  await noOverflow(page);
  for (const target of await page.locator(".paper-task, .paper-invitation, .paper-button--create").all()) {
    expect((await target.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  const small = await page.locator(".paper-dashboard").evaluate((root) =>
    [...root.querySelectorAll<HTMLElement>("*")].filter((el) => el.children.length === 0 && el.textContent?.trim() && parseFloat(getComputedStyle(el).fontSize) < 14).map((el) => el.textContent),
  );
  expect(small).toEqual([]);
});

test("tablero: teclado, foco visible y movimiento reducido", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openBoard(page);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  const open = page.getByRole("region", { name: "Tu papelito sin abrir" }).getByRole("button", { name: "Abrir mi papelito", exact: true });
  let reached = false;
  for (let i = 0; i < 4 && !reached; i++) {
    await page.keyboard.press("Tab");
    reached = await open.evaluate((el) => el === document.activeElement);
  }
  expect(reached, "la primera tarea se alcanza en 4 tabulaciones o menos").toBe(true);
  const outline = await open.evaluate((el) => { const s = getComputedStyle(el); return { width: parseFloat(s.outlineWidth), style: s.outlineStyle }; });
  expect(outline.width).toBeGreaterThanOrEqual(3);
  expect(outline.style).toBe("solid");
  // La tarjeta se nombra completa para un lector de pantalla y abre con Enter.
  const card = page.locator(".paper-invitation").filter({ hasText: "Las primas de San Ramón" });
  await expect(card).toHaveAttribute("aria-label", /Las primas de San Ramón.*22 de diciembre.*Organizás.*Invitar: falta 1 persona/);
  await card.focus();
  const nav = (await page.locator(".paper-navigation").boundingBox())!.y;
  expect((await card.boundingBox())!.y + (await card.boundingBox())!.height).toBeLessThanOrEqual(nav);
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Las primas de San Ramón", level: 1 })).toBeFocused();
});

test("demo: aprobar una solicitud ficticia no simula una falla de conexión", async ({ page }) => {
  await openBoard(page);
  await page.getByRole("region", { name: "Por hacer" }).getByRole("button").filter({ hasText: "Revisar 3 solicitudes" }).click();
  await page.getByRole("button", { name: "Aprobar a Sofía C.", exact: true }).click();
  await expect(page.locator(".workshop-error")).toHaveCount(0);
  await expect(page.locator(".workshop-success").filter({ hasText: "de ejemplo" })).toBeVisible();
});
