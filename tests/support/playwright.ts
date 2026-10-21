import { test as base, type BrowserContext } from '@playwright/test';
import { defineNetworkFixture, type NetworkFixture } from '@msw/playwright';
import { type AnyHandler } from 'msw';
import { HttpNetworkFrame, WebSocketNetworkFrame } from 'msw/experimental';
import { SUPABASE } from '../../src/shared/lib/backend';
import { browserAssets, handlers as defaultHandlers } from './handlers';

export const test = base.extend<{ handlers: AnyHandler[]; network: NetworkFixture }>({
  handlers: [defaultHandlers, { option: true }],
  network: [async ({ context, handlers }, use) => {
    const { network, unhandled } = createMockNetwork(context, handlers);
    await network.enable();
    await use(network);
    await network.disable();
    if (unhandled.length) throw new Error(`Unhandled requests:\n${unhandled.join('\n')}`);
  }, { auto: true }],
});

export function createMockNetwork(context: BrowserContext, handlers: AnyHandler[]) {
  const unhandled: string[] = [];
  const network = defineNetworkFixture({
    context,
    handlers: [...handlers, browserAssets],
    // MSW 3 calls MSW 2's onUnhandledRequest option onUnhandledFrame.
    async onUnhandledFrame({ frame, defaults }) {
      const connection = frame instanceof WebSocketNetworkFrame ? frame.data.connection : null;
      if (connection) {
        const url = connection.client.url;
        // Playwright omits WebSocket protocols. Vite's authenticated local HMR
        // endpoint is identified by its root path and sole token parameter.
        if (url.protocol === 'ws:' && ['localhost', '127.0.0.1'].includes(url.hostname)
          && url.port === '5173' && url.pathname === '/'
          && url.searchParams.size === 1 && !!url.searchParams.get('token')) return;
      }
      const url = frame instanceof HttpNetworkFrame ? frame.data.request.url : connection?.client.url.href ?? frame.protocol;
      unhandled.push(url);
      // MSW 3's custom defaults.error only prints. InternalError tells the
      // Playwright bridge to abort instead of falling through to the backend.
      await defaults.error();
      throw Object.assign(new Error(`Unhandled request: ${url}`), { name: 'InternalError' });
    },
  });
  return { network, unhandled };
}
export { expect } from '@playwright/test';

export type { NetworkFixture } from '@msw/playwright';

/** Catches bridge fallback locally, before a diagnostic request could escape. */
export async function installBackendEscapeSentinel(context: BrowserContext, onEscape: () => void) {
  await context.route(`${SUPABASE.url}/**`, async (route) => {
    onEscape();
    await route.fulfill({ status: 200, body: 'escaped', headers: { 'Access-Control-Allow-Origin': '*' } });
  });
}
