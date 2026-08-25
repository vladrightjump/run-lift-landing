// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent, within } from '@testing-library/react';
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
    // Ana are confirmarea trimisă, dar niciun reminder — cazul pe care insigna
    // veche (cheiată doar pe adresă) îl raporta drept „✓ trimis".
    emailLog: [
      l({ id: 'e1', email: 'ana@exemplu.ro', subiect: 'Confirmare', mod: 'confirm', status: 'trimis' }),
      l({ id: 'e2', email: 'mihai@exemplu.ro', subiect: 'Reminder', mod: 'admin', status: 'esuat' }),
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

  it('insigna NU raportează „complet" cât timp o comunicare datorată lipsește', async () => {
    // Regresia pe care o ascundea harta cheiată doar pe adresă: Ana are o
    // confirmare reușită, dar niciun reminder. Insigna veche arăta „✓ trimis".
    render(<AdminDashboard token="token-test" onLogout={() => {}} />);

    await screen.findByText('Ana Popescu');
    const insigne = [...document.querySelectorAll('.admin-mail-badge')];
    const aleiAna = insigne[0];

    expect(aleiAna.className).toContain('partial');
    expect(aleiAna.textContent).toBe('1/2');
    expect(aleiAna.getAttribute('title')).toContain('Confirmare: trimis');
    expect(aleiAna.getAttribute('title')).toContain('Reminder: lipsă');
  });
});

describe('AdminDashboard — undo la ștergere', () => {
  /** Șterge primul participant și întoarce funcția de undo din toast. */
  const stergePrimul = async () => {
    render(<AdminDashboard token="token-test" onLogout={() => {}} />);
    await screen.findByText('Ana Popescu');

    fireEvent.click(screen.getAllByRole('button', { name: 'Șterge' })[0]);
    fireEvent.click(await screen.findByRole('button', { name: 'Da, șterge' }));

    await waitFor(() => expect(api.current?.deleteRegistration).toHaveBeenCalled());
    const toast = await screen.findByRole('status');
    return within(toast).getByRole('button', { name: 'Anulează' });
  };

  it('undo reversează ștergerea — NU reinserează', async () => {
    // Defectul: undo apela `addRegistration`, care sare peste garda de
    // capacitate și dă rândului recreat un `created_at` nou, deci persoana își
    // pierdea locul în ordinea de promovare.
    const undo = await stergePrimul();
    fireEvent.click(undo);

    await waitFor(() => expect(api.current?.undeleteRegistration).toHaveBeenCalled());
    expect(api.current?.addRegistration).not.toHaveBeenCalled();
  });

  it('undo trimite id-ul rândului șters, nu datele lui', async () => {
    const undo = await stergePrimul();
    fireEvent.click(undo);

    await waitFor(() => expect(api.current?.undeleteRegistration).toHaveBeenCalled());
    const [, id] = api.current!.undeleteRegistration.mock.calls.at(-1)!;
    expect(id).toBe('r1');
  });

  it('undo refuzat pentru că locul s-a ocupat spune de ce', async () => {
    const undo = await stergePrimul();
    api.current!.undeleteRegistration.mockRejectedValueOnce(
      new Error('Supabase 400: {"message":"event_full"}')
    );
    fireEvent.click(undo);

    expect(await screen.findByText(/ediția e plină/i)).toBeDefined();
  });

  it('undo refuzat pentru adresă re-înscrisă spune de ce', async () => {
    const undo = await stergePrimul();
    api.current!.undeleteRegistration.mockRejectedValueOnce(
      new Error('Supabase 400: {"message":"duplicate_email"}')
    );
    fireEvent.click(undo);

    expect(await screen.findByText(/re-înscrisă/i)).toBeDefined();
  });
});
