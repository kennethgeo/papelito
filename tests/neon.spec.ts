import fs from "node:fs";
import { test, expect, type BrowserContext } from "@playwright/test";
import sharp from 'sharp';

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
  expect(config.origin).toBe("http://localhost:3042");
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
    await owner.goto("/");
    // A synthetic authenticator proves the real browser -> actions -> Neon flow.
    const cdp=await contexts[0].newCDPSession(owner);
    await cdp.send('WebAuthn.enable');
    await cdp.send('WebAuthn.addVirtualAuthenticator',{options:{protocol:'ctap2',transport:'internal',hasResidentKey:true,hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true}});
    await owner.getByRole('button',{name:'Mi cuenta',exact:true}).click();
    await owner.getByText('Seguridad y métodos de acceso',{exact:true}).click();
    await owner.getByLabel('Nombre de esta passkey',{exact:true}).fill('Dispositivo ficticio E2E');
    await expect(owner.getByText('Correo y contraseña',{exact:true})).toBeVisible();
    const linking = await contexts[0].request.post('/api/auth/link-social', {headers:{origin:config.origin},data:{provider:'google',callbackURL:config.origin+'/',disableRedirect:true},maxRedirects:0});
    expect(linking.status()).toBe(200);
    const linkingData=await linking.json();expect(new URL(linkingData.url).hostname).toBe('accounts.google.com');
    console.log('PASS inicio autenticado de vinculación Google mediante la API oficial; sin visitar ni autorizar una cuenta de Google.');
    await owner.getByRole('button',{name:'Registrar una passkey',exact:true}).click();
    await expect(owner.getByRole('status').filter({hasText:'Passkey registrada'})).toBeVisible();
    console.log('PASS registro de passkey con autenticador virtual.');
    await owner.getByRole('button',{name:/Cerrar sesión/}).click();
    await expect(owner.getByRole('button',{name:'Entrar con passkey',exact:true})).toBeVisible();
    await owner.getByRole('button',{name:'Entrar con passkey',exact:true}).click();
    await expect(owner.getByRole('button',{name:'Crear intercambio',exact:true})).toBeVisible();
    console.log('PASS ingreso con passkey.');
    await owner.reload();
    await owner.getByRole('button',{name:'Mi cuenta',exact:true}).click();
    await owner.getByText('Seguridad y métodos de acceso',{exact:true}).click();
    await expect(owner.getByText('Dispositivo ficticio E2E',{exact:true})).toBeVisible();
    // Close a second browser's access from the passkey session.
    const second=await browser.newContext({baseURL:config.origin});contexts.push(second);
    expect((await second.request.post('/api/auth/sign-in/email',{headers:{origin:config.origin},data:{email:config.fixtures[0].email,password:config.fixtures[0].password}})).status()).toBe(200);
    const secondSession=await (await second.request.get('/api/auth/get-session')).json();
    expect(secondSession.session.id).toMatch(/^[0-9a-f-]{36}$/i);
    const secondPage=await second.newPage();await secondPage.goto('/');
    await expect(secondPage.getByRole('button',{name:'Crear intercambio',exact:true})).toBeVisible();
    await owner.getByRole('button',{name:'Actualizar mis accesos',exact:true}).click();
    const otherAccess=owner.locator(`[data-session-id="${secondSession.session.id}"]`);
    await otherAccess.getByRole('button',{name:'Cerrar este acceso',exact:true}).click();
    await otherAccess.getByRole('button',{name:'Confirmar cierre de acceso',exact:true}).click();
    await expect(owner.getByRole('status').filter({hasText:'Cerramos ese acceso'})).toBeVisible();
    await secondPage.reload();
    await expect(secondPage.getByRole('button',{name:'Continuar con Google',exact:true})).toBeVisible();
    await expect(secondPage.getByRole('button',{name:'Crear intercambio',exact:true})).toHaveCount(0);
    await owner.getByRole('button',{name:'Quitar Dispositivo ficticio E2E',exact:true}).click();
    await owner.getByRole('button',{name:'Confirmar quitar passkey',exact:true}).click();
    await expect(owner).toHaveURL(/auth\/confirmar/);
    await owner.goto('/');
    await expect(owner.getByRole('button',{name:'Continuar con Google',exact:true})).toBeVisible();
    // Existing verified email/password remains a recovery method.
    expect((await contexts[0].request.post('/api/auth/sign-in/email',{headers:{origin:config.origin},data:{email:config.fixtures[0].email,password:config.fixtures[0].password}})).status()).toBe(200);
    await owner.goto('/');await expect(owner.getByRole('button',{name:'Crear intercambio',exact:true})).toBeVisible();
    console.log('PASS passkeys + Neon: registro WebAuthn, ingreso, persistencia, cierre de otra sesión, revocación de llave y recuperación con la misma cuenta.');
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
    await owner.getByRole('button', { name: 'Mostrar QR de invitación' }).click();
    await expect(owner.getByRole('img', { name: `Código QR para unirse a ${group}` })).toHaveAttribute('src', /^data:image\/png;base64,/);
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
      await page.getByRole('button', { name: 'Mi cuenta', exact: true }).click();
      await page.getByLabel('Mis gustos y pasatiempos', { exact: true }).fill(`Gustos de Prueba ${i + 1}`);
      await page.getByRole('button', { name: 'Guardar mis gustos' }).click();
      await expect(page.getByRole('status').filter({ hasText: 'Tus pistas quedaron guardadas' })).toBeVisible();
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
      if (i === 0) {
        const photo = await sharp({create:{width:40,height:30,channels:3,background:'#7043a2'}}).png().toBuffer();
        await card.locator('input[type=file]').setInputFiles({name:'foto-ficticia.png',mimeType:'image/png',buffer:photo});
        await expect(card.getByRole('img',{name:'Referencia visual del regalo'})).toBeVisible();
        const imageURL=await card.getByRole('img',{name:'Referencia visual del regalo'}).getAttribute('src');
        expect((await contexts[1].request.get(imageURL!)).status()).toBe(404);
        expect((await contexts[0].request.get(imageURL!)).status()).toBe(200);
      }
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
      await expect(page.getByRole('heading', { name: 'Pistas sobre sus gustos.' })).toBeVisible();
      await expect(page.getByText(`Gustos de ${name}`, { exact: true })).toBeVisible();
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
    for (const [i, page] of pages.entries()) {
      const chat = page.locator('.anonymous-sheet');
      await chat.getByLabel('Tu mensaje', { exact: true }).fill(`Pregunta anónima ${i + 1}`);
      await chat.getByRole('button', { name: 'Enviar mensaje', exact: true }).click();
      await expect(chat.getByRole('status')).toHaveText('Mensaje enviado.');
    }
    for (const [i, page] of pages.entries()) {
      const giverIndex = receivers.indexOf(`Prueba ${i + 1}`);
      const chat = page.locator('.anonymous-sheet');
      await chat.getByRole('button', { name: 'Quien me regala', exact: true }).click();
      await chat.getByRole('button', { name: 'Actualizar mensajes', exact: true }).click();
      await expect(chat.getByText(`Pregunta anónima ${giverIndex + 1}`, { exact: true })).toBeVisible();
      await expect(chat.locator('.message-bubble strong')).toHaveText('Tu amigo secreto');
    }
    await owner.getByText('Repetir este intercambio', { exact: true }).click();
    await owner.getByLabel('Nombre de la nueva edición').fill('Nueva edición técnica');
    await owner.getByLabel('Nueva fecha de entrega').fill('2099-12-25');
    await owner.getByRole('button', { name: 'Crear nueva edición' }).click();
    await expect(owner.getByRole('heading', { name: 'Nueva edición técnica', exact: true })).toBeVisible();
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
      "PASS navegador + Neon: 4 cuentas aisladas, gustos privados, QR, mensajes anónimos entre sesiones, nueva edición y reconexión sin perder borrador.",
    );
  } finally {
    for (const context of contexts) await context.close();
  }
});
