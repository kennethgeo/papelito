import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/?mode=demo");
  await expect(
    page.getByRole("button", { name: "Crear intercambio", exact: true }),
  ).toBeVisible();
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
