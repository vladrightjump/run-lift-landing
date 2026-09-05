import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useEffect } from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { useAdminResource } from '../../src/admin/useAdminResource';
import { FurnizorSesiuneAdmin } from '../../src/admin/adminSession';
import { InvalidTokenError } from '../../src/lib/adminApi';

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

const onAuthError = vi.fn(() => false);
const showToast = vi.fn();

type Prins = { date: unknown; eroare: boolean; reincarca: () => void };
const captura: { r: Prins | null } = { r: null };
const res = (): Prins => {
  if (!captura.r) throw new Error('Sonda nu e randată.');
  return captura.r;
};

const Sonda = ({ incarca }: { incarca: (t: string, s: AbortSignal) => Promise<unknown> }) => {
  const r = useAdminResource(incarca);
  useEffect(() => {
    captura.r = r;
  });
  return null;
};

const randeaza = (incarca: (t: string, s: AbortSignal) => Promise<unknown>) =>
  render(
    <FurnizorSesiuneAdmin token="jeton" onAuthError={onAuthError} showToast={showToast}>
      <Sonda incarca={incarca} />
    </FurnizorSesiuneAdmin>
  );

beforeEach(() => {
  vi.useFakeTimers();
  onAuthError.mockReturnValue(false);
});

afterEach(() => {
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
