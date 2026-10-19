import assert from 'node:assert/strict';
import fs from 'node:fs';
import { register } from 'node:module';
import { randomBytes } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import sharp from 'sharp';
register('./ts-loader.mjs', import.meta.url);
process.env.NODE_ENV = 'test';
process.env.INVITATION_TOKEN_SECRET = randomBytes(32).toString('hex');
process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3042';
const { setTestDbAdapter } = await import('../src/lib/db/client.ts');
const { getOrCreateProfile, recordConsent, exportUserData } = await import('../src/lib/repositories/profiles.ts');
const { createExchangeWithInvitation, acceptInvitationAtomic, manageMemberStatus } = await import('../src/lib/repositories/exchanges.ts');
const { executeAndCommitDraw } = await import('../src/lib/repositories/draw.ts');
const { revealAssignment } = await import('../src/lib/repositories/assignments.ts');
const { saveWish, toggleWishInExchange } = await import('../src/lib/repositories/wishes.ts');
const selected = await import('../src/lib/repositories/selected-features.ts');
const photos = await import('../src/lib/repositories/photos.ts');
const keys = await import('../src/lib/repositories/passkeys.ts');
const { publicIP, publicFetch } = await import('../src/lib/security/public-fetch.ts');
const { LEGAL_CONSTANTS } = await import('../src/lib/legal/constants.ts');
const { calendarICS, countdownText } = await import('../src/lib/calendar.ts');
const { sealCopy, openCopy } = await import('../public/offline-vault.js');
const pg = new PGlite();
for (const file of fs.readdirSync('neon/migrations').sort()) await pg.exec(fs.readFileSync(`neon/migrations/${file}`, 'utf8'));
// Entirely fictitious provider schema, only in the in-memory test database.
await pg.exec(`CREATE SCHEMA neon_auth;
CREATE TABLE neon_auth."user" (id uuid PRIMARY KEY, email text, name text, banned boolean DEFAULT false);
CREATE TABLE neon_auth.account (id uuid PRIMARY KEY, "userId" uuid, "providerId" text);
CREATE TABLE neon_auth.session (id uuid PRIMARY KEY, "userId" uuid, "userAgent" text, "createdAt" timestamptz DEFAULT now(), "expiresAt" timestamptz DEFAULT now()+interval '1 day');`);
const query = async (sql, params = []) => { const r = await pg.query(sql, params); return { rows:r.rows, rowCount:r.rows.length || r.affectedRows || 0 }; };
setTestDbAdapter({ query });
try {
  for (const id of ['a','b','c','outside']) { await getOrCreateProfile(id, `${id}@example.com`, `Persona ${id}`); await recordConsent(id,LEGAL_CONSTANTS.VERSION,LEGAL_CONSTANTS.VERSION); }
  const input = { name:'Fiesta',eventDate:'2099-12-24',registrationDeadline:'2099-12-10',budgetAmount:10000,currency:'CRC',suggestedTheme:'navidad',selectedTheme:'navidad',requiresApproval:true };
  const ex = await createExchangeWithInvitation('a',input), id=ex.exchangeId;
  for (const u of ['b','c']) { await acceptInvitationAtomic(ex.inviteToken,u); await manageMemberStatus(id,u,'approved','a'); }
  await assert.rejects(()=>selected.mutateBudgetPoll(id,'outside','create',[5000,10000]),/disponible/);
  await assert.rejects(()=>selected.mutateBudgetPoll(id,'b','create',[5000,10000]),/organiza/);
  await selected.mutateBudgetPoll(id,'a','create',[5000,10000]);
  await selected.mutateBudgetPoll(id,'b','vote',5000); await selected.mutateBudgetPoll(id,'b','vote',10000);
  assert.deepEqual((await selected.getBudgetPoll(id,'b')).counts,[{amount:10000,count:1}]);
  await assert.rejects(()=>selected.mutateBudgetPoll(id,'a','create',[1,2]),/ya tiene/);
  await assert.rejects(()=>executeAndCommitDraw(id,'a',0),/encuesta/);
  await selected.mutateBudgetPoll(id,'a','close',10000);
  await assert.rejects(()=>selected.mutateBudgetPoll(id,'b','vote',5000),/abierta/);
  console.log('PASS encuesta: permisos, voto único modificable, agregados y sorteo bloqueado hasta cerrar.');

  const child=await selected.addRepresented(id,'b','Familiar B',true);
  assert.equal((await selected.getRepresented(id,'b'))[0].status,'pending');
  assert.equal((await selected.getRepresented(id,'a')).length,0);
  await assert.rejects(()=>selected.representedWish(id,'a',child,'Intrusión'),/a tu cargo/);
  await manageMemberStatus(id,child,'approved','a');
  await selected.representedWish(id,'b',child,'Libro ilustrado');
  const childWish=(await selected.getRepresented(id,'b'))[0].wishes[0].id;
  await selected.manageRepresentedWish(id,'b',child,childWish);
  assert.equal((await selected.getRepresented(id,'b'))[0].wishes.length,0);
  await selected.removeRepresented(id,'b',child);
  const rejected=await selected.addRepresented(id,'c','Familiar C',true);
  await manageMemberStatus(id,rejected,'approved','a');
  await manageMemberStatus(id,'c','rejected','a');
  assert.equal((await query('SELECT status FROM memberships WHERE user_id=$1',[rejected])).rows[0].status,'rejected');
  await manageMemberStatus(id,'c','approved','a');
  await selected.removeRepresented(id,'c',rejected);
  console.log('PASS representación: aprobación, aislamiento entre adultos, deseos propios, baja y rechazo en cascada.');

  const image=await sharp({create:{width:40,height:30,channels:3,background:'#6b31d0'}}).png().withMetadata({exif:{IFD0:{Artist:'DO NOT RETAIN'}}}).toBuffer();
  const wishes={};
  for(const u of ['a','b','c']) { wishes[u]=(await saveWish(u,{title:`Deseo de ${u}`})).wishId; await toggleWishInExchange(u,id,wishes[u],true); await photos.storeWishPhoto(u,wishes[u],image); }
  await assert.rejects(()=>photos.storeWishPhoto('outside',wishes.a,image),/pertenece/);
  await assert.rejects(()=>photos.normalizeWishImage(Buffer.from('<svg/>')),/JPG/);
  const own=await photos.readWishPhoto('a',wishes.a);const metadata=await sharp(own).metadata();assert.equal(metadata.format,'jpeg');assert.equal(metadata.exif,undefined);
  assert.equal(await photos.readWishPhoto('b',wishes.a),null);
  await executeAndCommitDraw(id,'a',0);
  const assignments=(await query('SELECT giver_id,receiver_id FROM assignments WHERE exchange_id=$1',[id])).rows;
  for(const a of assignments) { assert(await photos.readWishPhoto(a.giver_id,wishes[a.receiver_id]));const other=['a','b','c'].find(u=>u!==a.giver_id&&u!==a.receiver_id);assert.equal(await photos.readWishPhoto(other,wishes[a.receiver_id]),null); }
  assert.equal(await photos.readWishPhoto('outside',wishes.a),null);
  assert.equal((await selected.getPersonalHistory('a'))[0].receiver_alias,null);
  await revealAssignment(id,'a'); assert((await selected.getPersonalHistory('a'))[0].receiver_alias);
  assert.equal((await selected.getPersonalHistory('outside')).length,0);
  await assert.rejects(()=>selected.mutateBudgetPoll(id,'a','create',[1,2]),/antes del sorteo/);
  await query("UPDATE exchanges SET status='finalizado' WHERE id=$1",[id]);
  const giver=assignments.find(a=>a.receiver_id==='a').giver_id; assert.equal(await photos.readWishPhoto(giver,wishes.a),null);
  console.log('PASS fotos privadas: normalización sin metadatos, asignación vigente, terceros bloqueados y cierre; historial solo propio y revelado.');

  for(let i=0;i<5;i++)await selected.submitSupportReport('a',`Problema de prueba número ${i}`,'otro');
  await assert.rejects(()=>selected.submitSupportReport('a','Sexto reporte de prueba','otro'),/cinco/);
  const exported=await exportUserData('a');assert.equal(exported.supportReports.length,5);assert.equal(exported.myPhotos.length,1);
  assert(!JSON.stringify(exported).includes('Deseo de b'));
  console.log('PASS soporte: folios reales, límite diario y exportación sin deseos de terceros.');
  for(let n=0;n<20;n++) { const w=await saveWish('outside',{title:`Foto ${n}`}); await photos.storeWishPhoto('outside',w.wishId,image); }
  const extra=await saveWish('outside',{title:'Foto excedente'});
  await assert.rejects(()=>photos.storeWishPhoto('outside',extra.wishId,image),/cuota/);
  console.log('PASS cuota de fotos: la cuenta puede conservar 20 imágenes y la número 21 se rechaza.');

  const reg=await keys.registrationOptions({id:'a',email:'a@example.com'},'http://localhost:3042');
  assert.equal(reg.options.authenticatorSelection.userVerification,'required');
  await assert.rejects(()=>keys.finishRegistration('b',reg.token,{},'Nombre','http://localhost:3042'),/venció/);
  await assert.rejects(()=>keys.finishRegistration('a',reg.token,{},'Nombre','http://localhost:3042'),/venció/);
  assert.throws(()=>keys.trustedPasskeyOrigin('https://evil.example'),/oficial/);
  const authOwner='00000000-0000-4000-8000-000000000001', otherOwner='00000000-0000-4000-8000-000000000002', foreignSession='00000000-0000-4000-8000-000000000003';
  for(const u of [authOwner,otherOwner]){await getOrCreateProfile(u,`${u}@example.com`,'Cuenta ficticia');await query('INSERT INTO neon_auth."user" (id,email,name) VALUES ($1,$2,$3)',[u,`${u}@example.com`,'Cuenta ficticia']);}
  await query('INSERT INTO neon_auth.session (id,"userId") VALUES ($1,$2)',[foreignSession,otherOwner]);
  await query('INSERT INTO neon_auth.account (id,"userId","providerId") VALUES ($1,$2,$3)',[foreignSession,otherOwner,'credential']);
  assert.deepEqual((await keys.listAccountAccess(otherOwner)).providers,['credential']);
  const token='a'.repeat(43);await query('INSERT INTO app_passkeys (credential_id,user_id,public_key,rp_id,label) VALUES ($1,$2,$3,$4,$5)',['fake-key',otherOwner,Buffer.from([1]),'localhost','Test']);await query('INSERT INTO app_passkey_sessions (token_hash,user_id,credential_id,browser) VALUES ($1,$2,$3,$4)',[keys.hashToken(token),otherOwner,'fake-key','Test']);
  assert.equal((await keys.readPasskeyToken(token)).user.id,otherOwner);
  await keys.revokeAccountSession(authOwner,foreignSession,'neon');assert.equal((await query('SELECT * FROM app_session_revocations')).rowCount,0);
  await keys.revokeAccountSession(otherOwner,foreignSession,'neon');assert.equal((await query('SELECT * FROM app_session_revocations')).rowCount,1);
  assert.equal(await keys.readPasskeyToken('invalid'),null);
  assert.equal((await keys.listAccountAccess(otherOwner)).neon.length,0);
  console.log('PASS acceso: desafío de un solo uso vinculado a cuenta y origen, verificación requerida y revocación limitada al propietario.');
} finally { setTestDbAdapter(null); await pg.close(); }
const now=Date.now(), data={wishes:[{title:'Sorpresa privada'}],assignment:null};
const sealed=await sealCopy(data,'clave ficticia exclusiva',now);assert(!JSON.stringify(sealed).includes('Sorpresa privada'));
assert.deepEqual(await openCopy(sealed,'clave ficticia exclusiva',now),data);
await assert.rejects(()=>openCopy(sealed,'clave incorrecta',now),/clave/);
await assert.rejects(()=>openCopy({...sealed,cipher:sealed.cipher.slice(0,-4)+'AAAA'},'clave ficticia exclusiva',now),/clave/);
await assert.rejects(()=>openCopy(sealed,'clave ficticia exclusiva',now+86400000),/venció/);
await assert.rejects(()=>openCopy({...sealed,createdAt:now+1,expiresAt:sealed.expiresAt+1},'clave ficticia exclusiva',now),/clave/);
for(const ip of ['127.0.0.1','10.0.0.1','169.254.169.254','192.168.1.1','::1','::ffff:127.0.0.1','2001:db8::1'])assert.equal(publicIP(ip),false,ip);
assert.equal(publicIP('1.1.1.1'),true);
for(const url of ['http://example.com','https://localhost','https://example.com:444','https://user:pass@example.com'])await assert.rejects(()=>publicFetch(url,'html'));
assert.equal(countdownText('2026-12-24','2026-12-24','entrega'),'¡La entrega es hoy!');
assert.equal(countdownText('2026-12-24','2026-12-23','entrega'),'¡La entrega es mañana!');
const ics=calendarICS({id:'safe',name:'Fiesta; familiar, '+ 'á'.repeat(80)+'\nEND:VEVENT',eventDate:'2026-12-31'});
assert(ics.includes('DTEND;VALUE=DATE:20270101'));assert(ics.includes('Fiesta\\; familiar\\,'));
assert.equal(ics.split('\r\n').filter(l=>l==='END:VEVENT').length,1);
assert(ics.split('\r\n').every(l=>Buffer.byteLength(l)<=75));
console.log('PASS copia AES-GCM: clave, integridad, caducidad y metadatos autenticados; calendario sin inyección y filtro SSRF.');
