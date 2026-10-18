import fs from "node:fs";
import { test, expect, type BrowserContext } from "@playwright/test";

test("cuatro cuentas: crear, invitar, aprobar, deseos, sorteo, secreto y reconexión", async ({
  browser,
}) => {
  test.skip(
    process.env.PAPELITO_E2E_REMOTE !== "1",
    "Solo la ejecuta el preparador de rama aislada.",
  );
  const config = JSON.parse(fs.readFileSync(".env.e2e-pilot.json", "utf8")) as {
    project: string;
    branchId: string;
    branchName: string;
    origin: string;
    fixtures: Array<{
      id: string;
      name: string;
      email: string;
      password: string;
    }>;
  };
  expect(config.project).toBe("spring-frog-51248337");
  expect(config.branchId).not.toBe("br-royal-tooth-b4ru7kif");
  expect(config.branchName).toMatch(/^codex-e2e-/);
  expect(config.origin).toBe("http://127.0.0.2:3042");
  const contexts: BrowserContext[] = [];
  try {
    for (const person of config.fixtures) {
      const context = await browser.newContext({
        baseURL: config.origin,
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        locale: "es-CR",
      });
      contexts.push(context);
      const result = await context.request.post("/api/auth/sign-in/email", {
        headers: { origin: config.origin },
        data: { email: person.email, password: person.password },
      });
      expect(result.status()).toBe(200);
    }
    const pages = await Promise.all(
      contexts.map((context) => context.newPage()),
    );
    const owner = pages[0];
    const group = "Fiesta técnica de cuatro papelitos";
    await owner.goto("/");
    await owner
      .getByRole("button", { name: "Crear intercambio", exact: true })
      .click();
    await owner.getByLabel("¿Cómo se llama el intercambio?").fill(group);
    await owner
      .getByLabel("¿Cuándo se entregan los regalos?")
      .fill("2099-12-24");
    await owner.getByRole("button", { name: "Revisar mi intercambio" }).click();
    await owner
      .getByRole("button", { name: "Crear intercambio", exact: true })
      .click();
    await expect(
      owner.getByRole("heading", { name: group, exact: true }),
    ).toBeVisible();
    await owner.getByRole("button", { name: "Preparar para WhatsApp" }).click();
    const href = await owner
      .getByRole("link", { name: "Abrir WhatsApp" })
      .getAttribute("href");
    const invite = new URL(href!).searchParams
      .get("text")!
      .split(" ")
      .find((part) => part.startsWith(`${config.origin}/unirse/`))!;
    // Read the visible invitation metadata; no private application state or session token is used.
    for (const page of pages.slice(1)) {
      await page.goto(invite);
      await page
        .getByRole("button", { name: "Unirme al intercambio", exact: true })
        .click();
      await expect(
        page.getByRole("heading", { name: "Tu lugar está en espera." }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "La gente del intercambio" }),
      ).toHaveCount(0);
    }
    await owner.getByRole("button", { name: "Actualizar grupo" }).click();
    for (const person of config.fixtures.slice(1))
      await owner
        .getByRole("button", { name: `Aprobar a ${person.name}`, exact: true })
        .click();
    await expect(
      owner.getByRole("heading", { name: "Ya pueden sortear." }),
    ).toBeVisible();
    for (const [i, page] of pages.entries()) {
      if (i)
        await page.getByRole("button", { name: "Revisar mi ingreso" }).click();
      await page
        .getByRole("button", { name: "Mis deseos", exact: true })
        .click();
      const idea = `Pista de Prueba ${i + 1}`;
      await page.getByLabel("Idea de regalo", { exact: true }).fill(idea);
      await page
        .getByRole("button", { name: "Guardar idea", exact: true })
        .click();
      const card = page
        .getByRole("article")
        .filter({
          has: page.getByRole("heading", { name: idea, exact: true }),
        });
      await card.locator("summary").click();
      await card.getByLabel(group, { exact: true }).check();
      await expect(
        page.getByText("Idea compartida en ese intercambio.", { exact: true }),
      ).toBeVisible();
    }
    await owner
      .getByRole("button", { name: "Intercambios", exact: true })
      .click();
    await owner.getByRole("button", { name: new RegExp(group) }).click();
    await owner
      .getByRole("button", { name: "Preparar sorteo", exact: true })
      .click();
    await owner
      .getByRole("button", { name: "Confirmar sorteo", exact: true })
      .click();
    await expect(
      owner.getByRole("heading", { name: "Tu papelito sigue aquí." }),
    ).toBeVisible();
    const receivers: string[] = [];
    for (const [i, page] of pages.entries()) {
      if (i) {
        await page
          .getByRole("button", { name: "Intercambios", exact: true })
          .click();
        await page.getByRole("button", { name: new RegExp(group) }).click();
      }
      const assignmentResponse = page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          response.url() === `${config.origin}/`,
      );
      await page
        .getByRole("button", { name: "Abrir mi papelito", exact: true })
        .click();
      await assignmentResponse;
      await page
        .getByRole("button", { name: "Abrir mi papelito", exact: true })
        .click();
      const recipient = page.getByRole("heading", { level: 1 });
      await expect(recipient).toHaveText(/^Prueba [1-4]$/);
      const name = (await recipient.textContent())!.trim();
      expect(name).not.toBe(config.fixtures[i].name);
      receivers.push(name);
      await expect(
        page.getByRole("heading", { name: `Pista de ${name}`, exact: true }),
      ).toBeVisible();
      await page.getByLabel("Marcar como elegido", { exact: true }).check();
      await expect(
        page.getByLabel("Ya elegí este regalo", { exact: true }),
      ).toBeChecked();
      await page
        .getByRole("button", { name: "Volver al intercambio", exact: true })
        .click();
    }
    expect(new Set(receivers).size).toBe(4);
    await owner
      .getByRole("button", { name: "Mis deseos", exact: true })
      .click();
    await contexts[0].setOffline(true);
    await owner
      .getByLabel("Idea de regalo", { exact: true })
      .fill("Borrador sin conexión");
    await owner
      .getByRole("button", { name: "Guardar idea", exact: true })
      .click();
    await expect(owner.getByRole("alert").first()).toBeVisible();
    await expect(
      owner.getByLabel("Idea de regalo", { exact: true }),
    ).toHaveValue("Borrador sin conexión");
    await contexts[0].setOffline(false);
    await expect(
      owner.getByText("Volvió la conexión.", { exact: false }),
    ).toBeVisible();
    // The application state was not reset by reconnection.
    await expect(
      owner.getByLabel("Idea de regalo", { exact: true }),
    ).toHaveValue("Borrador sin conexión");
    console.log(
      "PASS navegador + Neon: 4 cuentas reales aisladas, creación/adhesión/aprobación/pistas/sorteo/revelación y reconexión sin perder borrador.",
    );
  } finally {
    for (const context of contexts) await context.close();
  }
});
