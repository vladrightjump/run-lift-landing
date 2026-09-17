// @vitest-environment node
import { describe, it, expect, afterEach, vi } from 'vitest';
import { incarcaFunctieEdge, raspunde, post, type FunctieEdge, type Ruta } from './harness';

/**
 * `submit-form` — singura poartă prin care intră o înscriere.
 *
 * Tot ce pică aici se traduce direct în locuri pierdute (o înscriere validă
 * respinsă) sau în boți în listă (o verificare sărită). Până acum funcția era
 * verificată doar prin două teste live, care nu puteau atinge captcha.
 */

const ENV = {
  SUPABASE_URL: 'https://proiect.supabase.co',
  RUNLIFT_SERVICE_KEY: 'sb_secret_test',
  DB_SCHEMA: 'runlift',
  TURNSTILE_SECRET_KEY: 'secret-turnstile',
};

const SITEVERIFY = 'challenges.cloudflare.com';
const REST = '/rest/v1/';

/** Cloudflare spune „da"; PostgREST acceptă inserarea. */
const RUTE_FERICITE: Ruta[] = [
  (c) => (c.url.includes(SITEVERIFY) ? raspunde(200, { success: true }) : null),
  (c) => (c.url.includes(REST) ? new Response('', { status: 201 }) : null),
  (c) => (c.url.includes('/functions/v1/send-email') ? raspunde(200, { sent: 1 }) : null),
];

const incarca = (o: { env?: Record<string, string>; rute?: Ruta[] } = {}) =>
  incarcaFunctieEdge(() => import('../../../supabase/functions/submit-form/index.ts'), {
    env: { ...ENV, ...(o.env ?? {}) },
    rute: o.rute ?? RUTE_FERICITE,
  });

const INSCRIERE = {
  mode: 'registration',
  token: 'token-turnstile',
  hp: '',
  elapsed: 30_000,
  data: {
    nume: 'Ana Popescu',
    email: 'ana@exemplu.ro',
    telefon: '069 509 949',
    dataNasterii: '1994-05-15',
    acord: true,
  },
};

const LANSARE = {
  mode: 'launch',
  token: 'token-turnstile',
  hp: '',
  elapsed: 30_000,
  data: {
    nume: 'Popescu',
    prenume: 'Ana',
    email: 'ana@exemplu.ro',
    telefon: '+37369509949',
    sursa: 'lansare',
  },
};

const trimite = async (f: FunctieEdge, body: unknown, headers?: Record<string, string>) => {
  const res = await f.cheama(post(body, headers));
  return { res, body: await res.json().catch(() => null) };
};

/** Rândul trimis spre PostgREST. */
const randScris = (f: FunctieEdge) => f.catre(REST)[0]?.body as Record<string, unknown> | undefined;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('poarta HTTP', () => {
  it('OPTIONS primește 204 cu CORS, fără să atingă rețeaua', async () => {
    const f = await incarca();
    const res = await f.cheama(
      new Request('https://x/functions/v1/submit-form', {
        method: 'OPTIONS',
        headers: { origin: 'https://parktraining.fit' },
      })
    );
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://parktraining.fit');
    expect(f.cereri).toHaveLength(0);
  });

  it('GET → 405', async () => {
    const f = await incarca();
    const res = await f.cheama(new Request('https://x/functions/v1/submit-form'));
    expect(res.status).toBe(405);
  });

  it('corp care nu e JSON → 400, fără scriere', async () => {
    const f = await incarca();
    const res = await f.cheama(
      new Request('https://x/f', { method: 'POST', body: 'nu-i json{' })
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid_json' });
    expect(f.cereri).toHaveLength(0);
  });

  it('o origine străină nu primește voie să citească răspunsul', async () => {
    const f = await incarca();
    const res = await f.cheama(post(INSCRIERE, { origin: 'https://spam.example' }));
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://parktraining.fit');
  });

  it('dev server-ul local rămâne permis', async () => {
    const f = await incarca();
    const res = await f.cheama(post(INSCRIERE, { origin: 'http://localhost:5173' }));
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173');
  });

  it.each(['plimbare', '', 'REGISTRATION'])('modul necunoscut `%s` → 400', async (mode) => {
    const f = await incarca();
    const { res, body } = await trimite(f, { ...INSCRIERE, mode });
    expect(res.status).toBe(400);
    expect(body).toEqual({ error: 'unknown_mode' });
    expect(f.catre(REST)).toHaveLength(0);
  });

  /**
   * Regresie: cu indexare simplă, `mode: "constructor"` se rezolvă prin lanțul
   * de prototipuri, trece de gardă și ajunge interpolat în URL-ul PostgREST.
   */
  it.each(['constructor', 'toString', '__proto__'])(
    'modul `%s` nu se strecoară prin prototip',
    async (mode) => {
      const f = await incarca();
      const { res } = await trimite(f, { ...INSCRIERE, mode });
      expect(res.status).toBe(400);
      expect(f.catre(REST)).toHaveLength(0);
    }
  );
});

describe('filtrele ieftine, înaintea Cloudflare', () => {
  it('capcana completată → respins, fără să întrebe Cloudflare', async () => {
    const f = await incarca();
    const { res, body } = await trimite(f, { ...INSCRIERE, hp: 'http://spam.example' });
    expect(res.status).toBe(400);
    expect(body).toEqual({ error: 'bot' });
    expect(f.cereri).toHaveLength(0);
  });

  it('completare sub trei secunde → respins', async () => {
    const f = await incarca();
    const { res, body } = await trimite(f, { ...INSCRIERE, elapsed: 120 });
    expect(res.status).toBe(400);
    expect(body).toEqual({ error: 'too_fast' });
    expect(f.cereri).toHaveLength(0);
  });

  it('fără `elapsed` (client vechi) înscrierea trece — nu presupunem bot', async () => {
    const f = await incarca();
    const { res } = await trimite(f, { ...INSCRIERE, elapsed: undefined });
    expect(res.status).toBe(200);
  });
});

describe('captcha — cine trece și cine nu', () => {
  it('fără secret configurat respinge tot, cu motivul spus', async () => {
    const f = await incarca({ env: { TURNSTILE_SECRET_KEY: '' } });
    const { res, body } = await trimite(f, INSCRIERE);
    expect(res.status).toBe(403);
    expect(body).toEqual({ error: 'captcha_failed', motiv: 'captcha_unconfigured' });
    expect(f.catre(REST)).toHaveLength(0);
  });

  it('fără secret, dar cu consimțământ explicit, trece (dev/preview)', async () => {
    const f = await incarca({ env: { TURNSTILE_SECRET_KEY: '', TURNSTILE_OPTIONAL: '1' } });
    const { res } = await trimite(f, INSCRIERE);
    expect(res.status).toBe(200);
    expect(f.catre(SITEVERIFY)).toHaveLength(0);
  });

  it('token lipsă → respins, fără să întrebe Cloudflare', async () => {
    const f = await incarca();
    const { body } = await trimite(f, { ...INSCRIERE, token: '' });
    expect(body).toEqual({ error: 'captcha_failed', motiv: 'missing_token' });
    expect(f.catre(SITEVERIFY)).toHaveLength(0);
  });

  /** Un token uriaș ar face siteverify să dea 4xx — adică fail-open la comandă. */
  it('token peste 2048 de caractere → respins înainte de Cloudflare', async () => {
    const f = await incarca();
    const { body } = await trimite(f, { ...INSCRIERE, token: 'x'.repeat(2049) });
    expect(body).toEqual({ error: 'captcha_failed', motiv: 'bad_token' });
    expect(f.catre(SITEVERIFY)).toHaveLength(0);
  });

  it('trimite secretul, tokenul și IP-ul vizitatorului', async () => {
    const f = await incarca();
    await trimite(f, INSCRIERE, { 'cf-connecting-ip': '198.51.100.7' });
    const trimis = f.catre(SITEVERIFY)[0].init.body as FormData;
    expect(trimis.get('secret')).toBe('secret-turnstile');
    expect(trimis.get('response')).toBe('token-turnstile');
    expect(trimis.get('remoteip')).toBe('198.51.100.7');
  });

  it('cade pe x-forwarded-for când lipsește antetul Cloudflare', async () => {
    const f = await incarca();
    await trimite(f, INSCRIERE, { 'x-forwarded-for': '203.0.113.9' });
    expect((f.catre(SITEVERIFY)[0].init.body as FormData).get('remoteip')).toBe('203.0.113.9');
  });

  it('verdict negativ → 403 cu codurile Cloudflare, fără scriere', async () => {
    const f = await incarca({
      rute: [
        (c) =>
          c.url.includes(SITEVERIFY)
            ? raspunde(200, { success: false, 'error-codes': ['invalid-input-response'] })
            : null,
        ...RUTE_FERICITE,
      ],
    });
    const { res, body } = await trimite(f, INSCRIERE);
    expect(res.status).toBe(403);
    expect(body).toEqual({ error: 'captcha_failed', motiv: 'invalid-input-response' });
    expect(f.catre(REST)).toHaveLength(0);
  });

  it.each([500, 502, 429])(
    'pană la Cloudflare (%i) → înscrierea trece, cu urmă în loguri',
    async (status) => {
      const f = await incarca({
        rute: [
          (c) => (c.url.includes(SITEVERIFY) ? raspunde(status, {}) : null),
          ...RUTE_FERICITE,
        ],
      });
      const { res } = await trimite(f, INSCRIERE);
      expect(res.status).toBe(200);
      expect(f.catre(REST)).toHaveLength(1);
      expect(f.erori.flat().join(' ')).toContain('fail-open');
    }
  );

  it.each([400, 401, 403])('un %i (verdict despre cererea noastră) NU e fail-open', async (status) => {
    const f = await incarca({
      rute: [(c) => (c.url.includes(SITEVERIFY) ? raspunde(status, {}) : null), ...RUTE_FERICITE],
    });
    const { res, body } = await trimite(f, INSCRIERE);
    expect(res.status).toBe(403);
    expect(body).toMatchObject({ motiv: `siteverify_${status}` });
  });

  it('pana Cloudflare anunțată cu 200 + `internal-error` → trece', async () => {
    const f = await incarca({
      rute: [
        (c) =>
          c.url.includes(SITEVERIFY)
            ? raspunde(200, { success: false, 'error-codes': ['internal-error'] })
            : null,
        ...RUTE_FERICITE,
      ],
    });
    expect((await trimite(f, INSCRIERE)).res.status).toBe(200);
  });

  it('rețeaua căzută spre Cloudflare → trece', async () => {
    const f = await incarca({
      rute: [
        (c) => {
          if (!c.url.includes(SITEVERIFY)) return null;
          throw new Error('network down');
        },
        ...RUTE_FERICITE,
      ],
    });
    expect((await trimite(f, INSCRIERE)).res.status).toBe(200);
  });
});

describe('validarea — regulile mutate din RLS', () => {
  const cuDate = (over: Record<string, unknown>) => ({
    ...INSCRIERE,
    data: { ...INSCRIERE.data, ...over },
  });

  it.each([
    ['nume prea scurt', { nume: 'Al' }, 'invalid:nume'],
    ['email fără domeniu', { email: 'ana@exemplu' }, 'invalid:email'],
    ['email gol', { email: '' }, 'invalid:email'],
    ['telefon prea scurt', { telefon: '0695' }, 'invalid:telefon'],
    ['telefon cu litere', { telefon: '06x5099491' }, 'invalid:telefon'],
    ['dată în alt format', { dataNasterii: '15.05.1994' }, 'invalid:data_nasterii'],
    ['acord lipsă', { acord: undefined }, 'invalid:acord'],
    ['acord fals', { acord: false }, 'invalid:acord'],
    ['acord adevărat ca text', { acord: 'true' }, 'invalid:acord'],
  ])('%s → %s, fără scriere', async (_, over, eroare) => {
    const f = await incarca();
    const { res, body } = await trimite(f, cuDate(over));
    expect(res.status).toBe(400);
    expect(body).toEqual({ error: eroare });
    expect(f.catre(REST)).toHaveLength(0);
  });

  it('normalizează telefonul și taie spațiile din text', async () => {
    const f = await incarca();
    await trimite(f, cuDate({ telefon: ' (069) 509-949 ', nume: '  Ana Popescu  ' }));
    expect(randScris(f)).toMatchObject({ telefon: '069509949', nume: 'Ana Popescu' });
  });

  it('data nașterii lipsă rămâne `null`, nu text gol', async () => {
    const f = await incarca();
    await trimite(f, cuDate({ dataNasterii: '' }));
    expect(randScris(f)!.data_nasterii).toBeNull();
  });

  /** Ediția o decide serverul. Un client care o trimite nu trebuie s-o impună. */
  it('`editie` din client nu ajunge niciodată în rândul scris', async () => {
    const f = await incarca();
    await trimite(f, cuDate({ editie: 99 }));
    expect(randScris(f)).not.toHaveProperty('editie');
  });

  it('câmpurile în plus din client sunt ignorate', async () => {
    const f = await incarca();
    await trimite(f, cuDate({ prezent: true, echipa: 'X' }));
    expect(Object.keys(randScris(f)!).sort()).toEqual([
      'acord',
      'data_nasterii',
      'email',
      'id',
      'nume',
      'telefon',
    ]);
  });

  it.each([
    ['nume prea scurt', { nume: 'P' }, 'invalid:nume'],
    ['prenume prea scurt', { prenume: 'A' }, 'invalid:prenume'],
    ['sursă din afara listei', { sursa: 'facebook' }, 'invalid:sursa'],
  ])('„anunță-mă": %s → %s', async (_, over, eroare) => {
    const f = await incarca();
    const { body } = await trimite(f, { ...LANSARE, data: { ...LANSARE.data, ...over } });
    expect(body).toEqual({ error: eroare });
  });

  it('„anunță-mă" fără sursă cade pe `lansare`', async () => {
    const f = await incarca();
    await trimite(f, { ...LANSARE, data: { ...LANSARE.data, sursa: '' } });
    expect(randScris(f)).toMatchObject({ sursa: 'lansare' });
  });
});

describe('scrierea și răspunsul', () => {
  it.each([
    ['registration', 'registrations'],
    ['waitlist', 'event_waitlist'],
    ['launch', 'launch_notifications'],
  ])('modul `%s` scrie în `%s`, în schema runlift, cu cheia de service', async (mode, tabel) => {
    const f = await incarca();
    await trimite(f, mode === 'launch' ? LANSARE : { ...INSCRIERE, mode });
    const cerere = f.catre(REST)[0];
    expect(cerere.url).toBe(`${ENV.SUPABASE_URL}/rest/v1/${tabel}`);
    const headers = cerere.init.headers as Record<string, string>;
    expect(headers.apikey).toBe('sb_secret_test');
    expect(headers['Content-Profile']).toBe('runlift');
    expect(headers.Prefer).toBe('return=minimal');
  });

  it('o înscriere primește un id generat de server, întors clientului', async () => {
    const f = await incarca();
    const { res, body } = await trimite(f, INSCRIERE);
    expect(res.status).toBe(200);
    const id = (body as { id: string }).id;
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(randScris(f)!.id).toBe(id);
  });

  it('lista de așteptare nu primește id — nu are ce confirma', async () => {
    const f = await incarca();
    const { body } = await trimite(f, { ...INSCRIERE, mode: 'waitlist' });
    expect(body).toEqual({ ok: true });
    expect(randScris(f)).not.toHaveProperty('id');
  });

  it.each([
    [409, '{"code":"23505","message":"duplicate key"}'],
    [400, '{"message":"event_full"}'],
    [400, '{"message":"registration_closed"}'],
  ])('eroarea PostgREST (%i) se propagă neschimbată spre client', async (status, corp) => {
    const f = await incarca({
      rute: [
        (c) => (c.url.includes(SITEVERIFY) ? raspunde(200, { success: true }) : null),
        (c) => (c.url.includes(REST) ? new Response(corp, { status }) : null),
      ],
    });
    const res = await f.cheama(post(INSCRIERE));
    expect(res.status).toBe(status);
    expect(await res.text()).toBe(corp);
  });

  it('un insert eșuat nu declanșează emailul de confirmare', async () => {
    const f = await incarca({
      rute: [
        (c) => (c.url.includes(SITEVERIFY) ? raspunde(200, { success: true }) : null),
        (c) => (c.url.includes(REST) ? new Response('{}', { status: 409 }) : null),
      ],
    });
    await trimite(f, INSCRIERE);
    expect(f.catre('send-email')).toHaveLength(0);
  });
});

describe('emailul de după înscriere', () => {
  const asteaptaEmail = async (f: FunctieEdge) => {
    // `fireEmail` nu e așteptat de handler (deliberat): îi lăsăm un tick.
    await new Promise((r) => setTimeout(r, 0));
    return f.catre('send-email');
  };

  it('o înscriere cere confirmarea, pe id-ul scris', async () => {
    const f = await incarca();
    const { body } = await trimite(f, INSCRIERE);
    const emailuri = await asteaptaEmail(f);
    expect(emailuri).toHaveLength(1);
    expect(emailuri[0].body).toEqual({ mode: 'confirm', id: (body as { id: string }).id });
  });

  it('„anunță-mă" cere emailul de informare, pe adresă', async () => {
    const f = await incarca();
    await trimite(f, LANSARE);
    expect((await asteaptaEmail(f))[0].body).toEqual({ mode: 'info', email: 'ana@exemplu.ro' });
  });

  it('lista de așteptare nu trimite niciun email', async () => {
    const f = await incarca();
    await trimite(f, { ...INSCRIERE, mode: 'waitlist' });
    expect(await asteaptaEmail(f)).toHaveLength(0);
  });

  it('un email căzut NU strică înscrierea deja scrisă', async () => {
    const f = await incarca({
      rute: [
        (c) => (c.url.includes(SITEVERIFY) ? raspunde(200, { success: true }) : null),
        (c) => (c.url.includes(REST) ? new Response('', { status: 201 }) : null),
        (c) => {
          if (!c.url.includes('send-email')) return null;
          throw new Error('Resend down');
        },
      ],
    });
    const { res } = await trimite(f, INSCRIERE);
    expect(res.status).toBe(200);
    await asteaptaEmail(f);
  });
});
