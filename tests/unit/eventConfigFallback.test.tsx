import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { EventConfigProvider, useEventConfig } from '../../src/hooks/useEventConfig';
import { SNAPSHOT_CONFIG } from '../../src/content/eventConfig';

/**
 * Poarta dintre configul publicat si pagina.
 *
 * Doua contracte sunt pazite aici:
 *  1. un fetch esuat NU e o cale de eroare — pagina ramane pe instantaneu;
 *  2. ediția raportata in loguri urmeaza configul SERVIT, nu bundle-ul. Altfel,
 *     dupa o publicare, filtrarea logurilor pe ediția noua nu gaseste nimic —
 *     exact cand e nevoie de ele.
 */

const { fetchPublicConfig, setMonitoringEdition, logClientError } = vi.hoisted(() => ({
  fetchPublicConfig: vi.fn(),
  setMonitoringEdition: vi.fn(),
  logClientError: vi.fn(),
}));

vi.mock('../../src/lib/supabase', () => ({
  fetchPublicConfig,
  isAbortError: (e: unknown) => e instanceof DOMException && e.name === 'AbortError',
}));
vi.mock('../../src/lib/monitoring', () => ({ setMonitoringEdition, logClientError }));
vi.mock('../../src/lib/adminApi', () => ({
  getStoredToken: () => null,
  listEventConfig: vi.fn(),
}));

const Sonda = () => {
  const c = useEventConfig();
  return <span data-testid="ed">{c.number}</span>;
};

const randeaza = () =>
  render(
    <EventConfigProvider>
      <Sonda />
    </EventConfigProvider>
  );

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe('primul cadru vine din instantaneu', () => {
  it('randeaza ediția deployata inainte ca fetch-ul sa raspunda', () => {
    fetchPublicConfig.mockReturnValue(new Promise(() => {}));
    randeaza();
    expect(screen.getByTestId('ed').textContent).toBe(String(SNAPSHOT_CONFIG.number));
  });
});

describe('un fetch esuat nu strica pagina', () => {
  it('reteaua cade: ramanem pe instantaneu si lasam o urma', async () => {
    fetchPublicConfig.mockRejectedValue(new TypeError('Failed to fetch'));
    randeaza();
    await waitFor(() => expect(logClientError).toHaveBeenCalled());
    expect(screen.getByTestId('ed').textContent).toBe(String(SNAPSHOT_CONFIG.number));
  });

  it('document nerandabil (null): ramanem pe instantaneu, FARA eroare', async () => {
    fetchPublicConfig.mockResolvedValue(null);
    randeaza();
    await waitFor(() => expect(fetchPublicConfig).toHaveBeenCalled());
    expect(screen.getByTestId('ed').textContent).toBe(String(SNAPSHOT_CONFIG.number));
    expect(setMonitoringEdition).not.toHaveBeenCalled();
  });
});

describe('reconcilierea cu configul publicat', () => {
  it('alta ediție publicata inlocuieste instantaneul', async () => {
    fetchPublicConfig.mockResolvedValue({ ...SNAPSHOT_CONFIG, number: 42 });
    randeaza();
    await waitFor(() => expect(screen.getByTestId('ed').textContent).toBe('42'));
  });

  it('monitorizarea urmeaza ediția SERVITA, nu bundle-ul', async () => {
    // Regresie: `setMonitoringEdition` era exportat si niciodata apelat, desi
    // comentariul din monitoring.ts promitea ca provider-ul il actualizeaza.
    fetchPublicConfig.mockResolvedValue({ ...SNAPSHOT_CONFIG, number: 42 });
    randeaza();
    await waitFor(() => expect(setMonitoringEdition).toHaveBeenCalledWith(42));
  });
});
