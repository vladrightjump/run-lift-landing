import { test as base, type BrowserContext } from '@playwright/test';
import { defineNetworkFixture, type NetworkFixture } from '@msw/playwright';
import { type AnyHandler } from 'msw';
import { HttpNetworkFrame } from 'msw/experimental';
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
      const url = frame instanceof HttpNetworkFrame ? frame.data.request.url : frame.protocol;
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
