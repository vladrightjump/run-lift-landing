// @vitest-environment node
import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  incarcaFunctieEdge,
  raspunde,
  post,
  type CerereInterceptata,
  type FunctieEdge,
  type Ruta,
} from './harness';

/**
 * `send-email` — toate modurile funcției din care pleacă FIECARE email.
 *
 * Confirmarea de înscriere, promovarea de pe lista de așteptare, reminderele
 * programate de `pg_cron`, difuzările din backoffice și alertele către operator
 * trec toate pe aici. Niciunul dintre eșecurile lor nu se vede în browser:
 * omul care nu primește confirmarea nu are cum să afle, iar operatorul află din
 * „Livrare" abia dacă se uită.
 *
 * Testele încarcă fișierul REAL, cu `Deno` și rețeaua înlocuite (vezi `harness`).
 */

const ENV = {
  SUPABASE_URL: 'https://proiect.supabase.co',
  RUNLIFT_SERVICE_KEY: 'sb_secret_test',
  RESEND_API_KEY: 'rk_test',
  MAIL_FROM: 'Run + Lift <noreply@parktraining.fit>',
  DB_SCHEMA: 'runlift',
};

const RESEND = 'api.resend.com';
const rpcUrl = (fn: string) => `/rest/v1/rpc/${fn}`;

const CONFIG = {
  number: 7,
  eventName: 'Hyrox Trial',
  start: '2026-09-19T07:00:00',
  checkinFrom: '06:45',
  venue: { name: 'Stadionul Dinamo', city: 'Chișinău' },
};

const SABLOANE: Record<string, { subiect: string; text_email: string }> = {
  event_badge: { subiect: '', text_email: 'Hyrox Trial · 19 septembrie' },
  bulk_participant_confirmare: {
    subiect: 'Ești înscris — {numele_cursei}',
    text_email: 'Salut, {prenume}!\n\nNe vedem pe {data_cursei}.\n\nNu poți veni? {link_renunt}',
  },
  bulk_waitlist_promovare: {
    subiect: 'Ai loc la {numele_cursei}',
    text_email: 'Salut, {prenume}! Ai urcat de pe lista de așteptare.\n\nRenunți? {link_renunt}',
  },
  bulk_participant_reminder: {
    subiect: 'Mâine alergăm',
    text_email: 'Salut, {prenume}! Ne vedem la {locul}.\n\nEliberezi locul? {link_renunt}',
  },
  bulk_participant_reminder_final: { subiect: 'Ultimul reminder', text_email: 'Salut, {prenume}!' },
  bulk_waitlist_anunt: { subiect: 'S-au deschis înscrierile', text_email: 'Salut, {prenume}!' },
  confirmare: {
    subiect: 'Confirmă-ți adresa',
    text_email: 'Salut, {{prenume}}!\n\nConfirmă aici: {{link}}',
  },
};

type StareRpc = Record<string, unknown>;

/** Răspunde la RPC-uri din `stare`; un RPC necunoscut întoarce `null`, ca în producție. */
const ruteRpc = (stare: StareRpc): Ruta => (c) => {
  const m = /\/rest\/v1\/rpc\/([a-z_0-9]+)/.exec(c.url);
  if (!m) return null;
  const fn = m[1];
  if (fn === 'template_lookup') {
    const cheie = (c.body as { p_cheie: string }).p_cheie;
    const sabloane = (stare.sabloane ?? SABLONE_IMPLICITE) as typeof SABLOANE;
    const t = sabloane[cheie];
    return raspunde(200, t ? [t] : []);
  }
  // `in`, nu `??`: un `public_config: null` impus de test înseamnă „RPC-ul cade",
  // nu „folosește valoarea implicită".
  if (fn === 'public_config')
    return raspunde(200, 'public_config' in stare ? stare.public_config : CONFIG);
  if (fn in stare) return raspunde(200, stare[fn]);
  return raspunde(200, null);
};

const SABLONE_IMPLICITE = SABLOANE;

/** Resend acceptă; `status` schimbă verdictul. */
const ruteResend = (status = 200): Ruta => (c) =>
  c.url.includes(RESEND)
    ? new Response(status < 300 ? '{"id":"re_1"}' : '{"message":"refuzat"}', { status })
    : null;

const incarca = (o: { env?: Record<string, string>; stare?: StareRpc; resend?: number } = {}) =>
  incarcaFunctieEdge(() => import('../../../supabase/functions/send-email/index.ts'), {
    env: { ...ENV, ...(o.env ?? {}) },
    rute: [ruteRpc(o.stare ?? {}), ruteResend(o.resend)],
  });

const ADMIN_OK: StareRpc = { admin_check_token: true };
const SECRET = 'secret-difuzare';

const cere = async (f: FunctieEdge, body: unknown, headers?: Record<string, string>) => {
  const res = await f.cheama(post(body, headers));
  return { res, body: (await res.json()) as Record<string, unknown> };
};

/** Emailurile predate lui Resend. */
type EmailTrimis = {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
  headers?: Record<string, string>;
};
const trimise = (f: FunctieEdge): EmailTrimis[] =>
  f.catre(RESEND).map((c) => c.body as EmailTrimis);

/** Rândurile scrise în jurnalul de livrare. */
type RandJurnal = Record<string, unknown>;
const jurnal = (f: FunctieEdge): RandJurnal[] =>
  f
    .catre(rpcUrl('log_emails'))
    .flatMap((c) => (c.body as { p_rows: RandJurnal[] }).p_rows ?? []);

const alerte = (f: FunctieEdge): CerereInterceptata[] => f.catre(rpcUrl('escaladeaza'));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('poarta comună', () => {
  it('OPTIONS primește CORS', async () => {
    const f = await incarca();
    const res = await f.cheama(new Request('https://x/f', { method: 'OPTIONS' }));
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeTruthy();
  });

  it('GET → 405', async () => {
    const f = await incarca();
    expect((await f.cheama(new Request('https://x/f'))).status).toBe(405);
  });

  it('corp invalid → 400', async () => {
    const f = await incarca();
    const res = await f.cheama(new Request('https://x/f', { method: 'POST', body: '{{' }));
    expect(res.status).toBe(400);
  });

  it('fără cheie Resend, orice mod care trimite se oprește devreme', async () => {
    const f = await incarca({ env: { RESEND_API_KEY: '' }, stare: ADMIN_OK });
    const { res, body } = await cere(f, { mode: 'confirm', id: 'x' });
    expect(res.status).toBe(500);
    expect(body).toEqual({ error: 'resend_not_configured' });
    expect(f.cereri).toHaveLength(0);
  });

  it('un mod necunoscut nu trimite nimic', async () => {
    const f = await incarca({ stare: ADMIN_OK });
    await cere(f, { mode: 'plimbare' });
    expect(trimise(f)).toHaveLength(0);
  });
});

describe('confirm — emailul de după înscriere', () => {
  const stare = (over: StareRpc = {}) => ({
    confirm_lookup: [{ email: 'ana@exemplu.ro', nume: 'Ana Popescu', token_renunt: 'tok-renunt' }],
    ...over,
  });

  it('fără id → 400', async () => {
    const f = await incarca({ stare: stare() });
    expect((await cere(f, { mode: 'confirm' })).res.status).toBe(400);
  });

  it('o înscriere care nu mai există nu produce email', async () => {
    const f = await incarca({ stare: { confirm_lookup: [] } });
    const { body } = await cere(f, { mode: 'confirm', id: 'x' });
    expect(body).toEqual({ sent: 0, skipped: true });
    expect(trimise(f)).toHaveLength(0);
  });

  it('trimite șablonul din DB, cu variabilele completate', async () => {
    const f = await incarca({ stare: stare() });
    const { body } = await cere(f, { mode: 'confirm', id: 'x' });
    expect(body).toEqual({ sent: 1, failed: 0 });
    const [email] = trimise(f);
    expect(email.to).toBe('ana@exemplu.ro');
    expect(email.subject).toBe('Ești înscris — Hyrox Trial');
    expect(email.text).toContain('Salut, Ana!');
    expect(email.text).toContain('Sâmbătă, 19 septembrie 2026');
    expect(email.text).toContain('https://parktraining.fit/renunt?token=tok-renunt');
    expect(email.text).not.toMatch(/\{\w+\}/);
  });

  /** Confirmarea e tranzacțională: dezabonarea n-are ce căuta pe ea. */
  it('NU poartă link de dezabonare', async () => {
    const f = await incarca({ stare: stare() });
    await cere(f, { mode: 'confirm', id: 'x' });
    const [email] = trimise(f);
    expect(email.text).not.toContain('/unsubscribe');
    expect(email.headers?.['List-Unsubscribe']).toBeUndefined();
  });

  it('paragraful cu linkul de renunțare cade dacă rândul n-are token', async () => {
    const f = await incarca({
      stare: stare({ confirm_lookup: [{ email: 'ana@exemplu.ro', nume: 'Ana Popescu' }] }),
    });
    await cere(f, { mode: 'confirm', id: 'x' });
    expect(trimise(f)[0].text).not.toContain('Nu poți veni?');
  });

  it('se jurnalizează cu modul, audiența și șablonul', async () => {
    const f = await incarca({ stare: stare() });
    await cere(f, { mode: 'confirm', id: 'x' });
    expect(jurnal(f)[0]).toMatchObject({
      email: 'ana@exemplu.ro',
      mod: 'confirm',
      audienta: 'participanti',
      sablon: 'bulk_participant_confirmare',
      ok: true,
    });
  });

  /**
   * Cel mai tăcut eșec din sistem: clientul nu așteaptă răspunsul, deci o
   * confirmare care nu pleacă nu se vede nicăieri. De asta escaladează.
   */
  it('un eșec la provider anunță operatorul și rămâne în jurnal', async () => {
    const f = await incarca({ stare: stare(), resend: 422 });
    const { body } = await cere(f, { mode: 'confirm', id: 'x' });
    expect(body).toMatchObject({ sent: 0, failed: 1 });
    expect(jurnal(f)[0]).toMatchObject({ ok: false, provider_status: 422 });
    expect(alerte(f)).toHaveLength(1);
    expect(alerte(f)[0].body).toMatchObject({ p_tip: 'confirmare_esuata' });
  });

  it('o trimitere reușită NU deranjează operatorul', async () => {
    const f = await incarca({ stare: stare() });
    await cere(f, { mode: 'confirm', id: 'x' });
    expect(alerte(f)).toHaveLength(0);
  });

  it('fără șablon în DB pleacă textul de rezervă, nu un email gol', async () => {
    const f = await incarca({ stare: { ...stare(), sabloane: {} } });
    const { body } = await cere(f, { mode: 'confirm', id: 'x' });
    expect(body).toMatchObject({ sent: 1 });
    expect(trimise(f)[0].subject).toBeTruthy();
    expect(trimise(f)[0].text.length).toBeGreaterThan(20);
  });

  it('configul căzut lasă variabilele literale, nu inventează o dată', async () => {
    const f = await incarca({ stare: { ...stare(), public_config: null } });
    await cere(f, { mode: 'confirm', id: 'x' });
    expect(trimise(f)[0].text).toContain('{data_cursei}');
  });
});

describe('promoted — cine urcă de pe lista de așteptare', () => {
  const stare = {
    confirm_lookup: [{ email: 'ion@exemplu.ro', nume: 'Ion Vasile', token_renunt: 'tok-2' }],
  };

  it('trimite șablonul de promovare, cu linkul lui de renunțare', async () => {
    const f = await incarca({ stare });
    await cere(f, { mode: 'promoted', id: 'x' });
    expect(trimise(f)[0].subject).toBe('Ai loc la Hyrox Trial');
    expect(trimise(f)[0].text).toContain('https://parktraining.fit/renunt?token=tok-2');
    expect(jurnal(f)[0]).toMatchObject({ mod: 'promoted', sablon: 'bulk_waitlist_promovare' });
  });

  it('un eșec escaladează — are loc și nu știe', async () => {
    const f = await incarca({ stare, resend: 500 });
    await cere(f, { mode: 'promoted', id: 'x' });
    expect(alerte(f)[0].body).toMatchObject({ p_tip: 'promovare_esuata' });
  });
});

describe('info — confirmarea adresei (double opt-in)', () => {
  const rand = {
    email: 'ana@exemplu.ro',
    nume: 'Popescu',
    prenume: 'Ana',
    token_confirmare: 'tok-confirm',
    email_trimis_la: null,
  };

  it('fără adresă → 400', async () => {
    const f = await incarca();
    expect((await cere(f, { mode: 'info' })).res.status).toBe(400);
  });

  it('completează linkul unic, în acolade DUBLE', async () => {
    const f = await incarca({ stare: { info_lookup: [rand] } });
    await cere(f, { mode: 'info', email: 'ana@exemplu.ro' });
    const [email] = trimise(f);
    expect(email.text).toContain('https://parktraining.fit/confirmare?token=tok-confirm');
    expect(email.text).toContain('Salut, Ana!');
    expect(email.text).not.toContain('{{');
  });

  it('marchează trimiterea doar după ce emailul a plecat', async () => {
    const f = await incarca({ stare: { info_lookup: [rand] } });
    await cere(f, { mode: 'info', email: 'ana@exemplu.ro' });
    expect(f.catre(rpcUrl('mark_confirmation_sent'))).toHaveLength(1);
  });

  it('un eșec nu marchează nimic — altfel a doua încercare ar fi blocată', async () => {
    const f = await incarca({ stare: { info_lookup: [rand] }, resend: 500 });
    const { body } = await cere(f, { mode: 'info', email: 'ana@exemplu.ro' });
    expect(body).toMatchObject({ failed: 1, providerStatus: 500 });
    expect(f.catre(rpcUrl('mark_confirmation_sent'))).toHaveLength(0);
  });

  it('cooldown de 10 minute: al doilea email nu pleacă', async () => {
    const f = await incarca({
      stare: { info_lookup: [{ ...rand, email_trimis_la: new Date().toISOString() }] },
    });
    const { body } = await cere(f, { mode: 'info', email: 'ana@exemplu.ro' });
    expect(body).toMatchObject({ skipped: true, note: 'cooldown' });
    expect(trimise(f)).toHaveLength(0);
  });

  it('după cooldown se poate cere din nou', async () => {
    const vechi = new Date(Date.now() - 11 * 60_000).toISOString();
    const f = await incarca({ stare: { info_lookup: [{ ...rand, email_trimis_la: vechi }] } });
    const { body } = await cere(f, { mode: 'info', email: 'ana@exemplu.ro' });
    expect(body).toMatchObject({ sent: 1 });
  });

  it('o adresă necunoscută nu spune că e necunoscută', async () => {
    const f = await incarca({ stare: { info_lookup: [] } });
    const { res, body } = await cere(f, { mode: 'info', email: 'cineva@exemplu.ro' });
    expect(res.status).toBe(200);
    expect(body).toEqual({ sent: 0, skipped: true });
  });
});

describe('broadcast — reminderele programate', () => {
  const destinatari = [
    { email: 'ana@exemplu.ro', nume: 'Ana Popescu', token_unsub: 'u1', token_renunt: 'r1' },
    { email: 'ion@exemplu.ro', nume: 'Ion Vasile', token_unsub: 'u2', token_renunt: 'r2' },
  ];
  const stare = (over: StareRpc = {}) => ({
    broadcast_secret: SECRET,
    edition2_recipients: destinatari,
    waitlist_recipients: [{ email: 'vio@exemplu.ro', nume: 'Vio', token_unsub: 'u3' }],
    broadcast_once: true,
    ...over,
  });

  it.each([
    ['fără secret', {}],
    ['cu secret greșit', { secret: 'altceva' }],
  ])('%s → 401, fără trimitere', async (_, over) => {
    const f = await incarca({ stare: stare() });
    const { res } = await cere(f, { mode: 'broadcast', ...over });
    expect(res.status).toBe(401);
    expect(trimise(f)).toHaveLength(0);
  });

  it('secretul poate veni din antet, cum îl trimite pg_net', async () => {
    const f = await incarca({ stare: stare() });
    const { res } = await cere(f, { mode: 'broadcast' }, { 'x-broadcast-secret': SECRET });
    expect(res.status).toBe(200);
  });

  /** Dacă RPC-ul secretului cade, „fără secret configurat" nu înseamnă „intră oricine". */
  it('secretul lipsă în DB nu deschide poarta', async () => {
    const f = await incarca({ stare: stare({ broadcast_secret: null }) });
    const { res } = await cere(f, { mode: 'broadcast', secret: '' });
    expect(res.status).toBe(401);
  });

  it('trimite fiecăruia, cu tokenul LUI de dezabonare și de renunțare', async () => {
    const f = await incarca({ stare: stare() });
    const { body } = await cere(f, { mode: 'broadcast', secret: SECRET });
    expect(body).toMatchObject({ sent: 2, failed: 0 });
    const emailuri = trimise(f);
    expect(emailuri[0].text).toContain('https://parktraining.fit/renunt?token=r1');
    expect(emailuri[0].text).toContain('https://parktraining.fit/unsubscribe?token=u1');
    expect(emailuri[0].headers?.['List-Unsubscribe']).toBe(
      '<https://proiect.supabase.co/functions/v1/unsubscribe?token=u1>'
    );
    expect(emailuri[0].headers?.['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
    expect(emailuri[1].text).toContain('token=r2');
    expect(emailuri[1].text).not.toContain('token=r1');
  });

  it('audiența „asteptare" citește altă listă și alt șablon', async () => {
    const f = await incarca({ stare: stare() });
    await cere(f, { mode: 'broadcast', secret: SECRET, audience: 'asteptare' });
    expect(f.catre(rpcUrl('waitlist_recipients'))).toHaveLength(1);
    expect(f.catre(rpcUrl('edition2_recipients'))).toHaveLength(0);
    expect(jurnal(f)[0]).toMatchObject({ audienta: 'asteptare', sablon: 'bulk_waitlist_anunt' });
  });

  it('cei de pe lista de așteptare n-au loc de eliberat — paragraful cade', async () => {
    const f = await incarca({
      stare: stare({
        sabloane: {
          ...SABLOANE,
          bulk_waitlist_anunt: {
            subiect: 'Anunț',
            text_email: 'Salut!\n\nEliberezi locul? {link_renunt}',
          },
        },
      }),
    });
    await cere(f, { mode: 'broadcast', secret: SECRET, audience: 'asteptare' });
    expect(trimise(f)[0].text).not.toContain('Eliberezi locul?');
  });

  it('cheia de șablon cerută se folosește dacă e în lista permisă', async () => {
    const f = await incarca({ stare: stare() });
    await cere(f, {
      mode: 'broadcast',
      secret: SECRET,
      template: 'bulk_participant_reminder_final',
    });
    expect(trimise(f)[0].subject).toBe('Ultimul reminder');
    expect(jurnal(f)[0]).toMatchObject({ sablon: 'bulk_participant_reminder_final' });
  });

  /** O cheie inexistentă ar cădea tăcut pe textul din cod — adică alt email. */
  it('o cheie din afara listei cade pe reminderul implicit, editat din admin', async () => {
    const f = await incarca({ stare: stare() });
    await cere(f, { mode: 'broadcast', secret: SECRET, template: 'bulk_participant_inventat' });
    expect(trimise(f)[0].subject).toBe('Mâine alergăm');
    expect(jurnal(f)[0]).toMatchObject({ sablon: 'bulk_participant_reminder' });
  });

  it('zăvorul oprește a doua difuzare pe aceeași cheie', async () => {
    const f = await incarca({ stare: stare({ broadcast_once: false }) });
    const { body } = await cere(f, { mode: 'broadcast', secret: SECRET, once_key: 'k' });
    expect(body).toMatchObject({ skipped: true, note: 'already_sent' });
    expect(trimise(f)).toHaveLength(0);
  });

  it('fără destinatari nu consumă zăvorul', async () => {
    const f = await incarca({ stare: stare({ edition2_recipients: [] }) });
    const { body } = await cere(f, { mode: 'broadcast', secret: SECRET, once_key: 'k' });
    expect(body).toMatchObject({ note: 'no_recipients' });
    expect(f.catre(rpcUrl('broadcast_once'))).toHaveLength(0);
  });

  it('un eșec individual nu oprește restul listei', async () => {
    const f = await incarca({ stare: stare() });
    let n = 0;
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = String(input);
      if (url.includes(RESEND)) {
        n++;
        return new Response('{"message":"refuzat"}', { status: n === 1 ? 422 : 200 });
      }
      return (ruteRpc(stare())({ url, init, body: JSON.parse(String(init.body ?? '{}')) }) ??
        raspunde(200, null)) as Response;
    });
    const { body } = await cere(f, { mode: 'broadcast', secret: SECRET });
    expect(body).toMatchObject({ sent: 1, failed: 1 });
    expect((body.errors as { to: string }[])[0].to).toBe('ana@exemplu.ro');
  });

  it('subiectul și textul pot fi impuse de apelant', async () => {
    const f = await incarca({ stare: stare() });
    await cere(f, {
      mode: 'broadcast',
      secret: SECRET,
      subject: 'Subiect impus',
      text: 'Text impus pentru {prenume}',
    });
    expect(trimise(f)[0].subject).toBe('Subiect impus');
    expect(trimise(f)[0].text).toContain('Text impus pentru Ana');
  });
});

describe('admin — difuzarea compusă în backoffice', () => {
  const mesaje = [
    { to: 'ana@exemplu.ro', subject: 'Salut', text: 'Text' },
    { to: 'ion@exemplu.ro', subject: 'Salut', text: 'Text' },
  ];

  it('fără token valid → 401', async () => {
    const f = await incarca({ stare: { admin_check_token: false } });
    const { res } = await cere(f, { mode: 'admin', token: 'x', messages: mesaje });
    expect(res.status).toBe(401);
    expect(trimise(f)).toHaveLength(0);
  });

  it('fără destinatari → 400', async () => {
    const f = await incarca({ stare: ADMIN_OK });
    const { res, body } = await cere(f, { mode: 'admin', token: 'x', messages: [] });
    expect(res.status).toBe(400);
    expect(body).toEqual({ error: 'no_recipients' });
  });

  it('trimite fiecare mesaj și jurnalizează audiența și ediția', async () => {
    const f = await incarca({ stare: ADMIN_OK });
    const { body } = await cere(f, {
      mode: 'admin',
      token: 'x',
      messages: mesaje,
      audience: 'asteptare',
      editie: 7,
    });
    expect(body).toMatchObject({ sent: 2, failed: 0 });
    expect(jurnal(f)).toHaveLength(2);
    expect(jurnal(f)[0]).toMatchObject({ mod: 'admin', audienta: 'asteptare', editie: 7 });
  });

  it('mesajele fără adresă sau subiect sunt sărite, nu trimise pe jumătate', async () => {
    const f = await incarca({ stare: ADMIN_OK });
    const { body } = await cere(f, {
      mode: 'admin',
      token: 'x',
      messages: [{ to: '', subject: 'x', text: 'y' }, { to: 'a@b.ro', subject: '', text: 'y' }, mesaje[0]],
    });
    expect(body).toMatchObject({ sent: 1 });
    expect(trimise(f)).toHaveLength(1);
  });

  it('zăvorul oprește a doua trimitere pe aceeași cheie', async () => {
    const f = await incarca({ stare: { ...ADMIN_OK, broadcast_once: false } });
    const { body } = await cere(f, {
      mode: 'admin',
      token: 'x',
      messages: mesaje,
      once_key: 'k',
    });
    expect(body).toMatchObject({ skipped: true });
    expect(trimise(f)).toHaveLength(0);
  });
});

describe('alert — anomalia către operator', () => {
  const stare = (over: StareRpc = {}) => ({
    broadcast_secret: SECRET,
    operator_email: 'operator@exemplu.ro',
    ...over,
  });

  it('cere secretul de difuzare — nu e un releu deschis', async () => {
    const f = await incarca({ stare: stare() });
    const { res } = await cere(f, { mode: 'alert', subject: 'x', text: 'y' });
    expect(res.status).toBe(401);
    expect(trimise(f)).toHaveLength(0);
  });

  it('trimite la adresa operatorului din config și jurnalizează', async () => {
    const f = await incarca({ stare: stare() });
    const { body } = await cere(f, {
      mode: 'alert',
      secret: SECRET,
      subject: 'Confirmarea nu a plecat',
      text: 'detalii',
      editie: 7,
    });
    expect(body).toMatchObject({ sent: 1 });
    expect(trimise(f)[0].to).toBe('operator@exemplu.ro');
    expect(jurnal(f)[0]).toMatchObject({ mod: 'alert', editie: 7 });
  });

  it('fără adresă de operator nu inventează un destinatar', async () => {
    const f = await incarca({ stare: stare({ operator_email: null }) });
    const { body } = await cere(f, { mode: 'alert', secret: SECRET, subject: 'x', text: 'y' });
    expect(body).toMatchObject({ skipped: true, note: 'no_operator_email' });
    expect(trimise(f)).toHaveLength(0);
  });
});

describe('replay — rejucarea unui eșec, prin fluxul lui', () => {
  const plan = (over: Record<string, unknown> = {}) => ({
    admin_replay_lookup: [
      {
        ok: true,
        motiv: null,
        mod: 'confirm',
        sablon: 'bulk_participant_confirmare',
        audienta: 'participanti',
        email: 'ana@exemplu.ro',
        nume: 'Ana Popescu',
        token_renunt: 'r9',
        token_unsub: 'u9',
        editie: 7,
        ...over,
      },
    ],
    ...ADMIN_OK,
  });

  it('fără token valid → 401', async () => {
    const f = await incarca({ stare: { admin_check_token: false } });
    expect((await cere(f, { mode: 'replay', token: 'x', log_id: 'l' })).res.status).toBe(401);
  });

  it('fără id de jurnal → 400', async () => {
    const f = await incarca({ stare: plan() });
    expect((await cere(f, { mode: 'replay', token: 'x' })).res.status).toBe(400);
  });

  it('un refuz al serverului nu trimite nimic', async () => {
    const f = await incarca({ stare: plan({ ok: false, motiv: 'dezabonat', mod: 'broadcast' }) });
    const { res, body } = await cere(f, { mode: 'replay', token: 'x', log_id: 'l' });
    expect(res.status).toBe(409);
    expect(body).toMatchObject({ motiv: 'dezabonat' });
    expect(trimise(f)).toHaveLength(0);
  });

  it('reconstruiește mesajul din ȘABLON și starea de acum', async () => {
    const f = await incarca({ stare: plan() });
    const { body } = await cere(f, { mode: 'replay', token: 'x', log_id: 'l' });
    expect(body).toMatchObject({ sent: 1, mod: 'confirm' });
    expect(trimise(f)[0].text).toContain('Salut, Ana!');
    expect(trimise(f)[0].text).toContain('token=r9');
  });

  /** Fișa de acoperire numără comunicările datorate; un mod „replay" le-ar pierde. */
  it('jurnalul păstrează modul ORIGINAL, nu „replay"', async () => {
    const f = await incarca({ stare: plan() });
    await cere(f, { mode: 'replay', token: 'x', log_id: 'l' });
    expect(jurnal(f)[0]).toMatchObject({ mod: 'confirm', sablon: 'bulk_participant_confirmare' });
  });

  it('o confirmare rejucată NU capătă link de dezabonare', async () => {
    const f = await incarca({ stare: plan() });
    await cere(f, { mode: 'replay', token: 'x', log_id: 'l' });
    expect(trimise(f)[0].text).not.toContain('/unsubscribe');
  });

  it('o difuzare rejucată îl păstrează', async () => {
    const f = await incarca({
      stare: plan({ mod: 'broadcast', sablon: 'bulk_participant_reminder' }),
    });
    await cere(f, { mode: 'replay', token: 'x', log_id: 'l' });
    expect(trimise(f)[0].text).toContain('/unsubscribe?token=u9');
    expect(trimise(f)[0].headers?.['List-Unsubscribe']).toContain('u9');
  });

  it('un șablon dispărut între timp → 404, nu un email generic', async () => {
    const f = await incarca({ stare: { ...plan({ sablon: 'nu_exista' }) } });
    const { res } = await cere(f, { mode: 'replay', token: 'x', log_id: 'l' });
    expect(res.status).toBe(404);
    expect(trimise(f)).toHaveLength(0);
  });

  it('un anunț refuzat de lookup-ul general trece pe calea lui dedicată', async () => {
    const f = await incarca({
      stare: {
        ...plan({ ok: false, motiv: 'mod_exclus', mod: 'anunt' }),
        admin_replay_anunt_lookup: [
          {
            ok: true,
            motiv: null,
            email: 'ana@exemplu.ro',
            nume: 'Ana Popescu',
            subiect: 'Subiect din jurnal',
            text_email: 'Text din jurnal',
            token_unsub: 'u-anunt',
            editie: 7,
          },
        ],
      },
    });
    const { body } = await cere(f, { mode: 'replay', token: 'x', log_id: 'l' });
    expect(body).toMatchObject({ sent: 1, mod: 'anunt' });
    expect(trimise(f)[0].subject).toBe('Subiect din jurnal');
    expect(trimise(f)[0].text).toContain('/unsubscribe?token=u-anunt');
  });
});

describe('preview — ce se vede înainte de trimitere', () => {
  const stare = (over: StareRpc = {}) => ({
    ...ADMIN_OK,
    edition2_recipients: [
      { email: 'ana@exemplu.ro', nume: 'Ana Popescu', token_unsub: 'u1', token_renunt: 'r1' },
      { email: 'ion@exemplu.ro', nume: 'Ion Vasile', token_unsub: 'u2', token_renunt: 'r2' },
    ],
    ...over,
  });

  it('merge și fără cheie de Resend — nu trimite nimic', async () => {
    const f = await incarca({ env: { RESEND_API_KEY: '' }, stare: stare() });
    const { res } = await cere(f, {
      mode: 'preview',
      token: 'x',
      template: 'bulk_participant_reminder',
    });
    expect(res.status).toBe(200);
  });

  it('nu trimite și nu lasă urmă în jurnal', async () => {
    const f = await incarca({ stare: stare() });
    await cere(f, { mode: 'preview', token: 'x', template: 'bulk_participant_reminder' });
    expect(trimise(f)).toHaveLength(0);
    expect(jurnal(f)).toHaveLength(0);
  });

  it('randează pe un destinatar real, cu linkurile lui', async () => {
    const f = await incarca({ stare: stare() });
    const { body } = await cere(f, {
      mode: 'preview',
      token: 'x',
      template: 'bulk_participant_reminder',
    });
    expect(body.pentru).toEqual({ email: 'ana@exemplu.ro', nume: 'Ana Popescu' });
    expect(body.html as string).toContain('token=r1');
    expect(body.html as string).toContain('/unsubscribe?token=u1');
  });

  it('se poate cere un anume destinatar', async () => {
    const f = await incarca({ stare: stare() });
    const { body } = await cere(f, {
      mode: 'preview',
      token: 'x',
      template: 'bulk_participant_reminder',
      email: 'ION@exemplu.ro',
    });
    expect(body.pentru).toMatchObject({ email: 'ion@exemplu.ro' });
  });

  it('cineva care nu mai e destinatar primește alt cod decât o listă goală', async () => {
    const f = await incarca({ stare: stare() });
    const { res, body } = await cere(f, {
      mode: 'preview',
      token: 'x',
      template: 'bulk_participant_reminder',
      email: 'dezabonat@exemplu.ro',
    });
    expect(res.status).toBe(404);
    expect(body).toEqual({ error: 'recipient_not_eligible' });

    const g = await incarca({ stare: stare({ edition2_recipients: [] }) });
    const gol = await cere(g, {
      mode: 'preview',
      token: 'x',
      template: 'bulk_participant_reminder',
    });
    expect(gol.body).toEqual({ error: 'no_recipient' });
  });

  it('un șablon inexistent → 404, nu textul de rezervă prezentat ca real', async () => {
    const f = await incarca({ stare: stare() });
    const { res, body } = await cere(f, { mode: 'preview', token: 'x', template: 'nu_exista' });
    expect(res.status).toBe(404);
    expect(body).toEqual({ error: 'unknown_template' });
  });

  /** `confirmare` și `info` folosesc acolade DUBLE; tratate ca simple, ar arăta rupt. */
  it('șablonul cu acolade duble se randează corect, cu link de exemplu', async () => {
    const f = await incarca({ stare: stare() });
    const { body } = await cere(f, { mode: 'preview', token: 'x', template: 'confirmare' });
    const html = body.html as string;
    expect(html).toContain('Salut, Ana!');
    expect(html).toContain('token=EXEMPLU');
    expect(html).not.toContain('{{');
  });
});

describe('emailul predat providerului', () => {
  const stare = {
    confirm_lookup: [{ email: 'ana@exemplu.ro', nume: 'Ana Popescu', token_renunt: 'r1' }],
  };

  it('pleacă de la adresa configurată, cu antetul de autorizare', async () => {
    const f = await incarca({ stare });
    await cere(f, { mode: 'confirm', id: 'x' });
    const cerere = f.catre(RESEND)[0];
    expect((cerere.init.headers as Record<string, string>).Authorization).toBe('Bearer rk_test');
    expect(trimise(f)[0].from).toBe(ENV.MAIL_FROM);
  });

  it('are și variantă HTML, cu badge-ul editat din admin', async () => {
    const f = await incarca({ stare });
    await cere(f, { mode: 'confirm', id: 'x' });
    const { html } = trimise(f)[0];
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('Hyrox Trial · 19 septembrie');
  });

  /** Numele vine dintr-un formular public: în HTML nu are voie să fie markup. */
  it('numele și subiectul sunt escapate în HTML', async () => {
    const f = await incarca({
      stare: {
        confirm_lookup: [
          { email: 'ana@exemplu.ro', nume: '<script>alert(1)</script>', token_renunt: 'r1' },
        ],
      },
    });
    await cere(f, { mode: 'confirm', id: 'x' });
    const { html } = trimise(f)[0];
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('jurnalul se scrie în schema runlift, cu cheia de service', async () => {
    const f = await incarca({ stare });
    await cere(f, { mode: 'confirm', id: 'x' });
    const cerere = f.catre(rpcUrl('log_emails'))[0];
    const headers = cerere.init.headers as Record<string, string>;
    expect(headers['Content-Profile']).toBe('runlift');
    expect(headers.apikey).toBe('sb_secret_test');
  });

  it('un jurnal căzut nu transformă un email trimis în eșec', async () => {
    const f = await incarcaFunctieEdge(
      () => import('../../../supabase/functions/send-email/index.ts'),
      {
        env: ENV,
        rute: [
          (c) => {
            if (!c.url.includes(rpcUrl('log_emails'))) return null;
            throw new Error('DB down');
          },
          ruteRpc(stare),
          ruteResend(),
        ],
      }
    );
    const { body } = await cere(f, { mode: 'confirm', id: 'x' });
    expect(body).toMatchObject({ sent: 1 });
  });
});
