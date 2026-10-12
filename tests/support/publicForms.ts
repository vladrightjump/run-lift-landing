import { HttpResponse } from 'msw';
import { server } from './vitest.setup';
import { functionHandler } from './handlers';

/** Public form command responses, with the real request envelope captured. */
export function formResponse(options: { status?: number; body?: unknown; text?: string; networkError?: boolean; pending?: Promise<void> } = {}) {
  const requests = { count: 0, bodies: [] as Record<string, unknown>[], signals: [] as AbortSignal[] };
  server.use(functionHandler('submit-form', async ({ request }) => {
    requests.count++;
    requests.signals.push(request.signal);
    requests.bodies.push(await request.json() as Record<string, unknown>);
    if (options.pending) await options.pending;
    if (options.networkError) return HttpResponse.error();
    return new HttpResponse(options.text ?? JSON.stringify(options.body ?? { ok: true }), { status: options.status ?? 200, headers: { 'Content-Type': 'application/json' } });
  }));
  return requests;
}
