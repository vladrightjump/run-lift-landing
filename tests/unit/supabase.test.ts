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
import type { AntiBot } from '../../src/lib/supabase';

const draft = {
  nume: '  Popescu  ',
  prenume: ' Andrei ',
  email: '  Andrei@Email.RO ',
  telefon: '069 123 456',
};

/** Dovezile anti-bot pe care le colectează hook-urile înainte de submit. */
const proofs: AntiBot = { token: 'tok-turnstile', hp: '', elapsed: 9000 };

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/** Plicul trimis către `submit-form`: { mode, token, hp, elapsed, data }. */
const plic = () => JSON.parse(fetchMock.mock.calls[0][1].body as string);
/** Doar câmpurile formularului din plic. */
const date = () => plic().data;

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
      fetchMock.mockClear();
      await call();
      expect(fetchMock.mock.calls[0][0]).toMatch(/\/functions\/v1\/submit-form$/);
    }
  });

  it('trimite dovezile anti-bot la fiecare submit', async () => {
    for (const call of [
      () => submitRegistration(regData, proofs),
      () => submitWaitlist(regData, proofs),
      () => submitLaunchNotification(draft, proofs),
    ]) {
      fetchMock.mockClear();
      await call();
      expect(plic()).toMatchObject({ token: 'tok-turnstile', hp: '', elapsed: 9000 });
    }
  });

  it('marchează corect modul, ca serverul să știe în ce tabelă scrie', async () => {
    const asteptat = [
      ['registration', () => submitRegistration(regData, proofs)],
      ['waitlist', () => submitWaitlist(regData, proofs)],
      ['launch', () => submitLaunchNotification(draft, proofs)],
    ] as const;
    for (const [mode, call] of asteptat) {
      fetchMock.mockClear();
      await call();
      expect(plic().mode).toBe(mode);
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
      fetchMock.mockClear();
      await call();
      expect(date()).not.toHaveProperty('editie');
      expect(plic()).not.toHaveProperty('editie');
    }
  });

  it('folosește cheia publicabilă, nu una secretă', async () => {
    await submitLaunchNotification(draft, proofs);
    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>;
    expect(headers.apikey).toMatch(/^sb_publishable_/);
    expect(headers['Content-Type']).toBe('application/json');
  });
});

describe('submitLaunchNotification', () => {
  it('curăță spațiile și normalizează telefonul', async () => {
    await submitLaunchNotification(draft, proofs);
    expect(date()).toMatchObject({
      nume: 'Popescu',
      prenume: 'Andrei',
      email: 'Andrei@Email.RO',
      telefon: '069123456',
    });
  });

  it('trimite sursa "lansare" implicit', async () => {
    await submitLaunchNotification(draft, proofs);
    expect(date().sursa).toBe('lansare');
  });

  it('trimite sursa "despre-noi" când e cerută explicit', async () => {
    await submitLaunchNotification(draft, proofs, undefined, 'despre-noi');
    expect(date().sursa).toBe('despre-noi');
  });

  it('trimite doar surse acceptate de constraint-ul din baza de date', async () => {
    for (const sursa of ['lansare', 'despre-noi'] as const) {
      fetchMock.mockClear();
      await submitLaunchNotification(draft, proofs, undefined, sursa);
      expect(['lansare', 'despre-noi']).toContain(date().sursa);
    }
  });

  it('aruncă SubmitHttpError cu statusul primit', async () => {
    fetchMock.mockResolvedValueOnce(new Response('boom', { status: 500 }));
    await expect(submitLaunchNotification(draft, proofs)).rejects.toBeInstanceOf(SubmitHttpError);
  });

  it('duplicatul (409) e recunoscut', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 409 }));
    const err = await submitLaunchNotification(draft, proofs).catch((e) => e);
    expect(isDuplicateError(err)).toBe(true);
  });
});

const regData = {
  nume: '  Vladislav Filip  ',
  telefon: '069 509 949',
  email: '  Vlad@Email.RO ',
  dataNasterii: '1994-10-18',
  acord: true,
};

describe('submitRegistration (înscriere la eveniment)', () => {
  it('curăță spațiile, normalizează telefonul și păstrează data nașterii', async () => {
    await submitRegistration(regData, proofs);
    expect(date()).toMatchObject({
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
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, id: 'ffff-1234' }), { status: 200 })
    );
    await expect(submitRegistration(regData, proofs)).resolves.toBe('ffff-1234');
  });

  it('un răspuns fără id nu aruncă — înscrierea a reușit oricum', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{"ok":true}', { status: 200 }));
    await expect(submitRegistration(regData, proofs)).resolves.toBe('');
  });

  it('duplicatul (409) e recunoscut', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 409 }));
    const err = await submitRegistration(regData, proofs).catch((e) => e);
    expect(isDuplicateError(err)).toBe(true);
  });

  it('erorile trigger-elor guard trec neschimbate prin funcția Edge', async () => {
    // `submit-form` propagă statusul + textul PostgREST ca atare, tocmai ca
    // fluxul din UI (comutarea pe waitlist la „event_full") să rămână valid.
    fetchMock.mockResolvedValueOnce(new Response('{"message":"event_full"}', { status: 400 }));
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
    expect(date()).toMatchObject({
      nume: 'Vladislav Filip',
      telefon: '069509949',
      email: 'Vlad@Email.RO',
      dataNasterii: '1994-10-18',
      acord: true,
    });
  });

  it('data_nasterii lipsă devine string gol (serverul o face null)', async () => {
    await submitWaitlist({ ...regData, dataNasterii: '' }, proofs);
    expect(date().dataNasterii).toBe('');
  });

  it('lista plină (trigger waitlist_full) e recunoscută distinct de alte erori', async () => {
    // Fluxul din UI depinde de asta: la „waitlist_full" arată un mesaj special
    // și reîmprospătează locurile, în loc să afișeze eroarea generică.
    fetchMock.mockResolvedValueOnce(
      new Response('{"message":"waitlist_full"}', { status: 400 })
    );
    const err = await submitWaitlist(regData, proofs).catch((e) => e);
    expect(isWaitlistFullError(err)).toBe(true);
    expect(isDuplicateError(err)).toBe(false);
  });

  it('o eroare oarecare NU e confundată cu lista plină', async () => {
    fetchMock.mockResolvedValueOnce(new Response('boom', { status: 500 }));
    const err = await submitWaitlist(regData, proofs).catch((e) => e);
    expect(isWaitlistFullError(err)).toBe(false);
  });

  it('duplicatul (409) e recunoscut', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 409 }));
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
  /**
   * fetch care nu răspunde niciodată singur — se termină doar prin abort.
   * Verifică întâi `signal.aborted`, exact ca `fetch`-ul real: dacă semnalul
   * e deja anulat când intră cererea, evenimentul „abort" a trecut deja și
   * un mock care doar ascultă ar rămâne suspendat pentru totdeauna.
   */
  const fetchCareAtarna = () =>
    fetchMock.mockImplementationOnce(
      (_url: string, init: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          if (init.signal.aborted) {
            reject(init.signal.reason);
            return;
          }
          init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true });
        })
    );

  it('după SUBMIT_TIMEOUT_MS cererea e abandonată cu TimeoutError', async () => {
    // Fără asta, un server care nu răspunde ar lăsa formularul blocat pe
    // „Se trimite…" la nesfârșit.
    vi.useFakeTimers();
    fetchCareAtarna();
    const rezultat = submitRegistration(regData, proofs).catch((e) => e);
    await vi.advanceTimersByTimeAsync(SUBMIT_TIMEOUT_MS);
    const err = await rezultat;
    expect(isTimeoutError(err)).toBe(true);
    expect(isAbortError(err)).toBe(false);
  });

  it('nu expiră înainte de termen', async () => {
    vi.useFakeTimers();
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
    vi.useFakeTimers();
    await submitRegistration(regData, proofs);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cronometrul se oprește și când serverul dă eroare', async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValueOnce(new Response('boom', { status: 500 }));
    await submitRegistration(regData, proofs).catch(() => {});
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('sendConfirmationEmail', () => {
  // Rămâne folosit din backoffice (înscriere adăugată manual + retrimitere);
  // fluxul public trimite emailul din funcția Edge, imediat după insert.
  it('apelează edge function-ul cu modul "confirm" și id-ul înscrierii', async () => {
    await sendConfirmationEmail('abc-123');
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/functions\/v1\/send-email$/);
    expect(plic()).toEqual({ mode: 'confirm', id: 'abc-123' });
  });

  it('nu face niciun request pentru id gol', async () => {
    await sendConfirmationEmail('');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('înghite erorile — emailul nu trebuie să rupă înscrierea', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network down'));
    await expect(sendConfirmationEmail('abc-123')).resolves.toBeUndefined();
  });
});

describe('fetchStats (statistici publice)', () => {
  it('citește RPC-ul public_stats și întoarce JSON-ul', async () => {
    const payload = { count: 2, participants: [{ nume: 'Vlad F.', echipa: '' }], waitlist: 0 };
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } })
    );
    const stats = await fetchStats();
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/rest\/v1\/rpc\/public_stats$/);
    expect(stats).toEqual(payload);
  });

  it('folosește cheia publicabilă, nu una secretă', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ count: 0, participants: [], waitlist: 0 }), { status: 200 })
    );
    await fetchStats();
    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>;
    expect(headers.apikey).toMatch(/^sb_publishable_/);
  });

  it('aruncă SubmitHttpError când serverul răspunde cu eroare', async () => {
    fetchMock.mockResolvedValueOnce(new Response('boom', { status: 500 }));
    await expect(fetchStats()).rejects.toBeInstanceOf(SubmitHttpError);
  });
});

describe('confirmSignup (confirmarea din linkul de email)', () => {
  it('trimite token-ul către RPC-ul confirm_signup', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify('confirmat'), { status: 200 }));
    await confirmSignup('tok-123');
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/rest\/v1\/rpc\/confirm_signup$/);
    expect(plic()).toEqual({ p_token: 'tok-123' });
  });

  it('întoarce „confirmat" și „deja_confirmat" ca atare', async () => {
    for (const val of ['confirmat', 'deja_confirmat'] as const) {
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(val), { status: 200 }));
      await expect(confirmSignup('tok')).resolves.toBe(val);
    }
  });

  it('orice altă valoare devine „invalid" (token necunoscut/expirat)', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify('altceva'), { status: 200 }));
    await expect(confirmSignup('tok')).resolves.toBe('invalid');
  });

  it('aruncă SubmitHttpError la eroare de server', async () => {
    fetchMock.mockResolvedValueOnce(new Response('boom', { status: 500 }));
    await expect(confirmSignup('tok')).rejects.toBeInstanceOf(SubmitHttpError);
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
