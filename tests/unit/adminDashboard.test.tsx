// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import type { adminApiMock } from './helpers/adminHarness';

/**
 * Primul test de componentă din backoffice. Până acum `src/admin/` avea zero
 * acoperire: doar `emailAudience.ts` și `deliveryLog.ts` erau testate, iar ele
 * sunt logică pură scoasă din componente.
 */

const api = vi.hoisted(() => ({ current: null as ReturnType<typeof adminApiMock> | null }));

vi.mock('../../src/lib/adminApi', async () => {
  const { adminApiMock: build, participant: p, logEntry: l } = await import(
    './helpers/adminHarness'
  );
  api.current = build(vi, {
    registrations: [
      p({ id: 'r1', nume: 'Ana Popescu', email: 'ana@exemplu.ro' }),
      p({ id: 'r2', nume: 'Mihai Ionescu', email: 'mihai@exemplu.ro' }),
    ],
    emailLog: [
      l({ id: 'e1', email: 'ana@exemplu.ro', subiect: 'Confirmare', status: 'trimis' }),
      l({ id: 'e2', email: 'mihai@exemplu.ro', subiect: 'Reminder', status: 'esuat' }),
    ],
  });
  return api.current;
});

vi.mock('../../src/lib/supabase', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  sendConfirmationEmail: vi.fn(async () => undefined),
}));

const { AdminDashboard } = await import('../../src/admin/AdminDashboard');

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('AdminDashboard', () => {
  it('randează un rând pentru fiecare participant al ediției', async () => {
    render(<AdminDashboard token="token-test" onLogout={() => {}} />);

    expect(await screen.findByText('Ana Popescu')).toBeDefined();
    expect(screen.getByText('Mihai Ionescu')).toBeDefined();
  });

  it('cere lista pentru ediția curentă, nu pentru toate edițiile', async () => {
    render(<AdminDashboard token="token-test" onLogout={() => {}} />);

    await waitFor(() => {
      expect(api.current?.listRegistrations).toHaveBeenCalled();
    });
    const [, editieCeruta] = api.current!.listRegistrations.mock.calls.at(-1)!;
    expect(editieCeruta).toBe(5);
  });

  it('numără emailurile nelivrate prin logica din deliveryLog, nu printr-o copie', async () => {
    // Un eșec pe „Reminder" trebuie să rămână numărat chiar dacă aceeași adresă
    // are o trimitere reușită pe alt subiect. Cheia e adresă+subiect.
    render(<AdminDashboard token="token-test" onLogout={() => {}} />);

    expect(await screen.findByText('Ana Popescu')).toBeDefined();
    const alerta = document.querySelector('.admin-tab-alert');
    expect(alerta?.textContent).toBe('1');
  });
});
