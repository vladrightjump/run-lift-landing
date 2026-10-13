import type { NetworkFixture } from '@msw/playwright';
import { HttpResponse } from 'msw';
import { createHandlers, rpcHandler } from './handlers';

/** Aceleași RPC-uri și același transport pentru toate parcursurile adminului. */
export function installAdminResponses(network: NetworkFixture, responses: Record<string, unknown>) {
  const staticResponses = Object.fromEntries(
    Object.entries(responses).filter(([, value]) => typeof value !== 'function')
  );
  const dynamicHandlers = Object.entries(responses)
    .filter((entry): entry is [string, (payload: unknown) => unknown] => typeof entry[1] === 'function')
    .map(([name, response]) => rpcHandler(name, async ({ request }) =>
      new HttpResponse(JSON.stringify(response(await request.json())), {
        headers: { 'Content-Type': 'application/json' },
      })
    ));
  network.use(...dynamicHandlers, ...createHandlers({
    // Parcursurile vechi lăsau aceste resurse goale când nu le configurau.
    admin_sala_rezumat: null,
    admin_trial_data: null,
    ...staticResponses,
  }));
}
