// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  submitLaunchNotification,
  submitRegistration,
  submitWaitlist,
  sendConfirmationEmail,
  fetchStats,
  confirmSignup,
  isDuplicateError,
  isTimeoutError,
  isAbortError,
  isWaitlistFullError,
  isBotRejectedError,
  SubmitHttpError,
  SUBMIT_TIMEOUT_MS,
} from '../../src/lib/supabase';
import { HttpResponse } from 'msw';
import { server, withExpectedUnhandledRequest } from '../support/vitest.setup';
import { functionHandler, responseHandler } from '../support/handlers';
import { SUPABASE } from '../../src/lib/backend';
import type { AntiBot } from '../../src/lib/supabase';

const draft = {
  nume: '  Popescu  ',
  prenume: ' Andrei ',
  email: '  Andrei@Email.RO ',
  telefon: '069 123 456',
};

/** Dovezile anti-bot pe care le colectează hook-urile înainte de submit. */
const proofs: AntiBot = { token: 'tok-turnstile', hp: '', elapsed: 9000 };

let requests: Request[] = [];
const record = ({ request }: { request: Request }) => { requests.push(request.clone()); };

beforeEach(() => {
  requests = [];
  server.events.on('request:start', record);
});

afterEach(() => {
  server.events.removeListener('request:start', record);
  vi.useRealTimers();
});

/** Plicul trimis către submit-form: { mode, token, hp, elapsed, data }. */
const plic = async () => await requests[0].clone().json();
const date = async () => (await plic()).data;
const respondOnce = (response: Response) => server.use(responseHandler(response));

describe('ruta submit-form (poarta anti-bot)', () => {
  it('toate cele trei formulare trec prin funcția Edge, nu direct prin PostgREST', async () => {
    // Miezul protecției: dacă vreun formular scrie iar direct în PostgREST,
    // captcha devine decorativ — cheia publishable e vizibilă în bundle, deci
    // un bot ar putea insera fără să deschidă vreodată pagina.
    for (const call of [
      () => submitRegistration(regData, proofs),
      () => submitWaitlist(regData, proofs),
      () => submitLaunchNotification(draft, proofs),
    ]) {
      requests = [];
      await call();
      expect(requests[0].url).toMatch(/\/functions\/v1\/submit-form$/);
    }
  });

  it('trimite dovezile anti-bot la fiecare submit', async () => {
    for (const call of [
      () => submitRegistration(regData, proofs),
      () => submitWaitlist(regData, proofs),
      () => submitLaunchNotification(draft, proofs),
    ]) {
      requests = [];
      await call();
      expect(await plic()).toMatchObject({ token: 'tok-turnstile', hp: '', elapsed: 9000 });
    }
  });

  it('marchează corect modul, ca serverul să știe în ce tabelă scrie', async () => {
    const asteptat = [
      ['registration', () => submitRegistration(regData, proofs)],
      ['waitlist', () => submitWaitlist(regData, proofs)],
      ['launch', () => submitLaunchNotification(draft, proofs)],
    ] as const;
    for (const [mode, call] of asteptat) {
      requests = [];
      await call();
      expect((await plic()).mode).toBe(mode);
    }
  });

  it('NU trimite niciodată ediția — o decide serverul din app_config', async () => {
    // `editie` are DEFAULT `current_event_edition()`/`current_launch_edition()`.
    // Dacă ar veni din client, un bot ar putea scrie în edițiile de arhivă.
    for (const call of [
      () => submitRegistration(regData, proofs),
      () => submitWaitlist(regData, proofs),
      () => submitLaunchNotification(draft, proofs),
    ]) {
      requests = [];
      await call();
      expect(await date()).not.toHaveProperty('editie');
      expect(await plic()).not.toHaveProperty('editie');
    }
  });

  it('folosește cheia publicabilă, nu una secretă', async () => {
    await submitLaunchNotification(draft, proofs);
    const headers = Object.fromEntries(requests[0].headers);
    expect(headers.apikey).toMatch(/^sb_publishable_/);
    expect(headers['content-type']).toBe('application/json');
  });
});

describe('submitLaunchNotification', () => {
  it('curăță spațiile și normalizează telefonul', async () => {
    await submitLaunchNotification(draft, proofs);
    expect(await date()).toMatchObject({
      nume: 'Popescu',
      prenume: 'Andrei',
      email: 'Andrei@Email.RO',
      telefon: '069123456',
    });
  });

  it('trimite sursa "lansare" implicit', async () => {
    await submitLaunchNotification(draft, proofs);
    expect((await date()).sursa).toBe('lansare');
  });

  it('trimite sursa "despre-noi" când e cerută explicit', async () => {
    await submitLaunchNotification(draft, proofs, undefined, 'despre-noi');
    expect((await date()).sursa).toBe('despre-noi');
  });

  it('trimite doar surse acceptate de constraint-ul din baza de date', async () => {
    for (const sursa of ['lansare', 'despre-noi'] as const) {
      requests = [];
      await submitLaunchNotification(draft, proofs, undefined, sursa);
      expect(['lansare', 'despre-noi']).toContain((await date()).sursa);
    }
  });

  it('aruncă SubmitHttpError cu statusul primit', async () => {
    respondOnce(new Response('boom', { status: 500 }));
    await expect(submitLaunchNotification(draft, proofs)).rejects.toBeInstanceOf(SubmitHttpError);
  });

  it('duplicatul (409) e recunoscut', async () => {
    respondOnce(new Response('{}', { status: 409 }));
    const err = await submitLaunchNotification(draft, proofs).catch((e) => e);
    expect(isDuplicateError(err)).toBe(true);
  });
});

const regData = {
  nume: '  Filip  ',
  prenume: '  Vladislav ',
  telefon: '069 509 949',
  email: '  Vlad@Email.RO ',
  dataNasterii: '1994-10-18',
  acord: true,
};

describe('submitRegistration (înscriere la eveniment)', () => {
  it('curăță spațiile, normalizează telefonul și păstrează data nașterii', async () => {
    await submitRegistration(regData, proofs);
    expect(await date()).toMatchObject({
      nume: 'Vladislav Filip',
      telefon: '069509949',
      email: 'Vlad@Email.RO',
      dataNasterii: '1994-10-18',
      acord: true,
    });
  });

  it('întoarce id-ul generat de server (pentru emailul de confirmare)', async () => {
    // `Prefer: return=minimal` nu întoarce rândul, deci id-ul vine din corpul
    // răspunsului funcției Edge, care l-a generat înainte de insert.
    respondOnce(
      new Response(JSON.stringify({ ok: true, id: 'ffff-1234' }), { status: 200 })
    );
    await expect(submitRegistration(regData, proofs)).resolves.toBe('ffff-1234');
  });

  it('un răspuns fără id nu aruncă — înscrierea a reușit oricum', async () => {
    respondOnce(new Response('{"ok":true}', { status: 200 }));
    await expect(submitRegistration(regData, proofs)).resolves.toBe('');
  });

  it('duplicatul (409) e recunoscut', async () => {
    respondOnce(new Response('{}', { status: 409 }));
    const err = await submitRegistration(regData, proofs).catch((e) => e);
    expect(isDuplicateError(err)).toBe(true);
  });

  it('erorile trigger-elor guard trec neschimbate prin funcția Edge', async () => {
    // `submit-form` propagă statusul + textul PostgREST ca atare, tocmai ca
    // fluxul din UI (comutarea pe waitlist la „event_full") să rămână valid.
    respondOnce(new Response('{"message":"event_full"}', { status: 400 }));
    const err = await submitRegistration(regData, proofs).catch((e) => e);
    expect(err).toBeInstanceOf(SubmitHttpError);
    expect((err as SubmitHttpError).message).toContain('event_full');
  });
});

describe('submitWaitlist (lista de așteptare)', () => {
  it('curăță datele la fel ca înscrierea normală', async () => {
    // Aceleași reguli ca la registrations — altfel același om apare cu date
    // scrise diferit în cele două tabele.
    await submitWaitlist(regData, proofs);
    expect(await date()).toMatchObject({
      nume: 'Vladislav Filip',
      telefon: '069509949',
      email: 'Vlad@Email.RO',
      dataNasterii: '1994-10-18',
      acord: true,
    });
  });

  it('data_nasterii lipsă devine string gol (serverul o face null)', async () => {
    await submitWaitlist({ ...regData, dataNasterii: '' }, proofs);
    expect((await date()).dataNasterii).toBe('');
  });

  it('lista plină (trigger waitlist_full) e recunoscută distinct de alte erori', async () => {
    // Fluxul din UI depinde de asta: la „waitlist_full" arată un mesaj special
    // și reîmprospătează locurile, în loc să afișeze eroarea generică.
    respondOnce(
      new Response('{"message":"waitlist_full"}', { status: 400 })
    );
    const err = await submitWaitlist(regData, proofs).catch((e) => e);
    expect(isWaitlistFullError(err)).toBe(true);
    expect(isDuplicateError(err)).toBe(false);
  });

  it('o eroare oarecare NU e confundată cu lista plină', async () => {
    respondOnce(new Response('boom', { status: 500 }));
    const err = await submitWaitlist(regData, proofs).catch((e) => e);
    expect(isWaitlistFullError(err)).toBe(false);
  });

  it('duplicatul (409) e recunoscut', async () => {
    respondOnce(new Response('{}', { status: 409 }));
    const err = await submitWaitlist(regData, proofs).catch((e) => e);
    expect(isDuplicateError(err)).toBe(true);
  });
});

describe('isWaitlistFullError', () => {
  it('cere ambele condiții: SubmitHttpError ȘI mesajul triggerului', () => {
    expect(isWaitlistFullError(new SubmitHttpError(400, 'waitlist_full'))).toBe(true);
    expect(isWaitlistFullError(new SubmitHttpError(400, 'altceva'))).toBe(false);
    expect(isWaitlistFullError(new Error('waitlist_full'))).toBe(false);
    expect(isWaitlistFullError(null)).toBe(false);
    expect(isWaitlistFullError(undefined)).toBe(false);
  });
});

describe('isBotRejectedError', () => {
  it('recunoaște cele trei verdicte anti-bot ale serverului', () => {
    expect(isBotRejectedError(new SubmitHttpError(403, '{"error":"captcha_failed"}'))).toBe(true);
    expect(isBotRejectedError(new SubmitHttpError(400, '{"error":"bot"}'))).toBe(true);
    expect(isBotRejectedError(new SubmitHttpError(400, '{"error":"too_fast"}'))).toBe(true);
  });

  it('nu confundă alte erori cu o respingere anti-bot', () => {
    // Altfel un 500 banal ar afișa „reîncarcă pagina", iar omul ar renunța.
    expect(isBotRejectedError(new SubmitHttpError(409, '{}'))).toBe(false);
    expect(isBotRejectedError(new SubmitHttpError(400, '{"message":"event_full"}'))).toBe(false);
    expect(isBotRejectedError(new SubmitHttpError(500, 'boom'))).toBe(false);
    expect(isBotRejectedError(new Error('captcha_failed'))).toBe(false);
    expect(isBotRejectedError(null)).toBe(false);
  });
});

describe('timeout și anulare', () => {
  /** MSW keeps the request pending until the actual AbortSignal cancels fetch. */
  const fetchCareAtarna = () => server.use(functionHandler('submit-form', () =>
    new Promise<Response>(() => {})
  ));

  it('după SUBMIT_TIMEOUT_MS cererea e abandonată cu TimeoutError', async () => {
    // Fără asta, un server care nu răspunde ar lăsa formularul blocat pe
    // „Se trimite…" la nesfârșit.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    fetchCareAtarna();
    const rezultat = submitRegistration(regData, proofs).catch((e) => e);
    await vi.advanceTimersByTimeAsync(SUBMIT_TIMEOUT_MS);
    const err = await rezultat;
    expect(isTimeoutError(err)).toBe(true);
    expect(isAbortError(err)).toBe(false);
  });

  it('nu expiră înainte de termen', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    fetchCareAtarna();
    let gata = false;
    const rezultat = submitRegistration(regData, proofs).catch((e) => e).then((v) => {
      gata = true;
      return v;
    });
    await vi.advanceTimersByTimeAsync(SUBMIT_TIMEOUT_MS - 1000);
    expect(gata).toBe(false);
    await vi.advanceTimersByTimeAsync(1000);
    expect(isTimeoutError(await rezultat)).toBe(true);
  });

  it('semnalul extern (unmount) anulează cererea cu AbortError', async () => {
    fetchCareAtarna();
    const controller = new AbortController();
    const rezultat = submitRegistration(regData, proofs, controller.signal).catch((e) => e);
    controller.abort(new DOMException('unmount', 'AbortError'));
    const err = await rezultat;
    expect(isAbortError(err)).toBe(true);
    expect(isTimeoutError(err)).toBe(false);
  });

  it('un semnal deja anulat oprește cererea imediat', async () => {
    fetchCareAtarna();
    const controller = new AbortController();
    controller.abort(new DOMException('deja', 'AbortError'));
    const err = await submitLaunchNotification(draft, proofs, controller.signal).catch((e) => e);
    expect(isAbortError(err)).toBe(true);
  });

  it('cronometrul se oprește după un răspuns reușit (fără timere scăpate)', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    await submitRegistration(regData, proofs);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cronometrul se oprește și când serverul dă eroare', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    respondOnce(new Response('boom', { status: 500 }));
    await submitRegistration(regData, proofs).catch(() => {});
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('sendConfirmationEmail', () => {
  // Rămâne folosit din backoffice (înscriere adăugată manual + retrimitere);
  // fluxul public trimite emailul din funcția Edge, imediat după insert.
  it('apelează edge function-ul cu modul "confirm" și id-ul înscrierii', async () => {
    await sendConfirmationEmail('abc-123');
    expect(requests[0].url).toMatch(/\/functions\/v1\/send-email$/);
    expect(await plic()).toEqual({ mode: 'confirm', id: 'abc-123' });
  });

  it('nu face niciun request pentru id gol', async () => {
    await sendConfirmationEmail('');
    expect(requests).toHaveLength(0);
  });

  it('înghite erorile — emailul nu trebuie să rupă înscrierea', async () => {
    respondOnce(HttpResponse.error());
    await expect(sendConfirmationEmail('abc-123')).resolves.toBeUndefined();
  });
});

describe('fetchStats (statistici publice)', () => {
  it('citește RPC-ul public_stats și întoarce JSON-ul', async () => {
    const payload = { count: 2, participants: [{ nume: 'Vlad F.', echipa: '' }], waitlist: 0 };
    respondOnce(
      new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } })
    );
    const stats = await fetchStats();
    expect(requests[0].url).toMatch(/\/rest\/v1\/rpc\/public_stats$/);
    expect(stats).toEqual(payload);
  });

  it('folosește cheia publicabilă, nu una secretă', async () => {
    respondOnce(
      new Response(JSON.stringify({ count: 0, participants: [], waitlist: 0 }), { status: 200 })
    );
    await fetchStats();
    const headers = Object.fromEntries(requests[0].headers);
    expect(headers.apikey).toMatch(/^sb_publishable_/);
  });

  it('aruncă SubmitHttpError când serverul răspunde cu eroare', async () => {
    respondOnce(new Response('boom', { status: 500 }));
    await expect(fetchStats()).rejects.toBeInstanceOf(SubmitHttpError);
  });
});

describe('confirmSignup (confirmarea din linkul de email)', () => {
  it('trimite token-ul către RPC-ul confirm_signup', async () => {
    respondOnce(new Response(JSON.stringify('confirmat'), { status: 200 }));
    await confirmSignup('tok-123');
    expect(requests[0].url).toMatch(/\/rest\/v1\/rpc\/confirm_signup$/);
    expect(await plic()).toEqual({ p_token: 'tok-123' });
  });

  it('întoarce „confirmat" și „deja_confirmat" ca atare', async () => {
    for (const val of ['confirmat', 'deja_confirmat'] as const) {
      respondOnce(new Response(JSON.stringify(val), { status: 200 }));
      await expect(confirmSignup('tok')).resolves.toBe(val);
    }
  });

  it('orice altă valoare devine „invalid" (token necunoscut/expirat)', async () => {
    respondOnce(new Response(JSON.stringify('altceva'), { status: 200 }));
    await expect(confirmSignup('tok')).resolves.toBe('invalid');
  });

  it('aruncă SubmitHttpError la eroare de server', async () => {
    respondOnce(new Response('boom', { status: 500 }));
    await expect(confirmSignup('tok')).rejects.toBeInstanceOf(SubmitHttpError);
  });
});

describe('shared mocks', () => {
  it('respinge un RPC fără handler și numește URL-ul în diagnostic', async () => {
    const diagnostic = vi.spyOn(console, 'error').mockImplementation(() => {});
    const url = `${SUPABASE.url}/rest/v1/rpc/unmocked_rpc`;
    await withExpectedUnhandledRequest(url, () => expect(fetch(url, { method: 'POST' })).rejects.toThrow());
    expect(diagnostic.mock.calls.flat().join(' ')).toContain(url);
  });
});

describe('clasificarea erorilor', () => {
  it('distinge duplicat, timeout și abort', () => {
    expect(isDuplicateError(new SubmitHttpError(409, ''))).toBe(true);
    expect(isDuplicateError(new SubmitHttpError(500, ''))).toBe(false);

    expect(isTimeoutError(new DOMException('timeout', 'TimeoutError'))).toBe(true);
    expect(isTimeoutError(new DOMException('abort', 'AbortError'))).toBe(false);

    expect(isAbortError(new DOMException('abort', 'AbortError'))).toBe(true);
    expect(isAbortError(new Error('altceva'))).toBe(false);
  });
});
