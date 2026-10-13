import { delay, HttpResponse } from 'msw';
import { functionHandler, rpcHandler } from './handlers';

export type ResponseOptions = {
  status?: number;
  text?: string;
  latencyMs?: number | 'infinite';
  networkError?: boolean;
  onRequest?: (request: Request) => void | Promise<void>;
};

const reply = async (body: unknown, options: Omit<ResponseOptions, 'onRequest'>) => {
  if (options.latencyMs) await delay(options.latencyMs);
  if (options.networkError) return HttpResponse.error();
  return new HttpResponse(options.text ?? JSON.stringify(body), {
    status: options.status ?? 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

/** Named responses use the same endpoint matching in Vitest and Playwright. */
export const rpcResponse = (name: string, body: unknown, options: ResponseOptions = {}) =>
  rpcHandler(name, async ({ request }) => {
    await options.onRequest?.(request);
    return reply(body, options);
  });

export const functionReply = (name: string, body: unknown, options: ResponseOptions = {}) =>
  functionHandler(name, async ({ request }) => {
    await options.onRequest?.(request);
    return reply(body, options);
  });

export type FormEnvelope = { mode: string; token: string; hp: string; elapsed: number; data: Record<string, unknown> };

/** Capture the real public-form envelope before returning its command response. */
export const submitFormResponse = (options: Omit<ResponseOptions, 'onRequest'> & {
  body?: unknown;
  onRequest?: (envelope: FormEnvelope, request: Request) => void | Promise<void>;
} = {}) => functionHandler('submit-form', async ({ request }) => {
  const envelope = await request.json() as FormEnvelope;
  await options.onRequest?.(envelope, request);
  return reply(options.body ?? { ok: true }, options);
});
