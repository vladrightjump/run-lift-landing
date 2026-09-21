import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { useTrainingReels } from '../../src/hooks/useTrainingReels';

/**
 * Hook-ul care aduce clipurile.
 *
 * Ce contează aici e calea de EȘEC: un backend căzut n-are voie să fie o cale
 * de eroare pentru pagină. Lista rămâne goală, banda nu se randează, restul
 * paginii nu știe că a existat — iar eșecul lasă totuși o urmă în monitorizare,
 * ca să nu dispară tăcut.
 */

const { fetchTrainingReels, logClientError, isAbortError } = vi.hoisted(() => ({
  fetchTrainingReels: vi.fn(),
  logClientError: vi.fn(),
  isAbortError: vi.fn(() => false),
}));

vi.mock('../../src/lib/supabase', () => ({ fetchTrainingReels, isAbortError }));
vi.mock('../../src/lib/monitoring', () => ({ logClientError }));

const CLIP = {
  youtube: 'dQw4w9WgXcQ',
  caption: 'Marți',
  url: 'https://www.instagram.com/reel/AAAAA11111/',
};

const Proba = () => {
  const reels = useTrainingReels();
  return <span data-testid="n">{reels.length}</span>;
};

const n = () => screen.getByTestId('n').textContent;

beforeEach(() => {
  vi.clearAllMocks();
  isAbortError.mockReturnValue(false);
});
afterEach(cleanup);

describe('drumul fericit', () => {
  it('pornește gol și se umple după răspuns', async () => {
    fetchTrainingReels.mockResolvedValue([CLIP, { ...CLIP, youtube: '_-Ab0123456' }]);
    render(<Proba />);
    // Primul cadru e gol: nu există instantaneu de build pentru clipuri.
    expect(n()).toBe('0');
    await waitFor(() => expect(n()).toBe('2'));
  });
});

describe('backendul căzut nu e o cale de eroare', () => {
  it('lista rămâne goală, iar eșecul lasă o urmă', async () => {
    fetchTrainingReels.mockRejectedValue(new Error('boom'));
    render(<Proba />);
    await waitFor(() => expect(logClientError).toHaveBeenCalledWith('fetch-training-reels', expect.anything()));
    expect(n()).toBe('0');
  });

  it('un abort la demontare NU se raportează ca eroare', async () => {
    // Demontarea anulează cererea în zbor. Raportat, ar fi umplut monitorizarea
    // cu „erori" produse de navigarea normală.
    isAbortError.mockReturnValue(true);
    fetchTrainingReels.mockRejectedValue(new Error('AbortError'));
    render(<Proba />);
    await waitFor(() => expect(fetchTrainingReels).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(logClientError).not.toHaveBeenCalled();
  });
});

describe('ciclul de viață', () => {
  it('cere clipurile o singură dată, nu la fiecare randare', async () => {
    fetchTrainingReels.mockResolvedValue([CLIP]);
    const { rerender } = render(<Proba />);
    await waitFor(() => expect(n()).toBe('1'));
    rerender(<Proba />);
    rerender(<Proba />);
    expect(fetchTrainingReels).toHaveBeenCalledTimes(1);
  });

  it('demontarea anulează cererea în zbor', async () => {
    fetchTrainingReels.mockImplementation(
      (signal: AbortSignal) =>
        new Promise((_, reject) => {
          signal.addEventListener('abort', () => reject(new Error('AbortError')));
        })
    );
    const { unmount } = render(<Proba />);
    const semnal = fetchTrainingReels.mock.calls[0][0] as AbortSignal;
    expect(semnal.aborted).toBe(false);
    unmount();
    expect(semnal.aborted).toBe(true);
  });
});
