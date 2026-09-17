import { describe, it, expect, afterAll } from 'vitest';

/**
 * Teste de integrare LIVE — lovesc backendul Supabase REAL (proiectul ironworks-gym,
 * schema `runlift`). NU rulează în CI-ul obișnuit și NU sunt incluse în `npm test`.
 * Sunt opt-in și verifică lucrul pe care testele mock-uite nu-l pot verifica:
 * că schema e expusă, că lockdown-ul anti-bot chiar blochează scrierea directă
 * din browser, iar RPC-urile răspund.
 *
 * Rulează:
 *   RUNLIFT_LIVE=1 \
 *   SUPABASE_URL=https://whyndrjcezmtajbykeil.supabase.co \
 *   SUPABASE_ANON_KEY=sb_publishable_... \
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ... \
 *   npm run test:integration
 *
 * ⚠️ IZOLAREA PE EDIȚIE NU MAI FUNCȚIONEAZĂ PE `registrations` / `event_waitlist`.
 *
 * `TEST_EDITION` a fost gândit ca sertar separat, invizibil în `public_stats`. De
 * când există trigger-ul `forteaza_editia_curenta` (runlift_forteaza_editia_la_insert),
 * premisa e falsă: trigger-ul NU are gardă de rol și suprascrie `new.editie` cu
 * ediția curentă la ORICE insert care nu setează `runlift.guard_bypass` — inclusiv
 * cele făcute aici cu service_role prin PostgREST, fiindcă PostgREST nu setează
 * acel GUC. Deci rândurile de test aterizează în EDIȚIA CURENTĂ: apar în
 * `public_stats` și consumă din plafonul real cât ține rularea.
 *
 * Consecințe practice, până când cineva decide cum se izolează suita (ar trebui
 * inserat printr-un helper SECURITY DEFINER care setează `guard_bypass`, ca
 * `admin_add_registration`):
 *  - NU rula suita în fereastra de înscrieri a unei ediții deschise.
 *  - Cu ediția închisă (`registration_deadline` trecut), `registrations_guard_trg`
 *    respinge oricum inserările în `registrations` — testele care depind de ele
 *    vor pica din motive de ediție, nu de schemă.
 *  - `launch_notifications` n-are trigger de ediție și nici plafon, deci acolo
 *    izolarea prin `TEST_EDITION` chiar ține.
 *
 * Restul plaselor de siguranță:
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

/**
 * Două porți pentru etapele deploy-ului anti-bot (vezi `ANTI-BOT.md`).
 *
 * Fără ele suita nu poate fi verde nici înainte, nici după: testele care lovesc
 * `submit-form` dau 404 până când funcția e deployată (U7 pasul 2), iar testul de
 * lockdown TREBUIE să pice până când migrarea e aplicată (U7 pasul 5) — altfel
 * n-ar măsura nimic. Le pornești pe rând, pe măsură ce deploy-ul avansează:
 *
 *   RUNLIFT_SUBMIT_FORM_DEPLOYED=1   după `supabase functions deploy submit-form`
 *   RUNLIFT_LOCKDOWN_APPLIED=1       după `runlift_turnstile_lockdown`
 */
const submitFormDeployed = ready && process.env.RUNLIFT_SUBMIT_FORM_DEPLOYED === '1';
const lockdownApplied = ready && process.env.RUNLIFT_LOCKDOWN_APPLIED === '1';

// Ediții de test — mari (dar sub limita `smallint` = 32767, tipul coloanei `editie`),
// ca să nu coincidă niciodată cu o ediție reală. `PROMO_EDITION` e separată, ca testul
// de auto-promovare să nu fie perturbat de rândurile de waitlist din alte teste.
const TEST_EDITION = 30000;
const PROMO_EDITION = 30001;
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
  // TESTUL CARE CONTEAZĂ pentru protecția anti-bot: cheia publishable e vizibilă
  // în bundle-ul JS, deci oricine o poate lua. Dacă vreuna dintre cererile de mai
  // jos reușește, un bot poate insera fără să treacă prin captcha, iar Turnstile
  // devine decorativ. Vezi `supabase-migration-turnstile-lockdown.sql`.
  it.skipIf(!lockdownApplied)('lockdown: cheia publishable NU mai poate insera direct în niciun tabel public', async () => {
    const tabele: Array<[string, Record<string, unknown>]> = [
      [
        'registrations',
        { nume: 'ZZ Bot Reg', telefon: '+37360000900', email: emailFor('botreg'), acord: true },
      ],
      [
        'event_waitlist',
        { nume: 'ZZ Bot Wait', telefon: '+37360000901', email: emailFor('botwait'), acord: true },
      ],
      [
        'launch_notifications',
        {
          nume: 'ZZ',
          prenume: 'Bot',
          email: emailFor('botlaunch'),
          telefon: '+37360000902',
          sursa: 'lansare',
        },
      ],
    ];

    for (const [tabel, rand] of tabele) {
      const res = await fetch(`${BASE}/rest/v1/${tabel}`, {
        method: 'POST',
        headers: anonHeaders({ 'Content-Profile': SCHEMA, Prefer: 'return=minimal' }),
        body: JSON.stringify(rand),
      });
      expect([401, 403], `${tabel} a acceptat un insert anon (status ${res.status})`).toContain(
        res.status
      );
    }
  });

  it('înscriere: insert cu service_role în registrations (Content-Profile: runlift)', async () => {
    // Calea reală de scriere e funcția Edge `submit-form`, care folosește cheia de
    // service. Aici verificăm că schema/coloanele/trigger-ele răspund pe acea cale.
    const email = emailFor('reg');
    const res = await fetch(`${BASE}/rest/v1/registrations`, {
      method: 'POST',
      headers: serviceHeaders({ 'Content-Profile': SCHEMA, Prefer: 'return=minimal' }),
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

    const check = await fetch(
      `${BASE}/rest/v1/registrations?email=eq.${encodeURIComponent(email)}&select=email,editie`,
      { headers: serviceHeaders({ 'Accept-Profile': SCHEMA }) }
    );
    const rows = (await check.json()) as Array<{ email: string; editie: number }>;
    expect(rows).toHaveLength(1);
    // NU `TEST_EDITION`: `forteaza_editia_curenta` a suprascris valoarea trimisă
    // (vezi avertismentul din capul fișierului). Ce se verifică aici e că insert-ul
    // pe calea service_role funcționează și că ediția o pune serverul — adică exact
    // proprietatea pe care se bazează `submit-form` după lockdown.
    expect(rows[0].editie).not.toBe(TEST_EDITION);
    expect(typeof rows[0].editie).toBe('number');
  });

  it.skipIf(!submitFormDeployed)('submit-form respinge capcana completată, fără să scrie nimic', async () => {
    // Filtru ieftin, înaintea apelului la Cloudflare. Nu depinde de configurarea
    // Turnstile, deci e sigur de rulat pe orice mediu.
    const email = emailFor('honeypot');
    const res = await fetch(`${BASE}/functions/v1/submit-form`, {
      method: 'POST',
      headers: anonHeaders(),
      body: JSON.stringify({
        mode: 'launch',
        token: 'x',
        hp: 'http://spam.example',
        elapsed: 30_000,
        data: { nume: 'ZZ', prenume: 'Bot', email, telefon: '+37360000903', sursa: 'lansare' },
      }),
    });
    expect(res.status).toBe(400);

    const check = await fetch(
      `${BASE}/rest/v1/launch_notifications?email=eq.${encodeURIComponent(email)}&select=email`,
      { headers: serviceHeaders({ 'Accept-Profile': SCHEMA }) }
    );
    expect(await check.json()).toHaveLength(0);
  });

  it.skipIf(!submitFormDeployed)('submit-form respinge submit-ul instantaneu (sub 3 secunde pe formular)', async () => {
    const res = await fetch(`${BASE}/functions/v1/submit-form`, {
      method: 'POST',
      headers: anonHeaders(),
      body: JSON.stringify({
        mode: 'launch',
        token: 'x',
        hp: '',
        elapsed: 120,
        data: {
          nume: 'ZZ',
          prenume: 'Rapid',
          email: emailFor('fast'),
          telefon: '+37360000904',
          sursa: 'lansare',
        },
      }),
    });
    expect(res.status).toBe(400);
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
      headers: serviceHeaders({ 'Content-Profile': SCHEMA, Prefer: 'return=minimal' }),
      body,
    });
    expect(first.status).toBe(201);
    const second = await fetch(`${BASE}/rest/v1/registrations`, {
      method: 'POST',
      headers: serviceHeaders({ 'Content-Profile': SCHEMA, Prefer: 'return=minimal' }),
      body,
    });
    // 409 e statusul pe care `submit-form` îl propagă neschimbat spre client,
    // ca `isDuplicateError` din UI să continue să funcționeze.
    expect(second.status).toBe(409);
  });

  it('listă de așteptare: insert cu service_role în event_waitlist', async () => {
    const res = await fetch(`${BASE}/rest/v1/event_waitlist`, {
      method: 'POST',
      headers: serviceHeaders({ 'Content-Profile': SCHEMA, Prefer: 'return=minimal' }),
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

  it('auto-promovare: ștergerea unei înscrieri promovează cel mai vechi din waitlist', async () => {
    const regEmail = emailFor('promoreg');
    const waitEmail = emailFor('promowait');

    // O înscriere + un rând pe lista de așteptare, pe o ediție de test dedicată.
    const reg = await fetch(`${BASE}/rest/v1/registrations`, {
      method: 'POST',
      headers: serviceHeaders({ 'Content-Profile': SCHEMA, Prefer: 'return=minimal' }),
      body: JSON.stringify({
        nume: 'ZZ Promo Reg',
        telefon: '+37360000010',
        email: regEmail,
        acord: true,
        editie: PROMO_EDITION,
      }),
    });
    expect(reg.status).toBe(201);

    const wait = await fetch(`${BASE}/rest/v1/event_waitlist`, {
      method: 'POST',
      headers: serviceHeaders({ 'Content-Profile': SCHEMA, Prefer: 'return=minimal' }),
      body: JSON.stringify({
        nume: 'ZZ Promo Wait',
        telefon: '+37360000011',
        email: waitEmail,
        acord: true,
        editie: PROMO_EDITION,
      }),
    });
    expect(wait.status).toBe(201);

    // Se eliberează locul → triggerul `auto_promote_from_waitlist` trage waitlist-ul.
    const del = await fetch(
      `${BASE}/rest/v1/registrations?email=eq.${encodeURIComponent(regEmail)}&editie=eq.${PROMO_EDITION}`,
      { method: 'DELETE', headers: serviceHeaders({ 'Content-Profile': SCHEMA, Prefer: 'return=minimal' }) }
    );
    expect(del.status).toBe(204);

    // Cel de pe waitlist e acum în registrations… (filtrăm pe emailul concret, ca
    // eventuale rânduri rămase din alte rulări pe aceeași ediție să nu perturbe testul).
    const regs = await fetch(
      `${BASE}/rest/v1/registrations?email=eq.${encodeURIComponent(waitEmail)}&editie=eq.${PROMO_EDITION}&select=email`,
      { headers: serviceHeaders({ 'Accept-Profile': SCHEMA }) }
    );
    const regRows = (await regs.json()) as Array<{ email: string }>;
    expect(regRows).toHaveLength(1);

    // …și a dispărut de pe lista de așteptare.
    const wl = await fetch(
      `${BASE}/rest/v1/event_waitlist?email=eq.${encodeURIComponent(waitEmail)}&editie=eq.${PROMO_EDITION}&select=email`,
      { headers: serviceHeaders({ 'Accept-Profile': SCHEMA }) }
    );
    const wlRows = (await wl.json()) as Array<{ email: string }>;
    expect(wlRows).toHaveLength(0);
  });

  it('„Anunță-mă": insert cu service_role în launch_notifications (ediția o pune serverul)', async () => {
    const res = await fetch(`${BASE}/rest/v1/launch_notifications`, {
      method: 'POST',
      headers: serviceHeaders({ 'Content-Profile': SCHEMA, Prefer: 'return=minimal' }),
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

  /**
   * Gardă anti-drift, cu direcția INVERSATĂ.
   *
   * Înainte, testul cerea ca `app_config` să urmeze `EDITION` din cod, pentru că
   * `EDITION` era sursa de adevăr și cineva trebuia să ruleze `sync-edition`.
   * Acum sursa e rândul `published` din `event_config`, iar publicarea scrie
   * scalarele în ACEEAȘI tranzacție. Deci ce se verifică nu mai e „codul și baza
   * sunt de acord", ci „scalarele derivate chiar urmează documentul publicat" —
   * singura relație care mai poate să se rupă.
   */
  it('scalarele din app_config urmează documentul publicat', async () => {
    const cfgRes = await fetch(`${BASE}/rest/v1/rpc/public_config`, {
      method: 'POST',
      headers: serviceHeaders({ 'Content-Profile': SCHEMA }),
      body: '{}',
    });
    expect(cfgRes.status).toBe(200);
    const config = (await cfgRes.json()) as {
      number: number;
      launchNumber: number;
      tz: string;
      start: string;
      registrationDeadline: string;
      slots: { total: number };
    };

    const scalarRes = await fetch(
      `${BASE}/rest/v1/app_config?select=key,value&key=in.(current_event_edition,current_launch_edition,event_capacity,event_start,registration_deadline)`,
      { headers: serviceHeaders({ 'Accept-Profile': SCHEMA }) }
    );
    expect(scalarRes.status).toBe(200);
    const scalare = Object.fromEntries(
      ((await scalarRes.json()) as Array<{ key: string; value: string }>).map((r) => [
        r.key,
        r.value,
      ])
    );

    expect(Number(scalare.current_event_edition)).toBe(config.number);
    expect(Number(scalare.current_launch_edition)).toBe(config.launchNumber);
    expect(Number(scalare.event_capacity)).toBe(config.slots.total);
    expect(scalare.event_start).toBe(`${config.start}${config.tz}`);
    expect(scalare.registration_deadline).toBe(`${config.registrationDeadline}${config.tz}`);
  });

  /**
   * Ediția inserărilor publice o impune serverul.
   *
   * Un tab deschis înainte de o publicare trimite numărul vechi din bundle. Nu
   * trebuie respins — trebuie corectat, altfel exact fereastra pe care planul o
   * repară ar produce înscrieri eșuate.
   */
  it('un insert public cu ediție stale e corectat, nu respins', async () => {
    const email = emailFor('editiestale');
    // Cu service_role, nu cu cheia anon: după lockdown calea anon nu mai există,
    // iar PostgREST ar răspunde 401 — testul ar deveni fie roșu, fie vacuu prin
    // ramura de scăpare de mai jos. Proprietatea se păstrează neatinsă, fiindcă
    // `forteaza_editia_curenta` NU are gardă de rol: se aplică oricărei scrieri
    // care nu setează `runlift.guard_bypass`, inclusiv celei făcute de
    // `submit-form`. Exact ăsta e stratul pe care ne bazăm acum.
    const res = await fetch(`${BASE}/rest/v1/registrations`, {
      method: 'POST',
      headers: serviceHeaders({ 'Content-Profile': SCHEMA, Prefer: 'return=minimal' }),
      // 30002 nu e o ediție reală — dacă ar ajunge în tabel, trigger-ul n-a rulat.
      body: JSON.stringify({
        nume: 'Live Stale',
        telefon: '069000000',
        email,
        acord: true,
        editie: 30002,
      }),
    });

    // Poate fi respins de deadline-ul ediției curente; ăsta e alt guard, nu al nostru.
    if (res.status !== 201 && res.status !== 204) {
      expect([400, 403]).toContain(res.status);
      return;
    }

    const check = await fetch(
      `${BASE}/rest/v1/registrations?select=editie&email=eq.${encodeURIComponent(email)}`,
      { headers: serviceHeaders({ 'Accept-Profile': SCHEMA }) }
    );
    const rows = (await check.json()) as Array<{ editie: number }>;
    expect(rows).toHaveLength(1);
    expect(rows[0].editie).not.toBe(30002);
  });

  /**
   * Instantaneul de build NU mai trebuie să fie egal cu ediția publicată — asta e
   * chiar libertatea pe care o cumpără mutarea configului în DB. Ce rămâne
   * obligatoriu e ca documentul publicat să existe și să fie randabil.
   */
  it('există exact un config publicat, randabil', async () => {
    const res = await fetch(`${BASE}/rest/v1/rpc/public_config`, {
      method: 'POST',
      headers: serviceHeaders({ 'Content-Profile': SCHEMA }),
      body: '{}',
    });
    expect(res.status).toBe(200);
    const config = await res.json();
    expect(config).not.toBeNull();
    expect(typeof config.number).toBe('number');
    expect(Array.isArray(config.layout)).toBe(true);
  });
});
