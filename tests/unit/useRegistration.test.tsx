import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useEffect } from 'react';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { useRegistration } from '../../src/hooks/useRegistration';
import { EventConfigProvider } from '../../src/hooks/useEventConfig';
import { SNAPSHOT_CONFIG } from '../../src/content/eventConfig';
import { SubmitHttpError, type PublicStats } from '../../src/lib/supabase';

/**
 * Mașina de stări a înscrierii — `form → loading → success/error`, plus ramura
 * de listă de așteptare.
 *
 * Teste de CARACTERIZARE: descriu ce face azi, nu ce ar trebui să facă. Sunt
 * plasa de siguranță pentru `RegistrationSection` și `RegistrationForm`, care
 * randează amândouă aceste stări din același hook. Fără ele, orice mutare de
 * cod din cele două fișiere ar fi verificată din ochi.
 *
 * Hook-ul citește câmpurile din `e.currentTarget` la submit, deci nu poate fi
 * testat cu `renderHook` singur: îi trebuie un formular real, cu `name`-urile
 * pe care le citește. De asta există `Harnasament`.
 */

const { submitRegistration, submitWaitlist, sendConfirmationEmail, rememberMySignup, logClientError } =
  vi.hoisted(() => ({
    submitRegistration: vi.fn(),
    submitWaitlist: vi.fn(),
    sendConfirmationEmail: vi.fn(),
    rememberMySignup: vi.fn(),
    logClientError: vi.fn(),
  }));

// Predicatele de eroare și `SubmitHttpError` rămân CELE REALE: testele trebuie
// să prindă dacă se schimbă felul în care o eroare e clasificată, nu doar dacă
// hook-ul reacționează la un boolean pe care tot testul l-a fabricat.
vi.mock('../../src/lib/supabase', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/lib/supabase')>()),
  submitRegistration,
  submitWaitlist,
  sendConfirmationEmail,
  fetchPublicConfig: vi.fn().mockResolvedValue(null),
}));
vi.mock('../../src/lib/mySignups', () => ({ rememberMySignup, getMySignups: () => [], maskName: (s: string) => s }));
vi.mock('../../src/lib/monitoring', () => ({
  logClientError,
  setMonitoringEdition: vi.fn(),
}));

const showToast = vi.fn();
const refresh = vi.fn();

/** Un `stats` complet, cu numărul de locuri ocupate cerut de test. */
const stats = (count: number, waitlist = 0): PublicStats => ({
  count,
  participants: [],
  waitlist,
});

/** Data nașterii a unui adult, ca ISO — trece pragul de vârstă al ediției. */
const NASTERE_VALIDA = '1994-05-20';

/**
 * Ce expune hook-ul, prins din interiorul harnașamentului.
 *
 * Captura trece printr-un obiect, nu printr-o variabilă reatribuită din render:
 * a doua formă e exact tiparul pe care `react(globals)` îl semnalează, iar
 * pragul de lint din U11 l-ar respinge.
 */
type Reg = ReturnType<typeof useRegistration>;
const captura: { reg: Reg | null } = { reg: null };
const reg = (): Reg => {
  if (!captura.reg) throw new Error('Harnașamentul nu e randat.');
  return captura.reg;
};

const Harnasament = ({ s, now }: { s: PublicStats | null; now: number }) => {
  const r = useRegistration({ stats: s, now, refresh, showToast });
  // Captura se face din efect, nu din render: scrierea în timpul randării e un
  // efect secundar, iar `react(immutability)` o semnalează pe bună dreptate.
  // `render`/`act` golesc efectele înainte ca testul să citească, deci `reg()`
  // vede mereu ultima randare.
  useEffect(() => {
    captura.reg = r;
  });
  const { formRef, handleSubmit } = r;
  return (
    <form ref={formRef} onSubmit={handleSubmit}>
      <input name="nume" defaultValue="Popescu" />
      <input name="prenume" defaultValue="Ana" />
      <input name="telefon" defaultValue="+37360123456" />
      <input name="email" defaultValue="ana@example.com" />
      <input name="dataNasterii" defaultValue={NASTERE_VALIDA} />
      <input name="acord" type="checkbox" defaultChecked />
      <button type="submit">Trimite</button>
    </form>
  );
};

const randeaza = (s: PublicStats | null = stats(0), now = new Date('2026-09-01T10:00:00Z').getTime()) =>
  render(
    <EventConfigProvider override={SNAPSHOT_CONFIG}>
      <Harnasament s={s} now={now} />
    </EventConfigProvider>
  );

/** Trimite formularul și lasă `enforceMin` (700 ms) să se scurgă. */
const trimiteSiAsteapta = async () => {
  fireEvent.submit(screen.getByRole('button', { name: 'Trimite' }));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
};

beforeEach(() => {
  vi.useFakeTimers();
  submitRegistration.mockResolvedValue('id-nou');
  submitWaitlist.mockResolvedValue(undefined);
  sendConfirmationEmail.mockResolvedValue(undefined);
});

afterEach(() => {
  captura.reg = null;
  vi.useRealTimers();
  vi.clearAllMocks();
  cleanup();
});

describe('useRegistration — drumul fericit', () => {
  it('trece form → success și reține prenumele pentru confirmare', async () => {
    randeaza();
    expect(reg().phase).toBe('form');
    expect(reg().showForm).toBe(true);

    await trimiteSiAsteapta();

    expect(reg().phase).toBe('success');
    expect(reg().confirmName).toBe('Ana');
    expect(reg().submittedAsWaitlist).toBe(false);
    expect(submitRegistration).toHaveBeenCalledTimes(1);
  });

  it('trimite emailul de confirmare cu id-ul întors de înscriere', async () => {
    randeaza();
    await trimiteSiAsteapta();
    expect(sendConfirmationEmail).toHaveBeenCalledWith('id-nou');
  });

  it('ține minte înscrierea local și cere restatisticarea', async () => {
    randeaza();
    await trimiteSiAsteapta();
    expect(rememberMySignup).toHaveBeenCalledWith('Ana Popescu');
    expect(refresh).toHaveBeenCalled();
  });

  it('urcă numărul de locuri ocupate imediat, fără să aștepte statisticile', async () => {
    randeaza(stats(7));
    expect(reg().slots.occupied).toBe(7);
    await trimiteSiAsteapta();
    expect(reg().slots.occupied).toBe(8);
  });
});

describe('useRegistration — durata minimă de încărcare', () => {
  it('nu arată succesul înainte de 700 ms, chiar dacă serverul răspunde instant', async () => {
    randeaza();
    fireEvent.submit(screen.getByRole('button', { name: 'Trimite' }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(reg().phase).toBe('loading');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(reg().phase).toBe('success');
  });

  it('nu trimite de două ori la dublu-submit', async () => {
    randeaza();
    fireEvent.submit(screen.getByRole('button', { name: 'Trimite' }));
    fireEvent.submit(screen.getByRole('button', { name: 'Trimite' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(submitRegistration).toHaveBeenCalledTimes(1);
  });
});

describe('useRegistration — lista de așteptare', () => {
  it('cu locurile ocupate, formularul trece pe lista de așteptare', async () => {
    randeaza(stats(SNAPSHOT_CONFIG.slots.total));
    expect(reg().isSoldOut).toBe(true);
    expect(reg().waitlistMode).toBe(true);
    expect(reg().waitlistLeft).toBe(SNAPSHOT_CONFIG.slots.waitlist);

    await trimiteSiAsteapta();

    expect(submitWaitlist).toHaveBeenCalledTimes(1);
    expect(submitRegistration).not.toHaveBeenCalled();
    expect(reg().phase).toBe('success');
    expect(reg().submittedAsWaitlist).toBe(true);
  });

  it('pe lista de așteptare nu urcă contorul de locuri și nu reține înscrierea', async () => {
    randeaza(stats(SNAPSHOT_CONFIG.slots.total));
    await trimiteSiAsteapta();
    expect(reg().slots.occupied).toBe(SNAPSHOT_CONFIG.slots.total);
    expect(rememberMySignup).not.toHaveBeenCalled();
  });

  it('când lista se umple între timp, revine la formular și îl închide', async () => {
    submitWaitlist.mockRejectedValue(new SubmitHttpError(400, 'waitlist_full'));
    randeaza(stats(SNAPSHOT_CONFIG.slots.total));

    await trimiteSiAsteapta();

    expect(reg().isWaitlistFull).toBe(true);
    expect(reg().phase).toBe('form');
    expect(reg().showForm).toBe(false);
    expect(reg().closedReason).toBe('full');
    expect(showToast).toHaveBeenCalledWith('error', 'Lista de așteptare tocmai s-a umplut.');
  });

  it('lista plină din statistici închide formularul fără niciun submit', () => {
    randeaza(stats(SNAPSHOT_CONFIG.slots.total, SNAPSHOT_CONFIG.slots.waitlist));
    expect(reg().isWaitlistFull).toBe(true);
    expect(reg().waitlistMode).toBe(false);
    expect(reg().showForm).toBe(false);
    expect(reg().closedReason).toBe('full');
  });
});

describe('useRegistration — locurile se ocupă între timp', () => {
  it('la `event_full` de la server, comută singur pe lista de așteptare', async () => {
    submitRegistration.mockRejectedValue(new SubmitHttpError(400, 'event_full'));
    randeaza(stats(0));

    await trimiteSiAsteapta();

    expect(submitWaitlist).toHaveBeenCalledTimes(1);
    expect(reg().phase).toBe('success');
    expect(reg().submittedAsWaitlist).toBe(true);
  });

  it('dacă și lista e plină la comutare, închide formularul', async () => {
    submitRegistration.mockRejectedValue(new SubmitHttpError(400, 'event_full'));
    submitWaitlist.mockRejectedValue(new SubmitHttpError(400, 'waitlist_full'));
    randeaza(stats(0));

    await trimiteSiAsteapta();

    expect(reg().isWaitlistFull).toBe(true);
    expect(reg().phase).toBe('form');
    expect(showToast).toHaveBeenCalledWith('error', 'Locurile și lista de așteptare s-au ocupat.');
  });
});

describe('useRegistration — căile de eroare', () => {
  it('emailul duplicat spune exact asta, nu o eroare generică', async () => {
    submitRegistration.mockRejectedValue(new SubmitHttpError(409, 'duplicate key'));
    randeaza();

    await trimiteSiAsteapta();

    expect(reg().phase).toBe('error');
    expect(showToast).toHaveBeenCalledWith('error', 'Există deja o înscriere cu acest email.');
  });

  it('timeout-ul cere reîncercarea, nu raportează o înscriere eșuată', async () => {
    submitRegistration.mockRejectedValue(new DOMException('timeout', 'TimeoutError'));
    randeaza();

    await trimiteSiAsteapta();

    expect(reg().phase).toBe('error');
    expect(showToast).toHaveBeenCalledWith('error', 'Serverul răspunde greu. Încearcă din nou.');
  });

  it('cererea blocată de rețea sau CSP e numită ca atare', async () => {
    submitRegistration.mockRejectedValue(new TypeError('Failed to fetch'));
    randeaza();

    await trimiteSiAsteapta();

    expect(reg().phase).toBe('error');
    expect(showToast).toHaveBeenCalledWith('error', 'Conexiune blocată sau indisponibilă. Reîncearcă.');
  });

  it('înscrierile închise pe server nu propun retry', async () => {
    submitRegistration.mockRejectedValue(new SubmitHttpError(400, 'registration_closed'));
    randeaza();

    await trimiteSiAsteapta();

    expect(reg().phase).toBe('error');
    expect(showToast).toHaveBeenCalledWith('error', 'Înscrierile s-au închis.');
  });

  it('un abort la unmount nu lasă nicio stare de eroare', async () => {
    submitRegistration.mockRejectedValue(new DOMException('aborted', 'AbortError'));
    randeaza();

    await trimiteSiAsteapta();

    expect(reg().phase).toBe('loading');
    expect(showToast).not.toHaveBeenCalledWith('error', expect.anything());
  });

  it('eroarea necunoscută lasă o urmă în monitorizare', async () => {
    submitRegistration.mockRejectedValue(new SubmitHttpError(500, 'boom'));
    randeaza();

    await trimiteSiAsteapta();

    expect(logClientError).toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith('error', 'Înscrierea nu a putut fi trimisă.');
  });
});

describe('useRegistration — validarea', () => {
  it('data nașterii invalidă oprește trimiterea și dă un motiv anume', async () => {
    render(
      <EventConfigProvider override={SNAPSHOT_CONFIG}>
        <Harnasament s={stats(0)} now={Date.now()} />
      </EventConfigProvider>
    );
    fireEvent.change(screen.getByDisplayValue(NASTERE_VALIDA), { target: { value: '2020-01-01' } });

    await trimiteSiAsteapta();

    expect(reg().phase).toBe('form');
    expect(reg().errors.dataNasterii).toBe(true);
    expect(reg().dateErrMsg).not.toBe('Introdu data nașterii.');
    expect(submitRegistration).not.toHaveBeenCalled();
  });

  it('fără acord, mesajul e despre regulament, nu despre câmpuri roșii', async () => {
    randeaza();
    fireEvent.click(screen.getByRole('checkbox'));

    await trimiteSiAsteapta();

    expect(reg().phase).toBe('form');
    expect(reg().errors.acord).toBe(true);
    expect(showToast).toHaveBeenCalledWith(
      'error',
      'Trebuie să accepți regulamentul ca să te poți înscrie.'
    );
  });

  it('`clearErrorFor` șterge exact un câmp și lasă restul', async () => {
    randeaza();
    fireEvent.change(screen.getByDisplayValue('Popescu'), { target: { value: 'X' } });
    fireEvent.change(screen.getByDisplayValue('ana@example.com'), { target: { value: 'nu-e-email' } });

    await trimiteSiAsteapta();
    expect(reg().errors.nume).toBe(true);
    expect(reg().errors.email).toBe(true);

    act(() => reg().clearErrorFor('nume'));

    expect(reg().errors.nume).toBeUndefined();
    expect(reg().errors.email).toBe(true);
  });
});

describe('useRegistration — ferestrele de timp', () => {
  it('după finalul cursei, formularul dispare cu motivul „ended"', () => {
    randeaza(stats(0), new Date('2027-01-01T00:00:00Z').getTime());
    expect(reg().showForm).toBe(false);
    expect(reg().closedReason).toBe('ended');
  });

  it('`resetForm` readuce formularul din succes, fără erori', async () => {
    randeaza();
    await trimiteSiAsteapta();
    expect(reg().phase).toBe('success');

    act(() => reg().resetForm());

    expect(reg().phase).toBe('form');
    expect(reg().errors).toEqual({});
    expect(reg().birth).toEqual({ d: '', m: '', y: '' });
  });
});
