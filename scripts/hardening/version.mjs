// FUN-03: reads never describe a failure as a change; a new deployment is
// detected and announced, and failed mutations are never retried.
import assert from 'node:assert/strict';

const test = globalThis.__papelitoTest;
process.env.PAPELITO_BUILD_ID = 'build-actual';
const events = [];
let deployed = 'build-actual';
const realFetch = globalThis.fetch;

async function withBrowser(fn) {
  const previousWindow = globalThis.window;
  globalThis.window = { dispatchEvent: (event) => events.push(event.type) };
  globalThis.fetch = async (input, init) => {
    if (input === '/api/version') {
      assert.equal(init?.cache, 'no-store');
      return Response.json({ version: deployed });
    }
    return realFetch(input, init);
  };
  try { return await fn(); } finally {
    globalThis.fetch = realFetch;
    if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow;
  }
}

const { callServerAction, callServerRead } = await import('../../src/lib/client-actions.ts');
const { checkDeployedVersion } = await import('../../src/lib/version.ts');

test('versiones: mismo despliegue, despliegue nuevo y lecturas sin lenguaje de cambios', async () => {
  await withBrowser(async () => {
    events.length = 0;
    deployed = 'build-actual';
    assert.equal(await checkDeployedVersion(), 'same');
    let attempts = 0;
    const failure = await callServerAction(async () => { attempts++; throw new Error('Server action not found'); });
    assert.equal(attempts, 1, 'mutations are never retried');
    assert.match(failure.error, /No pudimos confirmar el cambio/);
    assert.deepEqual(events, []);

    deployed = 'build-nueva';
    const stale = await callServerAction(async () => { attempts++; throw new Error('Server action not found'); });
    assert.equal(attempts, 2);
    assert.match(stale.error, /se actualizó.*No sabemos si este cambio se guardó/);
    assert.deepEqual(events, ['papelito:new-version']);

    const read = await callServerRead(async () => { throw new Error('fetch failed'); }, 'tu historial');
    assert.match(read.error, /se actualizó/);
    assert.doesNotMatch(read.error, /cambio|repetirlo/);
    deployed = 'build-actual';
    const plainRead = await callServerRead(async () => { throw new Error('fetch failed'); }, 'tu historial');
    assert.equal(plainRead.error, 'No pudimos cargar tu historial. Revisá la conexión e intentá de nuevo.');
  });
});
