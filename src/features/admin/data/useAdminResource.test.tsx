import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useEffect, useState } from 'react';
import { QueryClientProvider, useQuery, focusManager, onlineManager } from '@tanstack/react-query';
import { render, cleanup, act, waitFor } from '@testing-library/react';
import { createAppQueryClient } from '../../../app/providers';
import { useAdminResource } from './useAdminResource';
import { FurnizorSesiuneAdmin } from './adminSession';
import { InvalidTokenError } from '../../../shared/lib/rpc';
import { rpc } from '../../../shared/lib/rpc';
import { server } from '../../../../tests/support/vitest.setup';
import { rpcHandler } from '../../../../tests/support/handlers';
import { HttpResponse } from 'msw';

/**
 * Ciclul de încărcare pe care fiecare tab de backoffice și-l scria singur.
 *
 * Ce se păzește aici, în ordinea în care contează:
 *  1. o cerere anulată nu scrie nimic (altfel un răspuns întârziat suprascrie
 *     unul proaspăt, sau lasă o eroare după demontare);
 *  2. sesiunea expirată merge la `onAuthError`, NU în starea de eroare a
 *     tabului — altfel organizatorul vede „n-a mers" în loc să fie dus la login;
 *  3. un eșec după ce datele au sosit o dată NU golește ecranul.
 */

const onAuthError = vi.fn((_error: unknown) => false);
const showToast = vi.fn();

type Prins = { date: unknown; eroare: boolean; reincarca: () => Promise<boolean> };
const captura: { r: Prins | null } = { r: null };
const res = (): Prins => {
  if (!captura.r) throw new Error('Sonda nu e randată.');
  return captura.r;
};

const Sonda = ({
  incarca,
  intervalMs,
}: {
  incarca: (t: string, s: AbortSignal) => Promise<unknown>;
  intervalMs?: number | null;
}) => {
  const r = useAdminResource(incarca, intervalMs);
  useEffect(() => {
    captura.r = r;
  });
  return null;
};

const randeaza = (
  incarca: (t: string, s: AbortSignal) => Promise<unknown>,
  intervalMs?: number | null
) =>
  render(
    <FurnizorSesiuneAdmin token="jeton" onAuthError={onAuthError} showToast={showToast}>
      <Sonda incarca={incarca} intervalMs={intervalMs} />
    </FurnizorSesiuneAdmin>
  );

beforeEach(() => {
  vi.useFakeTimers();
  onAuthError.mockReturnValue(false);
});

afterEach(() => {
  onlineManager.setOnline(true);
  captura.r = null;
  vi.useRealTimers();
  vi.clearAllMocks();
  cleanup();
});

const lasaSaSeAseze = async () => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
};

describe('useAdminResource — încărcarea', () => {
  it('cheamă încărcătorul o dată la montare, cu tokenul din sesiune', async () => {
    const incarca = vi.fn().mockResolvedValue(['a', 'b']);
    randeaza(incarca);
    await lasaSaSeAseze();

    expect(incarca).toHaveBeenCalledTimes(1);
    expect(incarca.mock.calls[0][0]).toBe('jeton');
    expect(res().date).toEqual(['a', 'b']);
    expect(res().eroare).toBe(false);
  });

  it('`reincarca` cere din nou', async () => {
    const incarca = vi.fn().mockResolvedValue([]);
    randeaza(incarca);
    await lasaSaSeAseze();

    await act(async () => {
      res().reincarca();
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(incarca).toHaveBeenCalledTimes(2);
  });

  it('reîmprospătează singur, pe interval', async () => {
    const incarca = vi.fn().mockResolvedValue([]);
    randeaza(incarca);
    await lasaSaSeAseze();
    expect(incarca).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });

    expect(incarca).toHaveBeenCalledTimes(2);
  });

  it('la fiecare interval anulează cererea rămasă în zbor și pornește alta', async () => {
    const signals: AbortSignal[] = [];
    const incarca = vi.fn((_token: string, signal: AbortSignal) => {
      signals.push(signal);
      return new Promise(() => {});
    });
    randeaza(incarca);
    await lasaSaSeAseze();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });

    expect(incarca).toHaveBeenCalledTimes(2);
    expect(signals[0].aborted).toBe(true);
    expect(signals[1].aborted).toBe(false);
  });

  it('revenirea în tab cere imediat, când poll-ul e pornit', async () => {
    const incarca = vi.fn().mockResolvedValue([]);
    randeaza(incarca);
    await lasaSaSeAseze();

    await act(async () => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'visible',
      });
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(incarca).toHaveBeenCalledTimes(2);
  });
});

describe('useAdminResource — căile de eșec', () => {
  it('sesiunea expirată ajunge la `onAuthError`, nu în starea de eroare', async () => {
    onAuthError.mockReturnValue(true);
    randeaza(vi.fn().mockRejectedValue(new InvalidTokenError()));
    await lasaSaSeAseze();

    expect(onAuthError).toHaveBeenCalled();
    expect(res().eroare).toBe(false);
  });

  it('o eroare obișnuită, fără date, se vede', async () => {
    randeaza(vi.fn().mockRejectedValue(new Error('cade')));
    await lasaSaSeAseze();

    expect(res().eroare).toBe(true);
    expect(res().date).toBeNull();
  });

  it('o eroare DUPĂ ce datele au sosit nu golește ecranul', async () => {
    const incarca = vi
      .fn()
      .mockResolvedValueOnce(['deja aici'])
      .mockRejectedValue(new Error('cade'));
    randeaza(incarca);
    await lasaSaSeAseze();
    expect(res().date).toEqual(['deja aici']);

    await act(async () => {
      res().reincarca();
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(res().eroare).toBe(false);
    expect(res().date).toEqual(['deja aici']);
  });

  it('o cerere anulată nu scrie nici date, nici eroare', async () => {
    const incarca = vi.fn(
      (_t: string, signal: AbortSignal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError'))
          );
        })
    );
    randeaza(incarca);

    // A doua cerere o anulează pe prima; niciuna n-a răspuns încă.
    await act(async () => {
      res().reincarca();
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(res().eroare).toBe(false);
    expect(onAuthError).not.toHaveBeenCalled();
  });

  it('o cerere anulată care totuși se rezolvă (cu nimic) nu înlocuiește datele bune', async () => {
    let raspunde: (v: unknown) => void = () => {};
    const incarca = vi
      .fn()
      .mockResolvedValueOnce(['bun'])
      .mockImplementationOnce(() => new Promise((r) => (raspunde = r)))
      .mockResolvedValueOnce(['proaspăt']);
    randeaza(incarca, null);
    await lasaSaSeAseze();

    let rezultatAnulat: boolean | undefined;
    let rezultatNou: boolean | undefined;
    // A doua cerere pleacă; a treia o anulează înainte să răspundă.
    await act(async () => {
      void res().reincarca().then(value => { rezultatAnulat = value; });
      void res().reincarca().then(value => { rezultatNou = value; });
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      raspunde(undefined);
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(res().date).toEqual(['proaspăt']);
    expect(rezultatAnulat).toBe(false);
    expect(rezultatNou).toBe(true);
  });

  it('`reincarca` se împlinește după ce datele noi sunt pe ecran', async () => {
    let raspunde: (v: unknown) => void = () => {};
    const incarca = vi
      .fn()
      .mockResolvedValueOnce(['vechi'])
      .mockImplementationOnce(() => new Promise((r) => (raspunde = r)));
    randeaza(incarca, null);
    await lasaSaSeAseze();

    let gata = false;
    await act(async () => {
      void res().reincarca().then(() => (gata = true));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(gata).toBe(false);
    await act(async () => {
      raspunde(['nou']);
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(gata).toBe(true);
    expect(res().date).toEqual(['nou']);
  });
});

describe('adminSession — furnizorul', () => {
  it('un tab montat fără furnizor pică la randare, nu cere date cu token gol', () => {
    const Neinvelit = () => {
      useAdminResource(vi.fn().mockResolvedValue([]));
      return null;
    };
    // React raportează eroarea de randare pe consolă; o tăcem pentru testul ăsta.
    const consola = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Neinvelit />)).toThrow(/FurnizorSesiuneAdmin/);
    consola.mockRestore();
  });
});

/**
 * Nu tot ce se încarcă trebuie și reîmprospătat.
 *
 * Tabul de șabloane e un formular în care organizatorul SCRIE. Înainte de
 * refactor se încărca o singură dată; consolidarea pe `useAdminResource` i-a dat
 * din greșeală poll la 15 secunde, adică o re-randare a textarei sub cursor,
 * pentru date pe care nimeni altcineva nu le schimbă în paralel.
 */
describe('useAdminResource — încărcare o singură dată', () => {
  it('cu `intervalMs: null` nu mai cere nimic după montare', async () => {
    const incarca = vi.fn().mockResolvedValue([]);
    randeaza(incarca, null);
    await lasaSaSeAseze();
    expect(incarca).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    expect(incarca).toHaveBeenCalledTimes(1);
  });

  it('reîncărcarea manuală merge în continuare — de asta se folosește după salvare', async () => {
    const incarca = vi.fn().mockResolvedValue([]);
    randeaza(incarca, null);
    await lasaSaSeAseze();

    await act(async () => {
      res().reincarca();
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(incarca).toHaveBeenCalledTimes(2);
  });

  it('revenirea în tab NU declanșează o cerere când poll-ul e oprit', async () => {
    const incarca = vi.fn().mockResolvedValue([]);
    randeaza(incarca, null);
    await lasaSaSeAseze();

    await act(async () => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'visible',
      });
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(incarca).toHaveBeenCalledTimes(1);
  });
});

describe('useAdminResource — contractul Query', () => {
  it('încărcarea offline încearcă cererea și arată eroarea fără să aștepte reconectarea', async () => {
    onlineManager.setOnline(false);
    const incarca = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    randeaza(incarca, null);
    await lasaSaSeAseze();
    expect(incarca).toHaveBeenCalledTimes(1);
    expect(res().eroare).toBe(true);
    expect(res().date).toBeNull();
    await act(async () => {
      onlineManager.setOnline(true);
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(incarca).toHaveBeenCalledTimes(1);
  });

  it('reîncărcarea offline se încheie cu false și nu păstrează o cerere pentru reconectare', async () => {
    const incarca = vi.fn().mockResolvedValueOnce(['bun']).mockRejectedValue(new TypeError('Failed to fetch'));
    randeaza(incarca, null);
    await lasaSaSeAseze();
    onlineManager.setOnline(false);
    let rezultat: boolean | undefined;
    await act(async () => {
      void res().reincarca().then(value => { rezultat = value; });
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(rezultat).toBe(false);
    expect(incarca).toHaveBeenCalledTimes(2);
    expect(res().date).toEqual(['bun']);
    expect(res().eroare).toBe(false);
    await act(async () => {
      onlineManager.setOnline(true);
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(incarca).toHaveBeenCalledTimes(2);
  });

  it('reîncărcarea manuală anulează și prima cerere, înainte de orice date', async () => {
    const signals: AbortSignal[] = [];
    const incarca = vi.fn((_token: string, signal: AbortSignal) => {
      signals.push(signal);
      return signals.length === 1 ? new Promise(() => {}) : Promise.resolve(['nou']);
    });
    randeaza(incarca, null);
    let rezultat: boolean | undefined;
    await act(async () => {
      void res().reincarca().then(value => { rezultat = value; });
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(signals).toHaveLength(2);
    expect(signals[0].aborted).toBe(true);
    expect(rezultat).toBe(true);
    expect(res().date).toEqual(['nou']);
  });

  it('reîncărcarea manuală întoarce false când cererea eșuează', async () => {
    randeaza(vi.fn().mockResolvedValueOnce(['bun']).mockRejectedValue(new Error('cade')), null);
    await lasaSaSeAseze();
    let rezultat: boolean | undefined;
    await act(async () => {
      void res().reincarca().then(value => { rezultat = value; });
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(rezultat).toBe(false);
    expect(res().date).toEqual(['bun']);
  });

  it('Query nu reîncarcă la revenirea focusului', async () => {
    const incarca = vi.fn().mockResolvedValue([]);
    randeaza(incarca);
    await lasaSaSeAseze();
    await act(async () => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(incarca).toHaveBeenCalledTimes(1);
    focusManager.setFocused(undefined);
  });

  it('demontarea anulează cererea și oprește poll-ul Query', async () => {
    const signals: AbortSignal[] = [];
    const incarca = vi.fn((_token: string, signal: AbortSignal) => {
      signals.push(signal);
      return new Promise(() => {});
    });
    const { unmount } = randeaza(incarca);
    unmount();
    expect(signals[0].aborted).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(45_000); });
    expect(incarca).toHaveBeenCalledTimes(1);
  });

  it('orice query cu doi observatori tratează sesiunea expirată o singură dată și arată loginul', async () => {
    vi.useRealTimers();
    const client = createAppQueryClient();
    const response = vi.fn(() => HttpResponse.text('invalid_token', { status: 401 }));
    server.use(rpcHandler('admin_check_token', response));
    const incarca = ({ signal }: { signal: AbortSignal }) => rpc('admin_check_token', { p_token: 'jeton' }, signal);
    const Citeste = () => {
      useQuery({ queryKey: ['auth-test'], queryFn: incarca });
      return null;
    };
    const Sesiune = () => {
      const [login, setLogin] = useState(false);
      return login ? <p>Login</p> : (
        <FurnizorSesiuneAdmin token="jeton" showToast={showToast} onAuthError={err => {
          onAuthError(err);
          setLogin(true);
          return true;
        }}>
          <Citeste /><Citeste />
        </FurnizorSesiuneAdmin>
      );
    };
    const view = render(<QueryClientProvider client={client}><Sesiune /></QueryClientProvider>);
    await waitFor(() => expect(view.getByText('Login')).toBeTruthy());
    expect(response).toHaveBeenCalledTimes(1);
    expect(onAuthError).toHaveBeenCalledExactlyOnceWith(expect.any(InvalidTokenError));
    view.unmount();
    client.clear();
  });
});

describe('useAdminResource — păstrează valorile la schimbarea query-ului', () => {
  it('un corp RPC gol rămâne succes cu undefined, fără eroare Query nouă', async () => {
    vi.useRealTimers();
    server.use(rpcHandler('admin_check_token', () => new HttpResponse('', { status: 200 })));
    const incarca = (token: string, signal: AbortSignal) => rpc('admin_check_token', { p_token: token }, signal);
    randeaza(incarca, null);
    await waitFor(() => expect(res().date).toBeUndefined());
    expect(res().eroare).toBe(false);
    let rezultat: boolean | undefined;
    await act(async () => { rezultat = await res().reincarca(); });
    expect(rezultat).toBe(true);
    expect(res().eroare).toBe(false);
  });

  it('un callback nou cere din nou și păstrează datele bune după eșec', async () => {
    const primul = vi.fn().mockResolvedValue(['bun']);
    const urmatorul = vi.fn().mockRejectedValue(new Error('cade'));
    const view = randeaza(primul, null);
    await lasaSaSeAseze();
    view.rerender(
      <FurnizorSesiuneAdmin token="jeton" onAuthError={onAuthError} showToast={showToast}>
        <Sonda incarca={urmatorul} intervalMs={null} />
      </FurnizorSesiuneAdmin>
    );
    await lasaSaSeAseze();
    expect(urmatorul).toHaveBeenCalledTimes(1);
    expect(res().date).toEqual(['bun']);
    expect(res().eroare).toBe(false);
  });

  it('un token nou cere cu tokenul nou și păstrează datele bune după eșec', async () => {
    const incarca = vi.fn().mockResolvedValueOnce(['bun']).mockRejectedValue(new Error('cade'));
    const view = randeaza(incarca, null);
    await lasaSaSeAseze();
    view.rerender(
      <FurnizorSesiuneAdmin token="nou" onAuthError={onAuthError} showToast={showToast}>
        <Sonda incarca={incarca} intervalMs={null} />
      </FurnizorSesiuneAdmin>
    );
    await lasaSaSeAseze();
    expect(incarca).toHaveBeenCalledTimes(2);
    expect(incarca.mock.calls[1][0]).toBe('nou');
    expect(res().date).toEqual(['bun']);
    expect(res().eroare).toBe(false);
  });
});

it('o resursă dezactivată nu pornește cereri la interval sau la revenirea în tab', async () => {
  const incarca = vi.fn().mockResolvedValue(['date']);
  const Dezactivat = () => { useAdminResource(incarca, 15_000, { enabled: false }); return null; };
  render(<FurnizorSesiuneAdmin token="jeton" onAuthError={onAuthError} showToast={showToast}><Dezactivat /></FurnizorSesiuneAdmin>);
  await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
  document.dispatchEvent(new Event('visibilitychange'));
  await lasaSaSeAseze();
  expect(incarca).not.toHaveBeenCalled();
});
