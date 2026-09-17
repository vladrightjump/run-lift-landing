import { describe, it, expect, vi } from 'vitest';
import {
  anunt,
  rejoacaAnunt,
  LOT_JURNAL,
  MAX_EXCLUDERI,
  PAUZA_ANUNT_MS,
  type DepsAnunt,
  type RandJurnalAnunt,
} from '../../supabase/functions/send-email/anunt';

/**
 * Modul `anunt` al funcției Edge `send-email` — calea care trimite emailuri
 * reale către tot istoricul. Nicio eroare de aici nu se vede în browser: un
 * anunț plecat de două ori, la cine nu trebuie sau cu linkul de dezabonare al
 * altcuiva nu se mai poate retrage.
 *
 * Rețeaua e înlocuită prin `DepsAnunt`; restul e exact codul deployat.
 */

type Destinatar = { email: string; nume: string; token_unsub: string; ultima_editie: number };

const om = (i: number): Destinatar => ({
  email: `om${i}@exemplu.ro`,
  nume: `Prenume${i} Nume${i}`,
  token_unsub: `tok-${i}`,
  ultima_editie: 6,
});

const CONFIG = {
  number: 7,
  eventName: 'Hyrox Trial',
  start: '2026-09-19T07:00:00',
  checkinFrom: '06:45',
  venue: { name: 'Stadionul Dinamo', city: 'Chișinău' },
};

type Optiuni = {
  tokenValid?: boolean;
  destinatari?: Destinatar[] | null;
  zavor?: boolean;
  status?: (to: string, incercare: number) => number;
};

const pregateste = (o: Optiuni = {}) => {
  const lista = o.destinatari === undefined ? [om(1), om(2), om(3)] : o.destinatari;
  const incercari = new Map<string, number>();
  const jurnal: RandJurnalAnunt[][] = [];

  const rpc = vi.fn(async (fn: string, _args?: Record<string, unknown>): Promise<unknown> => {
    if (fn === 'admin_check_token') return o.tokenValid ?? true;
    if (fn === 'anunt_recipients') return lista;
    if (fn === 'broadcast_once') return o.zavor ?? true;
    throw new Error(`rpc neașteptat: ${fn}`);
  });
  const sendOne = vi.fn<DepsAnunt['sendOne']>(async (m) => {
    const n = (incercari.get(m.to) ?? 0) + 1;
    incercari.set(m.to, n);
    const status = o.status ? o.status(m.to, n) : 200;
    return { ok: status < 300, status, body: status < 300 ? '' : `{"message":"eroare ${status}"}` };
  });
  const logSends = vi.fn(async (rows: RandJurnalAnunt[]) => {
    jurnal.push([...rows]);
  });
  const pauza = vi.fn(async () => {});

  const deps: DepsAnunt = {
    rpc: rpc as DepsAnunt['rpc'],
    sendOne,
    logSends,
    loadConfig: async () => CONFIG,
    loadBadge: async () => 'Hyrox Trial',
    fillVars: (text, nume, email) =>
      text
        .replace(/\{nume\}/g, nume)
        .replace(/\{prenume\}/g, nume.split(/\s+/)[0])
        .replace(/\{email\}/g, email),
    pauza,
    supabaseUrl: 'https://proiect.supabase.co',
  };
  return { deps, rpc, sendOne, logSends, pauza, jurnal };
};

const TRIMITERE = {
  token: 'admin',
  subject: 'Ne vedem din nou? {numele_cursei}',
  text: 'Salut, {prenume}! Ne vedem pe {data_cursei}, la {locul}.',
  once_key: 'anunt|7|istoric|x',
  sablon: 'bulk_participant_anunt',
};

const apeluriRpc = (rpc: ReturnType<typeof vi.fn>, fn: string) =>
  rpc.mock.calls.filter((c) => c[0] === fn);

describe('autentificare și validare — nimic nu pleacă pe o cerere greșită', () => {
  it('token invalid → 401, fără să citească lista', async () => {
    const { deps, rpc, sendOne } = pregateste({ tokenValid: false });
    const r = await anunt({ ...TRIMITERE, dry_run: true }, deps);
    expect(r.status).toBe(401);
    expect(apeluriRpc(rpc, 'anunt_recipients')).toHaveLength(0);
    expect(sendOne).not.toHaveBeenCalled();
  });

  it.each([
    ['nu e listă', 'ana@x.ro'],
    ['conține altceva decât text', ['ana@x.ro', 42]],
    ['depășește plafonul', Array.from({ length: MAX_EXCLUDERI + 1 }, (_, i) => `x${i}@x.ro`)],
  ])('`exclude` care %s → 400, fără trimitere', async (_, exclude) => {
    const { deps, sendOne, rpc } = pregateste();
    const r = await anunt({ ...TRIMITERE, exclude }, deps);
    expect(r).toEqual({ status: 400, body: { error: 'bad_exclude' } });
    expect(sendOne).not.toHaveBeenCalled();
    expect(apeluriRpc(rpc, 'broadcast_once')).toHaveLength(0);
  });

  it('`exclude` la exact plafon e acceptat', async () => {
    const { deps } = pregateste();
    const exclude = Array.from({ length: MAX_EXCLUDERI }, (_, i) => `x${i}@x.ro`);
    expect((await anunt({ ...TRIMITERE, exclude, dry_run: true }, deps)).status).toBe(200);
  });

  it('lista care nu se poate calcula e o eroare, nu „nimeni de anunțat"', async () => {
    const { deps, sendOne } = pregateste({ destinatari: null });
    const r = await anunt(TRIMITERE, deps);
    expect(r).toEqual({ status: 500, body: { error: 'recipients_failed' } });
    expect(sendOne).not.toHaveBeenCalled();
  });

  it.each([
    ['subiect gol', { subject: '   ' }],
    ['text gol', { text: '' }],
  ])('%s → 400, fără să consume zăvorul', async (_, over) => {
    const { deps, rpc, sendOne } = pregateste();
    const r = await anunt({ ...TRIMITERE, ...over }, deps);
    expect(r).toEqual({ status: 400, body: { error: 'missing_content' } });
    expect(apeluriRpc(rpc, 'broadcast_once')).toHaveLength(0);
    expect(sendOne).not.toHaveBeenCalled();
  });
});

describe('dry_run — lista, fără efecte', () => {
  it('întoarce oamenii FĂRĂ tokenurile de dezabonare', async () => {
    const { deps } = pregateste();
    const r = await anunt({ token: 'admin', dry_run: true }, deps);
    expect(r.status).toBe(200);
    expect(r.body.total).toBe(3);
    expect(JSON.stringify(r.body)).not.toContain('tok-');
    expect(r.body.destinatari).toEqual([
      { email: 'om1@exemplu.ro', nume: 'Prenume1 Nume1', ultima_editie: 6 },
      { email: 'om2@exemplu.ro', nume: 'Prenume2 Nume2', ultima_editie: 6 },
      { email: 'om3@exemplu.ro', nume: 'Prenume3 Nume3', ultima_editie: 6 },
    ]);
  });

  it('nu trimite, nu scrie jurnal și nu consumă zăvorul', async () => {
    const { deps, rpc, sendOne, logSends } = pregateste();
    await anunt({ ...TRIMITERE, dry_run: true }, deps);
    expect(sendOne).not.toHaveBeenCalled();
    expect(logSends).not.toHaveBeenCalled();
    expect(apeluriRpc(rpc, 'broadcast_once')).toHaveLength(0);
  });

  it('excluderile ajung la server neschimbate — lista o calculează el', async () => {
    const { deps, rpc } = pregateste();
    await anunt({ token: 'admin', dry_run: true, exclude: ['Ana@X.ro'] }, deps);
    expect(apeluriRpc(rpc, 'anunt_recipients')[0][1]).toEqual({ p_exclude: ['Ana@X.ro'] });
  });
});

describe('emailul de test — doar la operator', () => {
  const TEST = { ...TRIMITERE, test_to: 'operator@exemplu.ro' };

  it('adresă invalidă → 400, fără trimitere', async () => {
    const { deps, sendOne } = pregateste();
    const r = await anunt({ ...TEST, test_to: 'nu-e-email' }, deps);
    expect(r).toEqual({ status: 400, body: { error: 'bad_test_to' } });
    expect(sendOne).not.toHaveBeenCalled();
  });

  it('pleacă un singur email, la operator, marcat [TEST]', async () => {
    const { deps, sendOne } = pregateste();
    const r = await anunt(TEST, deps);
    expect(r).toEqual({ status: 200, body: { sent: 1, failed: 0 } });
    expect(sendOne).toHaveBeenCalledTimes(1);
    expect(sendOne.mock.calls[0][0].to).toBe('operator@exemplu.ro');
    expect(sendOne.mock.calls[0][0].subject).toBe('[TEST] Ne vedem din nou? Hyrox Trial');
  });

  /**
   * Cel mai scump bug posibil aici: testul e randat pe primul om din listă. Cu
   * tokenul lui în link, operatorul care verifică butonul „Dezabonează-te” l-ar
   * dezabona pe acel om, fără să afle vreodată.
   */
  it('linkurile de dezabonare NU poartă tokenul vreunui destinatar real', async () => {
    const { deps, sendOne } = pregateste();
    await anunt(TEST, deps);
    const [, , pagina, api] = sendOne.mock.calls[0];
    expect(pagina).toBe('https://parktraining.fit/unsubscribe');
    expect(api).toBe('https://proiect.supabase.co/functions/v1/unsubscribe');
    expect(JSON.stringify(sendOne.mock.calls[0])).not.toContain('tok-');
  });

  it('nu consumă zăvorul — anunțul real rămâne trimisibil', async () => {
    const { deps, rpc } = pregateste();
    await anunt(TEST, deps);
    expect(apeluriRpc(rpc, 'broadcast_once')).toHaveLength(0);
  });

  it('se jurnalizează ca `anunt_test`, ca să nu pară un anunț plecat', async () => {
    const { deps, jurnal } = pregateste();
    await anunt(TEST, deps);
    expect(jurnal.flat()).toHaveLength(1);
    expect(jurnal.flat()[0]).toMatchObject({ mod: 'anunt_test', email: 'operator@exemplu.ro' });
  });

  it('cu lista goală se randează tot, pe un nume generic', async () => {
    const { deps, sendOne } = pregateste({ destinatari: [] });
    await anunt(TEST, deps);
    expect(sendOne.mock.calls[0][0].text).toContain('Salut, Test!');
  });
});

describe('trimiterea — zăvorul', () => {
  it('fără `once_key` → 400, nimic trimis', async () => {
    const { deps, sendOne } = pregateste();
    const r = await anunt({ ...TRIMITERE, once_key: '' }, deps);
    expect(r).toEqual({ status: 400, body: { error: 'missing_once_key' } });
    expect(sendOne).not.toHaveBeenCalled();
  });

  it('o listă goală NU consumă zăvorul — altfel anunțul real ar ieși „deja trimis"', async () => {
    const { deps, rpc } = pregateste({ destinatari: [] });
    const r = await anunt(TRIMITERE, deps);
    expect(r.body).toMatchObject({ sent: 0, note: 'no_recipients' });
    expect(apeluriRpc(rpc, 'broadcast_once')).toHaveLength(0);
  });

  it('zăvor deja consumat → nimic trimis, răspuns `skipped`', async () => {
    const { deps, sendOne, logSends } = pregateste({ zavor: false });
    const r = await anunt(TRIMITERE, deps);
    expect(r.body).toMatchObject({ sent: 0, skipped: true });
    expect(sendOne).not.toHaveBeenCalled();
    expect(logSends).not.toHaveBeenCalled();
  });

  it('zăvorul se cere cu cheia primită', async () => {
    const { deps, rpc } = pregateste();
    await anunt(TRIMITERE, deps);
    expect(apeluriRpc(rpc, 'broadcast_once')).toEqual([['broadcast_once', { p_key: TRIMITERE.once_key }]]);
  });
});

describe('trimiterea — fiecare om, o dată, cu propria dezabonare', () => {
  it('trimite exact o dată fiecărui destinatar', async () => {
    const { deps, sendOne } = pregateste();
    const r = await anunt(TRIMITERE, deps);
    expect(r.body).toEqual({ sent: 3, failed: 0, errors: [] });
    expect(sendOne.mock.calls.map((c) => c[0].to)).toEqual([
      'om1@exemplu.ro',
      'om2@exemplu.ro',
      'om3@exemplu.ro',
    ]);
  });

  it('fiecare email poartă tokenul de dezabonare AL LUI, pe pagină și în header', async () => {
    const { deps, sendOne } = pregateste();
    await anunt(TRIMITERE, deps);
    sendOne.mock.calls.forEach(([m, , pagina, api], i) => {
      const tok = `tok-${i + 1}`;
      expect(m.to).toBe(`om${i + 1}@exemplu.ro`);
      expect(pagina).toBe(`https://parktraining.fit/unsubscribe?token=${tok}`);
      expect(api).toBe(`https://proiect.supabase.co/functions/v1/unsubscribe?token=${tok}`);
    });
  });

  it('un destinatar fără token primește emailul fără linkuri stricate', async () => {
    const { deps, sendOne } = pregateste({ destinatari: [{ ...om(1), token_unsub: '' }] });
    await anunt(TRIMITERE, deps);
    const [, , pagina, api] = sendOne.mock.calls[0];
    expect(pagina).toBeUndefined();
    expect(api).toBeUndefined();
  });

  it('variabilele de eveniment și de persoană sunt completate, nimic literal', async () => {
    const { deps, sendOne } = pregateste();
    await anunt(TRIMITERE, deps);
    const [m] = sendOne.mock.calls[1];
    expect(m.subject).toBe('Ne vedem din nou? Hyrox Trial');
    expect(m.text).toBe('Salut, Prenume2! Ne vedem pe Sâmbătă, 19 septembrie 2026, la Stadionul Dinamo, Chișinău.');
    expect(m.text).not.toMatch(/\{\w+\}/);
  });

  it('o pauză între trimiteri, niciuna înainte de prima', async () => {
    const { deps, pauza } = pregateste();
    await anunt(TRIMITERE, deps);
    expect(pauza.mock.calls).toEqual([[PAUZA_ANUNT_MS], [PAUZA_ANUNT_MS]]);
  });
});

describe('trimiterea — eșecuri', () => {
  it('un `429` se reîncearcă o dată, după o secundă', async () => {
    const { deps, sendOne, pauza } = pregateste({
      status: (to, n) => (to === 'om2@exemplu.ro' && n === 1 ? 429 : 200),
    });
    const r = await anunt(TRIMITERE, deps);
    expect(r.body).toEqual({ sent: 3, failed: 0, errors: [] });
    expect(sendOne.mock.calls.filter((c) => c[0].to === 'om2@exemplu.ro')).toHaveLength(2);
    expect(pauza).toHaveBeenCalledWith(1000);
  });

  it('un `429` repetat nu se reîncearcă la nesfârșit', async () => {
    const { deps, sendOne } = pregateste({ status: (to) => (to === 'om2@exemplu.ro' ? 429 : 200) });
    const r = await anunt(TRIMITERE, deps);
    expect(sendOne.mock.calls.filter((c) => c[0].to === 'om2@exemplu.ro')).toHaveLength(2);
    expect(r.body).toEqual({ sent: 2, failed: 1, errors: [{ to: 'om2@exemplu.ro', status: 429 }] });
  });

  it('alte eșecuri nu se reîncearcă — ar lovi aceeași pană', async () => {
    const { deps, sendOne } = pregateste({ status: (to) => (to === 'om1@exemplu.ro' ? 500 : 200) });
    await anunt(TRIMITERE, deps);
    expect(sendOne.mock.calls.filter((c) => c[0].to === 'om1@exemplu.ro')).toHaveLength(1);
  });

  it('un eșec nu oprește restul listei și rămâne în jurnal cu motivul', async () => {
    const { deps, jurnal } = pregateste({ status: (to) => (to === 'om1@exemplu.ro' ? 422 : 200) });
    const r = await anunt(TRIMITERE, deps);
    expect(r.body).toMatchObject({ sent: 2, failed: 1 });
    expect(jurnal.flat().find((e) => e.email === 'om1@exemplu.ro')).toMatchObject({
      ok: false,
      provider_status: 422,
      eroare: '{"message":"eroare 422"}',
    });
  });
});

describe('trimiterea — jurnalul', () => {
  it('un rând per destinatar, cu modul, audiența, șablonul și ediția', async () => {
    const { deps, jurnal } = pregateste();
    await anunt(TRIMITERE, deps);
    const randuri = jurnal.flat();
    expect(randuri.map((e) => e.email)).toEqual(['om1@exemplu.ro', 'om2@exemplu.ro', 'om3@exemplu.ro']);
    for (const e of randuri) {
      expect(e).toMatchObject({
        mod: 'anunt',
        audienta: 'istoric',
        sablon: 'bulk_participant_anunt',
        editie: 7,
        ok: true,
        subiect: 'Ne vedem din nou? Hyrox Trial',
      });
    }
  });

  it('o cheie de șablon necunoscută nu ajunge în jurnal', async () => {
    const { deps, jurnal } = pregateste();
    await anunt({ ...TRIMITERE, sablon: 'altceva' }, deps);
    expect(jurnal.flat().every((e) => e.sablon === undefined)).toBe(true);
  });

  it(`se scrie pe parcurs, câte ${LOT_JURNAL}, nu doar la final`, async () => {
    const lista = Array.from({ length: 2 * LOT_JURNAL + 3 }, (_, i) => om(i));
    const { deps, jurnal } = pregateste({ destinatari: lista });
    await anunt(TRIMITERE, deps);
    expect(jurnal.map((lot) => lot.length)).toEqual([LOT_JURNAL, LOT_JURNAL, 3]);
    expect(new Set(jurnal.flat().map((e) => e.email)).size).toBe(lista.length);
  });

  /**
   * Regresia reparată în 142620a: zăvorul e consumat înainte de buclă. Dacă
   * invocarea moare la jumătate, doar jurnalul spune cine a primit anunțul.
   */
  it('dacă invocarea moare la jumătate, primii trimiși sunt deja în jurnal', async () => {
    const lista = Array.from({ length: LOT_JURNAL + 5 }, (_, i) => om(i));
    const { deps, jurnal, sendOne } = pregateste({ destinatari: lista });
    sendOne.mockImplementation(async (m) => {
      if (m.to === `om${LOT_JURNAL + 2}@exemplu.ro`) throw new Error('timeout Edge');
      return { ok: true, status: 200, body: '' };
    });
    await expect(anunt(TRIMITERE, deps)).rejects.toThrow('timeout Edge');
    expect(jurnal.flat()).toHaveLength(LOT_JURNAL);
  });
});

describe('rejoacaAnunt — un eșec, doar pentru persoana lui', () => {
  const plan = {
    ok: true,
    motiv: null,
    email: 'om1@exemplu.ro',
    nume: 'Prenume1 Nume1',
    subiect: 'Ne vedem din nou? Hyrox Trial',
    text_email: 'Salut, Prenume1!',
    token_unsub: 'tok-acum',
    editie: 7,
  };

  const cuLookup = (rezultat: unknown) => {
    const p = pregateste();
    p.rpc.mockImplementation(async (fn: string) =>
      fn === 'admin_replay_anunt_lookup' ? rezultat : null
    );
    return p;
  };

  it('retrimite textul din jurnal, cu tokenul de dezabonare de ACUM', async () => {
    const { deps, sendOne, jurnal } = cuLookup([plan]);
    const r = await rejoacaAnunt('admin', 'log-1', deps);
    expect(r).toEqual({ status: 200, body: { sent: 1, failed: 0, mod: 'anunt' } });
    expect(sendOne).toHaveBeenCalledTimes(1);
    const [m, , pagina, api] = sendOne.mock.calls[0];
    expect(m).toEqual({ to: 'om1@exemplu.ro', subject: plan.subiect, text: plan.text_email });
    expect(pagina).toContain('token=tok-acum');
    expect(api).toContain('token=tok-acum');
    expect(jurnal.flat()).toEqual([expect.objectContaining({ mod: 'anunt', ok: true, editie: 7 })]);
  });

  it('refuzul serverului (ex. s-a dezabonat) nu trimite și spune motivul', async () => {
    const { deps, sendOne } = cuLookup([{ ...plan, ok: false, motiv: 'dezabonat' }]);
    const r = await rejoacaAnunt('admin', 'log-1', deps);
    expect(r).toEqual({ status: 409, body: { error: 'not_replayable', motiv: 'dezabonat' } });
    expect(sendOne).not.toHaveBeenCalled();
  });

  it('căutarea eșuată e o eroare, nu o trimitere', async () => {
    const { deps, sendOne } = cuLookup(null);
    expect((await rejoacaAnunt('admin', 'log-1', deps)).status).toBe(500);
    expect(sendOne).not.toHaveBeenCalled();
  });
});
