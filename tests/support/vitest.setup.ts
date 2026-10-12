import { setImmediate } from 'node:timers/promises';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { handlers } from './handlers';

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
