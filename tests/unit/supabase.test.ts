import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  submitLaunchNotification,
  submitRegistration,
  submitWaitlist,
  sendConfirmationEmail,
  sendInfoEmail,
  fetchStats,
  confirmSignup,
  isDuplicateError,
  isTimeoutError,
  isAbortError,
  isWaitlistFullError,
  SubmitHttpError,
  SUBMIT_TIMEOUT_MS,
} from '../../src/lib/supabase';

const draft = {
  nume: '  Popescu  ',
  prenume: ' Andrei ',
  email: '  Andrei@Email.RO ',
  telefon: '069 123 456',
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async () => new Response('', { status: 201 }));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const ultimulBody = () => JSON.parse(fetchMock.mock.calls[0][1].body as string);

describe('submitLaunchNotification', () => {
  it('trimite către tabela corectă', async () => {
    await submitLaunchNotification(draft);
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/rest\/v1\/launch_notifications$/);
  });

  it('curăță spațiile și normalizează telefonul', async () => {
    await submitLaunchNotification(draft);
    expect(ultimulBody()).toMatchObject({
      nume: 'Popescu',
      prenume: 'Andrei',
      email: 'Andrei@Email.RO',
      telefon: '069123456',
    });
  });

  it('NU trimite niciodată ediția — o pune serverul', async () => {
    // Dacă cineva adaugă `editie` în payload, politica RLS respinge insert-ul
    // și formularul se rupe în producție. Testul blochează regresia.
    await submitLaunchNotification(draft);
    expect(ultimulBody()).not.toHaveProperty('editie');
  });

  it('trimite sursa "lansare" implicit', async () => {
    await submitLaunchNotification(draft);
    expect(ultimulBody().sursa).toBe('lansare');
  });

  it('trimite sursa "despre-noi" când e cerută explicit', async () => {
    await submitLaunchNotification(draft, undefined, 'despre-noi');
    expect(ultimulBody().sursa).toBe('despre-noi');
  });

  it('trimite doar surse acceptate de constraint-ul din baza de date', async () => {
    for (const sursa of ['lansare', 'despre-noi'] as const) {
      fetchMock.mockClear();
      await submitLaunchNotification(draft, undefined, sursa);
      expect(['lansare', 'despre-noi']).toContain(ultimulBody().sursa);
    }
  });

  it('folosește cheia publicabilă, nu una secretă', async () => {
    await submitLaunchNotification(draft);
    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>;
    expect(headers.apikey).toMatch(/^sb_publishable_/);
  });

  it('aruncă SubmitHttpError cu statusul primit', async () => {
    fetchMock.mockResolvedValueOnce(new Response('boom', { status: 500 }));
    await expect(submitLaunchNotification(draft)).rejects.toBeInstanceOf(SubmitHttpError);
  });

  it('duplicatul (409) e recunoscut', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 409 }));
    await submitLaunchNotification(draft).catch((err) => {
      expect(isDuplicateError(err)).toBe(true);
    });
    expect.assertions(1);
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
  it('trimite către tabela registrations', async () => {
    await submitRegistration(regData);
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/rest\/v1\/registrations$/);
  });

  it('NU trimite niciodată ediția — o pune serverul', async () => {
    // Înainte, clientul trimitea `editie` din constanta compilată. De când
    // configul se publică fără deploy, un tab vechi ar scrie în ediția greșită.
    // Acum coloana vine din DEFAULT (`current_event_edition()`), iar politica
    // RLS respinge orice valoare venită din client.
    await submitRegistration(regData);
    expect(ultimulBody()).not.toHaveProperty('editie');
  });

  it('curăță spațiile, normalizează telefonul și păstrează data nașterii', async () => {
    await submitRegistration(regData);
    expect(ultimulBody()).toMatchObject({
      nume: 'Vladislav Filip',
      telefon: '069509949',
      email: 'Vlad@Email.RO',
      data_nasterii: '1994-10-18',
      acord: true,
    });
  });

  it('generează un id în client (pentru emailul de confirmare) și îl întoarce', async () => {
    const id = await submitRegistration(regData);
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(ultimulBody().id).toBe(id);
  });

  it('data_nasterii lipsă devine null, nu string gol', async () => {
    await submitRegistration({ ...regData, dataNasterii: '' });
    expect(ultimulBody().data_nasterii).toBeNull();
  });

  it('duplicatul (409) e recunoscut', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 409 }));
    await submitRegistration(regData).catch((err) => {
      expect(isDuplicateError(err)).toBe(true);
    });
    expect.assertions(1);
  });
});

describe('submitWaitlist (lista de așteptare)', () => {
  it('trimite către event_waitlist, fără ediție', async () => {
    await submitWaitlist(regData);
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/rest\/v1\/event_waitlist$/);
    // Ca la registrations: ediția o pune serverul, nu bundle-ul.
    expect(ultimulBody()).not.toHaveProperty('editie');
  });

  it('curăță datele la fel ca înscrierea normală', async () => {
    // Aceleași reguli ca la registrations — altfel același om apare cu date
    // scrise diferit în cele două tabele.
    await submitWaitlist(regData);
    expect(ultimulBody()).toMatchObject({
      nume: 'Vladislav Filip',
      telefon: '069509949',
      email: 'Vlad@Email.RO',
      data_nasterii: '1994-10-18',
      acord: true,
    });
  });

  it('data_nasterii lipsă devine null', async () => {
    await submitWaitlist({ ...regData, dataNasterii: '' });
    expect(ultimulBody().data_nasterii).toBeNull();
  });

  it('lista plină (trigger waitlist_full) e recunoscută distinct de alte erori', async () => {
    // Fluxul din UI depinde de asta: la „waitlist_full" arată un mesaj special
    // și reîmprospătează locurile, în loc să afișeze eroarea generică.
    fetchMock.mockResolvedValueOnce(
      new Response('{"message":"waitlist_full"}', { status: 400 })
    );
    const err = await submitWaitlist(regData).catch((e) => e);
    expect(isWaitlistFullError(err)).toBe(true);
    expect(isDuplicateError(err)).toBe(false);
  });

  it('o eroare oarecare NU e confundată cu lista plină', async () => {
    fetchMock.mockResolvedValueOnce(new Response('boom', { status: 500 }));
    const err = await submitWaitlist(regData).catch((e) => e);
    expect(isWaitlistFullError(err)).toBe(false);
  });

  it('duplicatul (409) e recunoscut', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 409 }));
    const err = await submitWaitlist(regData).catch((e) => e);
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
    const rezultat = submitRegistration(regData).catch((e) => e);
    await vi.advanceTimersByTimeAsync(SUBMIT_TIMEOUT_MS);
    const err = await rezultat;
    expect(isTimeoutError(err)).toBe(true);
    expect(isAbortError(err)).toBe(false);
  });

  it('nu expiră înainte de termen', async () => {
    vi.useFakeTimers();
    fetchCareAtarna();
    let gata = false;
    const rezultat = submitRegistration(regData).catch((e) => e).then((v) => {
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
    const rezultat = submitRegistration(regData, controller.signal).catch((e) => e);
    controller.abort(new DOMException('unmount', 'AbortError'));
    const err = await rezultat;
    expect(isAbortError(err)).toBe(true);
    expect(isTimeoutError(err)).toBe(false);
  });

  it('un semnal deja anulat oprește cererea imediat', async () => {
    fetchCareAtarna();
    const controller = new AbortController();
    controller.abort(new DOMException('deja', 'AbortError'));
    const err = await submitLaunchNotification(draft, controller.signal).catch((e) => e);
    expect(isAbortError(err)).toBe(true);
  });

  it('cronometrul se oprește după un răspuns reușit (fără timere scăpate)', async () => {
    vi.useFakeTimers();
    await submitRegistration(regData);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cronometrul se oprește și când serverul dă eroare', async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValueOnce(new Response('boom', { status: 500 }));
    await submitRegistration(regData).catch(() => {});
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('antetele cererilor de scriere', () => {
  it('cer „return=minimal" — RLS nu permite citirea rândului înapoi', async () => {
    // Fără Prefer: return=minimal, PostgREST încearcă să întoarcă rândul
    // inserat, iar politica de select îl respinge → insert-ul pare eșuat.
    for (const call of [
      () => submitRegistration(regData),
      () => submitWaitlist(regData),
      () => submitLaunchNotification(draft),
    ]) {
      fetchMock.mockClear();
      await call();
      const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>;
      expect(headers.Prefer).toBe('return=minimal');
      expect(headers['Content-Type']).toBe('application/json');
    }
  });
});

describe('sendConfirmationEmail', () => {
  it('apelează edge function-ul cu modul "confirm" și id-ul înscrierii', async () => {
    await sendConfirmationEmail('abc-123');
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/functions\/v1\/send-email$/);
    expect(ultimulBody()).toEqual({ mode: 'confirm', id: 'abc-123' });
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

describe('sendInfoEmail', () => {
  it('apelează edge function-ul cu modul "info"', async () => {
    await sendInfoEmail('andrei@email.ro');
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/functions\/v1\/send-email$/);
    expect(ultimulBody()).toEqual({ mode: 'info', email: 'andrei@email.ro' });
  });

  it('nu face niciun request pentru email gol', async () => {
    await sendInfoEmail('');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('înghite erorile — emailul nu trebuie să rupă înscrierea', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network down'));
    await expect(sendInfoEmail('andrei@email.ro')).resolves.toBeUndefined();
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
    expect(ultimulBody()).toEqual({ p_token: 'tok-123' });
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
