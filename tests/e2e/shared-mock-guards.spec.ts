import { test, expect } from '@playwright/test';
import { SUPABASE } from '../../src/shared/lib/backend';
import { createMockNetwork, installBackendEscapeSentinel } from '../support/playwright';

test('an unmatched RPC aborts before reaching the backend route', async ({ context, page }) => {
  const url = `${SUPABASE.url}/rest/v1/rpc/unmocked_guard_probe`;
  let escaped = 0;
  // Installed first, this sentinel catches a fallback from MSW without ever
  // contacting Supabase. MSW's later context route runs before this one.
  await installBackendEscapeSentinel(context, () => { escaped++; });
  const { network, unhandled } = createMockNetwork(context, []);
  await network.enable();
  try {
    const failed = page.waitForEvent('requestfailed', { predicate: (request) => request.url() === url });
    const result = await page.evaluate(async (requestUrl) => {
      try {
        await fetch(requestUrl, { method: 'POST' });
        return 'resolved';
      } catch {
        return 'rejected';
      }
    }, url);
    const request = await failed;
    expect(result).toBe('rejected');
    expect(request.failure()?.errorText).toBe('net::ERR_FAILED');
    expect(escaped).toBe(0);
    expect(unhandled).toEqual([url]);
  } finally {
    await network.disable();
  }
});
