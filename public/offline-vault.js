const DB = 'papelito-private-copy', STORE = 'sealed', DAY = 86400000;
const b64 = value => { let text = ''; for (const b of new Uint8Array(value)) text += String.fromCharCode(b); return btoa(text); };
const bytes = value => Uint8Array.from(atob(value), c => c.charCodeAt(0));
async function key(password, salt) {
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) throw new Error('Elegí una clave local de 8 a 128 caracteres.');
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 310000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
const aad = e => new TextEncoder().encode(`papelito-offline-v1:${e.createdAt}:${e.expiresAt}`);
export async function sealCopy(data, password, now = Date.now()) {
  const text = JSON.stringify(data); if (new TextEncoder().encode(text).length > 200000) throw new Error('La copia es demasiado grande.');
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const e = { version: 1, createdAt: now, expiresAt: now + DAY, salt: b64(salt), iv: b64(iv), cipher: '' };
  e.cipher = b64(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad(e) }, await key(password, salt), new TextEncoder().encode(text))); return e;
}
export async function openCopy(e, password, now = Date.now()) {
  if (!e || e.version !== 1 || !Number.isFinite(e.createdAt) || e.expiresAt - e.createdAt !== DAY || e.createdAt > now + 300000) throw new Error('La copia no tiene un formato válido.');
  if (e.expiresAt <= now) throw new Error('Esta copia venció. Volvé a conectarte para guardar una nueva.');
  try { const iv = bytes(e.iv), salt = bytes(e.salt); if (iv.length !== 12 || salt.length !== 16 || e.cipher.length > 300000) throw new Error();
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: aad(e) }, await key(password, salt), bytes(e.cipher)); return JSON.parse(new TextDecoder().decode(plain));
  } catch { throw new Error('No pudimos abrir la copia. Revisá la clave local.'); }
}
function database() { return new Promise((resolve, reject) => { const r = indexedDB.open(DB,1); r.onupgradeneeded = () => r.result.createObjectStore(STORE); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(new Error('Este navegador no permite guardar la copia privada.')); }); }
export async function readOfflineCopy() { const db = await database(); return new Promise((resolve, reject) => { const tx = db.transaction(STORE,'readonly'), r = tx.objectStore(STORE).get('current'); r.onsuccess = () => resolve(r.result || null); r.onerror = () => reject(r.error); tx.oncomplete = () => db.close(); tx.onabort = () => db.close(); }); }
export async function writeOfflineCopy(envelope) { const db = await database(); return new Promise((resolve, reject) => { const tx = db.transaction(STORE,'readwrite'); tx.objectStore(STORE).put(envelope,'current'); tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => { db.close(); reject(new Error('No pudimos guardar la copia.')); }; }); }
export async function clearOfflineCopy() { const db = await database(); return new Promise((resolve, reject) => { const tx = db.transaction(STORE,'readwrite'); tx.objectStore(STORE).clear(); tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => { db.close(); reject(new Error('No pudimos borrar la copia local.')); }; }); }
