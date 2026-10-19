import { readOfflineCopy, openCopy, clearOfflineCopy } from './offline-vault.js';
/* eslint-disable @next/next/no-location-assign-relative-destination -- Standalone public offline viewer; no React router. */
const form = document.querySelector('#unlock'), output = document.querySelector('#private-content'), status = document.querySelector('#copy-status'), password = document.querySelector('#local-key');
let generation = 0, expiryTimer;
function lock() { clearTimeout(expiryTimer); generation++; output.replaceChildren(); password.value = ''; status.textContent = 'Copia bloqueada.'; }
function text(tag, value, parent = output) { const element = document.createElement(tag); element.textContent = String(value || ''); parent.append(element); return element; }
function wishes(items) { for (const wish of (Array.isArray(items) ? items : []).slice(0,50)) { const card = document.createElement('article'); output.append(card); text('h3',wish.title,card); if (wish.description) text('p',wish.description,card); if (typeof wish.url === 'string' && /^https?:\/\//i.test(wish.url)) { const a = text('a','Ver referencia con conexión',card); a.href = wish.url; a.target = '_blank'; a.rel = 'noopener noreferrer'; } } }
form.addEventListener('submit',async event => { event.preventDefault(); const attempt = ++generation, button = form.querySelector('button'); button.disabled = true; status.textContent = 'Abriendo copia…';
  try { const envelope = await readOfflineCopy(); if (!envelope) throw new Error('No hay una copia guardada en este navegador.'); const data = await openCopy(envelope,password.value); password.value = '';
    if (attempt !== generation || document.visibilityState === 'hidden') return;
    output.replaceChildren(); text('h2','Tu copia de lectura'); text('p',`Guardada: ${new Date(envelope.createdAt).toLocaleString('es-CR')}. Vence: ${new Date(envelope.expiresAt).toLocaleString('es-CR')}.`); text('p','Puede haber cambios desde esta copia. Reconectá antes de confirmar el sorteo o una compra.');
    if (data.assignment) { text('h2',data.assignment.exchangeName); text('p',`Tu regalo es para ${data.assignment.receiverAlias}.`); wishes(data.assignment.wishes); }
    text('h2','Mis deseos'); wishes(data.wishes); status.textContent = 'Copia abierta. Se bloqueará al salir de esta pantalla.';
    clearTimeout(expiryTimer); expiryTimer = setTimeout(() => { lock(); status.textContent = 'Esta copia venció. Reconectá para guardar una nueva.'; }, Math.max(0, envelope.expiresAt - Date.now()));
  } catch (e) { if (attempt === generation) { output.replaceChildren(); status.textContent = e.message || 'No pudimos abrir la copia.'; } } finally { button.disabled = false; }
});
document.querySelector('#lock').addEventListener('click',lock);
document.querySelector('#remove').addEventListener('click',async () => { lock(); await clearOfflineCopy(); status.textContent = 'Copia eliminada de este navegador.'; });
document.querySelector('#retry').addEventListener('click',() => window.location.assign('/'));
document.addEventListener('visibilitychange',() => { if (document.visibilityState === 'hidden') lock(); }); window.addEventListener('pagehide',lock);
