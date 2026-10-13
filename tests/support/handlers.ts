import { http, HttpResponse, passthrough, delay, type HttpResponseResolver } from 'msw';
import { SUPABASE } from '../../src/shared/lib/backend';
import { editie } from './builders/edition';
import { dateSala } from './builders/sala';
import { trialData } from './builders/trial';
import { reel } from './builders/reels';
import { workout } from './builders/workouts';
import { publicStats, publicHomepage, publicTrialConfig } from './builders/public';

/** Override a named RPC without changing the shared endpoint matching. */
export const rpcHandler = (name: string, resolver: HttpResponseResolver) =>
  http.all(`${SUPABASE.url}/rest/v1/rpc/${name}`, resolver);

export const functionHandler = (name: string, resolver: HttpResponseResolver) =>
  http.post(`${SUPABASE.url}/functions/v1/${name}`, resolver);

/** One-shot transport override for HTTP errors and malformed response tests. */
export const responseHandler = (response: Response) =>
  http.all(`${SUPABASE.url}/*`, () => response, { once: true });

export function createHandlers(overrides: Record<string, unknown> = {}, latencyMs = 0) {
  const defaults: Record<string, unknown> = {
    confirm_signup: 'confirmat',
    public_config: null,
    public_stats: publicStats(),
    public_homepage: publicHomepage(),
    public_trial_config: publicTrialConfig(),
    public_training_reels: [],
    public_weekly_workouts: [],
    admin_check_token: true,
    admin_login: 'token-test',
    admin_logout: null,
    admin_list_registrations: [],
    admin_list_waitlist: [],
    admin_list_email_log: [],
    admin_list_events: [],
    admin_list_editions: [editie()],
    admin_list_launch_notifications: [],
    admin_list_email_templates: [],
    admin_get_event_config: [],
    admin_list_training_reels: [reel()],
    admin_list_weekly_workout: [workout()],
    admin_sala_date: dateSala(),
    admin_sala_rezumat: null,
    admin_trial_data: trialData(),
    ...overrides,
  };
  return [
    ...Object.entries(defaults).map(([name, body]) => rpcHandler(name,
      async () => {
        if (latencyMs) await delay(latencyMs);
        return new HttpResponse(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
      }
    )),
    ...['registrations', 'event_waitlist', 'launch_notifications'].map((table) =>
      http.post(`${SUPABASE.url}/rest/v1/${table}`, () => new HttpResponse(null, { status: 201 }))
    ),
    functionHandler('submit-form', () => HttpResponse.json({ ok: true })),
    functionHandler('send-email', () => HttpResponse.json({ sent: 1 })),
  ];
}
export const handlers = createHandlers();

/** Documents, fonts and Vite assets remain real; missing Supabase mocks fail. */
export const browserAssets = http.all(
  ({ request }) => new URL(request.url).origin !== new URL(SUPABASE.url).origin,
  () => passthrough()
);

/** JSON response and submitted bodies, shared by function transport characterizations. */
export const functionResponse = (name: string, body: unknown, status = 200) => {
  const requests: Record<string, unknown>[] = [];
  const handler = functionHandler(name, async ({ request }) => {
    requests.push(await request.json() as Record<string, unknown>);
    return HttpResponse.json(body as object, { status });
  });
  return { handler, requests };
};
