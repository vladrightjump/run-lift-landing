import { setImmediate } from 'node:timers/promises';
import { afterAll, afterEach, beforeAll, vi } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { handlers } from './handlers';
import type { QueryClient } from '@tanstack/react-query';

const queryClients = vi.hoisted(() => new Set<QueryClient>());
const testingLibraryCleanup = vi.hoisted(() => ({ run: () => {} }));

// Legacy component tests mount the session directly. Supply the same app
// provider without changing their render calls or their characterization.
vi.mock('@testing-library/react', async importOriginal => {
  const actual = await importOriginal<typeof import('@testing-library/react')>();
  testingLibraryCleanup.run = actual.cleanup;
  const { createElement } = await import('react');
  const { QueryClientProvider } = await import('@tanstack/react-query');
  const { createAppQueryClient } = await import('../../src/app/providers');
  const withProvider = (wrapper?: import('react').ComponentType<{ children: import('react').ReactNode }>) => {
    const client = createAppQueryClient();
    queryClients.add(client);
    return ({ children }: { children: import('react').ReactNode }) =>
      createElement(QueryClientProvider, { client }, wrapper ? createElement(wrapper, null, children) : children);
  };
  return {
    ...actual,
    render: ((ui: import('react').ReactNode, options?: import('@testing-library/react').RenderOptions) => actual.render(ui, { ...options, wrapper: withProvider(options?.wrapper) })) as typeof actual.render,
    renderHook: ((hook, options) => actual.renderHook(hook, { ...options, wrapper: withProvider(options?.wrapper) })) as typeof actual.renderHook,
  };
});

export const server = setupServer(...handlers,
  // jsdom's development origin has no deployed build fingerprint.
  http.get('http://localhost:3000/version.json', () => new HttpResponse(null, { status: 404 })),
);
const unhandled: string[] = [];
const expected: { url: string; observed: boolean }[] = [];

/** Scope one deliberate diagnostic request; every other unmatched frame fails. */
export async function withExpectedUnhandledRequest<T>(url: string, request: () => Promise<T>): Promise<T> {
  const allowance = { url, observed: false };
  expected.push(allowance);
  let result: T;
  try {
    result = await request();
  } finally {
    expected.splice(expected.indexOf(allowance), 1);
  }
  if (!allowance.observed) throw new Error(`Expected unhandled request was not observed: ${url}`);
  return result;
}

// MSW 3 renamed onUnhandledRequest to onUnhandledFrame.
beforeAll(() => {
  server.events.on('request:unhandled', ({ request }) => {
    const url = request.url;
    const allowance = expected.find((item) => item.url === url && !item.observed);
    if (allowance) allowance.observed = true;
    else unhandled.push(url);
  });
  server.listen({ onUnhandledFrame: 'error' });
});
afterEach(() => {
  testingLibraryCleanup.run();
  for (const client of queryClients) client.clear();
  queryClients.clear();
  server.resetHandlers();
  const unexpected = unhandled.splice(0);
  if (unexpected.length) throw new Error(`Unhandled requests:\n${unexpected.join('\n')}`);
});
afterAll(async () => {
  // MSW 3 intercepts fetch at the socket layer. An immediately aborted fetch
  // can leave its connection registration and handshake on Node's nextTick
  // queue, before request:start exists. Drain that phase before close removes
  // the interceptors; otherwise those queued sockets pass through to Supabase.
  // A nextTick-only barrier is too early for the queued handshake callbacks.
  await setImmediate();
  server.close();
});
