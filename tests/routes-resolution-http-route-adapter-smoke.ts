import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { handleAuthenticatedRoutesResolutionHttp } from '../server/travel/routesResolutionHttpRouteAdapter';
import type { RoutesResolutionRuntimeState } from '../server/travel/routesResolutionRuntime';

const disabledRuntime: RoutesResolutionRuntimeState = {
  status: 'disabled',
  service: null,
  bindingEnvironment: 'development',
  blocker: 'trusted_bindings_unavailable',
};

async function main(): Promise<void> {
  const server = createServer((request, response) => {
    void handleAuthenticatedRoutesResolutionHttp({
      request,
      response,
      runtime: disabledRuntime,
      accountScopeId: 'account:test',
    }).catch(() => {
      if (!response.headersSent) {
        response.writeHead(500, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ error: { code: 'test_failure' } }));
      } else {
        response.destroy();
      }
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const endpoint = `http://127.0.0.1:${address.port}`;

  try {
    const disabled = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ request: { origin: 'Москва', destination: 'Казань' } }),
    });
    assert.equal(disabled.status, 503);
    assert.deepEqual(await disabled.json(), {
      error: { code: 'service_unavailable', message: 'Routes resolution unavailable' },
    });

    const malformed = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{',
    });
    assert.equal(malformed.status, 400);
    assert.deepEqual(await malformed.json(), {
      error: { code: 'invalid_input', message: 'Invalid routes resolution request' },
    });

    const oversized = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ request: { origin: 'М'.repeat(13 * 1024), destination: 'Казань' } }),
    });
    assert.equal(oversized.status, 400);
    assert.deepEqual(await oversized.json(), {
      error: { code: 'invalid_input', message: 'Invalid routes resolution request' },
    });
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }

  console.log('Routes resolution HTTP route adapter smoke passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
