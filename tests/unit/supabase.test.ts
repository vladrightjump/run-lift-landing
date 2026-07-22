import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  submitLaunchNotification,
  submitRegistration,
  submitWaitlist,
  sendConfirmationEmail,
  sendInfoEmail,
  isDuplicateError,
  isTimeoutError,
  isAbortError,
  SubmitHttpError,
} from '../../src/lib/supabase';
import { CURRENT_EDITION } from '../../src/lib/config';

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
  nume: '  Vladislav Filip  ',
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

  it('salvează ediția curentă a evenimentului (acum 3)', async () => {
    // Regresie: dacă editie iese din sincron cu current_event_edition din DB,
    // înscrierile ediției 3 s-ar amesteca cu ediția 2 (deja plină).
    await submitRegistration(regData);
    expect(ultimulBody().editie).toBe(CURRENT_EDITION);
    expect(CURRENT_EDITION).toBe(3);
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
  it('trimite către event_waitlist cu ediția curentă', async () => {
    await submitWaitlist(regData);
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/rest\/v1\/event_waitlist$/);
    expect(ultimulBody().editie).toBe(CURRENT_EDITION);
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
