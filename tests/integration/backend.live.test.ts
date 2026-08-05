import { describe, it, expect, afterAll } from 'vitest';
import { EDITION } from '../../src/content/edition';

/**
 * Teste de integrare LIVE — lovesc backendul Supabase REAL (proiectul ironworks-gym,
 * schema `runlift`). NU rulează în CI-ul obișnuit și NU sunt incluse în `npm test`.
 * Sunt opt-in și verifică lucrul pe care testele mock-uite nu-l pot verifica:
 * că schema e expusă, RLS-ul permite insert-ul public, iar RPC-urile răspund.
 *
 * Rulează:
 *   RUNLIFT_LIVE=1 \
 *   SUPABASE_URL=https://whyndrjcezmtajbykeil.supabase.co \
 *   SUPABASE_ANON_KEY=sb_publishable_... \
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ... \
 *   npm run test:integration
 *
 * Siguranță:
 *  - Toate inserările folosesc o EDIȚIE DE TEST (`TEST_EDITION`), invizibilă în
 *    `public_stats` (care filtrează ediția curentă) — nu se amestecă cu datele reale.
 *  - Fiecare rulare are un prefix de email unic; `afterAll` șterge tot ce a creat,
 *    cu service_role (bypass RLS).
 *  - Emailurile NU se trimit: nu apelăm funcția edge în modurile care trimit.
 */

const LIVE = process.env.RUNLIFT_LIVE === '1';
const BASE = process.env.SUPABASE_URL ?? '';
const ANON = process.env.SUPABASE_ANON_KEY ?? '';
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const SCHEMA = process.env.DB_SCHEMA ?? 'runlift';
const ready = LIVE && !!BASE && !!ANON && !!SERVICE;

// Ediție de test — mare, ca să nu coincidă niciodată cu o ediție reală.
const TEST_EDITION = 90111;
// Prefix fără underscore (ca să nu se ciocnească cu wildcard-ul `_` din SQL LIKE).
const RUN = `zzlive${Date.now()}`;
const emailFor = (tag: string) => `${RUN}${tag}@example.com`;

const anonHeaders = (extra: Record<string, string> = {}): Record<string, string> => ({
  apikey: ANON,
  'Content-Type': 'application/json',
  ...extra,
});
const serviceHeaders = (extra: Record<string, string> = {}): Record<string, string> => ({
  apikey: SERVICE,
  Authorization: `Bearer ${SERVICE}`,
  'Content-Type': 'application/json',
  ...extra,
});

// Șterge cu service_role tot ce a creat rularea curentă (după prefixul de email).
const cleanup = async (table: string): Promise<void> => {
  await fetch(`${BASE}/rest/v1/${table}?email=like.${RUN}*`, {
    method: 'DELETE',
    headers: serviceHeaders({ 'Content-Profile': SCHEMA, Prefer: 'return=minimal' }),
  }).catch(() => {});
};

afterAll(async () => {
  if (!ready) return;
  await cleanup('registrations');
  await cleanup('event_waitlist');
  await cleanup('launch_notifications');
});

describe.skipIf(!ready)('Integrare LIVE — schema runlift', () => {
  it('înscriere: insert anon în registrations (Content-Profile: runlift), citit cu service_role', async () => {
    const email = emailFor('reg');
    const res = await fetch(`${BASE}/rest/v1/registrations`, {
      method: 'POST',
      headers: anonHeaders({ 'Content-Profile': SCHEMA, Prefer: 'return=minimal' }),
      body: JSON.stringify({
        nume: 'ZZ Live Test',
        telefon: '+37360000000',
        email,
        data_nasterii: null,
        acord: true,
        editie: TEST_EDITION,
      }),
    });
    expect(res.status).toBe(201);

    // RLS blochează citirea pentru anon → verificăm cu service_role.
    const check = await fetch(
      `${BASE}/rest/v1/registrations?email=eq.${encodeURIComponent(email)}&select=email,editie`,
      { headers: serviceHeaders({ 'Accept-Profile': SCHEMA }) }
    );
    const rows = (await check.json()) as Array<{ email: string; editie: number }>;
    expect(rows).toHaveLength(1);
    expect(rows[0].editie).toBe(TEST_EDITION);
  });

  it('duplicat: al doilea insert cu același email+ediție dă 409', async () => {
    const body = JSON.stringify({
      nume: 'ZZ Live Dup',
      telefon: '+37360000001',
      email: emailFor('dup'),
      data_nasterii: null,
      acord: true,
      editie: TEST_EDITION,
    });
    const first = await fetch(`${BASE}/rest/v1/registrations`, {
      method: 'POST',
      headers: anonHeaders({ 'Content-Profile': SCHEMA, Prefer: 'return=minimal' }),
      body,
    });
    expect(first.status).toBe(201);
    const second = await fetch(`${BASE}/rest/v1/registrations`, {
      method: 'POST',
      headers: anonHeaders({ 'Content-Profile': SCHEMA, Prefer: 'return=minimal' }),
      body,
    });
    expect(second.status).toBe(409);
  });

  it('listă de așteptare: insert anon în event_waitlist', async () => {
    const res = await fetch(`${BASE}/rest/v1/event_waitlist`, {
      method: 'POST',
      headers: anonHeaders({ 'Content-Profile': SCHEMA, Prefer: 'return=minimal' }),
      body: JSON.stringify({
        nume: 'ZZ Live Waitlist',
        telefon: '+37360000002',
        email: emailFor('wait'),
        data_nasterii: null,
        acord: true,
        editie: TEST_EDITION,
      }),
    });
    expect(res.status).toBe(201);
  });

  it('„Anunță-mă": insert anon în launch_notifications (ediția o pune serverul)', async () => {
    const res = await fetch(`${BASE}/rest/v1/launch_notifications`, {
      method: 'POST',
      headers: anonHeaders({ 'Content-Profile': SCHEMA, Prefer: 'return=minimal' }),
      body: JSON.stringify({
        nume: 'ZZ Live',
        prenume: 'Test',
        email: emailFor('launch'),
        telefon: '+37360000003',
        sursa: 'lansare',
      }),
    });
    expect(res.status).toBe(201);
  });

  it('public_stats: RPC răspunde 200 cu forma așteptată (Accept-Profile: runlift)', async () => {
    const res = await fetch(`${BASE}/rest/v1/rpc/public_stats`, {
      headers: { apikey: ANON, 'Accept-Profile': SCHEMA },
    });
    expect(res.status).toBe(200);
    const stats = (await res.json()) as { count: number; participants: unknown[]; waitlist: number };
    expect(typeof stats.count).toBe('number');
    expect(Array.isArray(stats.participants)).toBe(true);
    expect(typeof stats.waitlist).toBe('number');
  });

  it('confirm_signup: token bogus întoarce „invalid" (fără efecte secundare)', async () => {
    const res = await fetch(`${BASE}/rest/v1/rpc/confirm_signup`, {
      method: 'POST',
      headers: anonHeaders({ 'Content-Profile': SCHEMA }),
      body: JSON.stringify({ p_token: '00000000-0000-0000-0000-000000000000' }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toBe('invalid');
  });

  // Gardă anti-drift: DB-ul trebuie să reflecte EDITION (rulează `npm run sync-edition`
  // dacă pică). Prinde exact desincronizarea config.ts ↔ app_config.
  it('app_config.current_event_edition == EDITION.number (fără drift)', async () => {
    const res = await fetch(
      `${BASE}/rest/v1/app_config?key=eq.current_event_edition&select=value`,
      { headers: serviceHeaders({ 'Accept-Profile': SCHEMA }) }
    );
    expect(res.status).toBe(200);
    const rows = (await res.json()) as Array<{ value: string }>;
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].value)).toBe(EDITION.number);
  });
});
