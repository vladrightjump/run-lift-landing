// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import type { adminApiMock } from './helpers/adminHarness';
import { cheieDifuzare } from '../../src/admin/sendLock';

/**
 * Zăvorul pe difuzările manuale. Înainte, butonul de trimitere n-avea memorie:
 * nici `AdminEmailTab`, nici `adminApi` nu pomeneau vreodată `once_key`, deși
 * primitiva atomică rula deja în producție pe calea reminderului.
 */

const api = vi.hoisted(() => ({ current: null as ReturnType<typeof adminApiMock> | null }));

vi.mock('../../src/lib/adminApi', async () => {
  const { adminApiMock: build, logEntry: l } = await import('./helpers/adminHarness');
  api.current = build(vi, {
    emailLog: [
      l({
        id: 'e1',
        email: 'ana@exemplu.ro',
        subiect: 'Detalii pentru sâmbătă',
        mod: 'admin',
        status: 'trimis',
        created_at: '2026-08-20T12:00:00Z',
      }),
    ],
    templates: [
      {
        cheie: 'bulk_participant_reminder',
        subiect: 'Detalii pentru sâmbătă',
        text_email: 'Ne vedem la 07:00.',
        actualizat_la: '2026-08-19T10:00:00Z',
      },
    ],
  });
  return api.current;
});

const { AdminEmailTab } = await import('../../src/admin/AdminEmailTab');

const participanti = [
  {
    id: 'r1',
    created_at: '2026-08-01T10:00:00Z',
    nume: 'Ana Popescu',
    telefon: '069000000',
    email: 'ana@exemplu.ro',
    echipa: '',
    editie: 5,
    dezabonat_la: null,
  },
];

const monteaza = (emailLog: Parameters<typeof AdminEmailTab>[0]['emailLog']) =>
  render(
    <AdminEmailTab
      token="token-test"
      rows={participanti}
      waitlist={[]}
      editie={5}
      emailLog={emailLog}
      readOnly={false}
      formatDate={(iso) => iso.slice(0, 10)}
      showToast={() => {}}
    />
  );

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('AdminEmailTab — zăvor pe trimitere', () => {
  it('trimiterea poartă o cheie de idempotență', async () => {
    monteaza([]);

    const buton = await screen.findByRole('button', { name: /Trimite email/ });
    fireEvent.click(buton);

    await waitFor(() => expect(api.current?.sendBulkEmail).toHaveBeenCalled());
    const meta = api.current!.sendBulkEmail.mock.calls.at(-1)![2];
    expect(meta?.onceKey).toBeTruthy();
  });

  it('cheia e cea derivată din ediție + audiență + subiect', async () => {
    monteaza([]);

    const buton = await screen.findByRole('button', { name: /Trimite email/ });
    const subiect = (screen.getByDisplayValue('Detalii pentru sâmbătă') as HTMLInputElement).value;
    fireEvent.click(buton);

    await waitFor(() => expect(api.current?.sendBulkEmail).toHaveBeenCalled());
    const meta = api.current!.sendBulkEmail.mock.calls.at(-1)![2];
    expect(meta?.onceKey).toBe(cheieDifuzare(5, 'participanti', subiect));
  });

  it('o difuzare deja plecată blochează butonul și cere deblocare explicită', async () => {
    const { container } = monteaza([
      {
        id: 'e1',
        created_at: '2026-08-20T12:00:00Z',
        email: 'ana@exemplu.ro',
        nume: 'Ana',
        subiect: 'Detalii pentru sâmbătă',
        text_email: '',
        mod: 'admin',
        audienta: 'participanti',
        status: 'trimis',
        provider_status: 200,
        eroare: null,
        editie: 5,
      },
    ]);

    // `findByRole` întoarce butonul de îndată ce EXISTĂ, dar zăvorul se închide
    // abia după ce ajung șabloanele: subiectul curent vine din `listEmailTemplates`,
    // asincron (vezi nota din AdminEmailTab.tsx:84), iar până atunci e gol, deci
    // cheia de difuzare nu se potrivește cu cea din jurnal. Fără `waitFor` testul
    // e o cursă — trecea local și pica în CI, unde runner-ul e mai încărcat.
    const buton = (await screen.findByRole('button', {
      name: /Trimite email/,
    })) as HTMLButtonElement;
    await waitFor(() => expect(buton.disabled).toBe(true));
    expect(container.textContent).toContain('a plecat deja');

    const deblocare = screen.getByRole('button', { name: 'Trimite oricum' });
    fireEvent.click(deblocare);

    await waitFor(() => {
      const dupa = screen.getByRole('button', { name: /Trimite email/ }) as HTMLButtonElement;
      expect(dupa.disabled).toBe(false);
    });
  });

  it('deblocarea supraviețuiește încărcării asincrone a șabloanelor', async () => {
    // Șabloanele vin din DB după montare, deci subiectul trece din „" în textul
    // real. Cât timp jetonul de deblocare era ținut liber, tranziția asta îl
    // arunca tăcut și butonul se re-bloca sub degetul operatorului.
    monteaza([
      {
        id: 'e1',
        created_at: '2026-08-20T12:00:00Z',
        email: 'ana@exemplu.ro',
        nume: 'Ana',
        subiect: 'Detalii pentru sâmbătă',
        text_email: '',
        mod: 'admin',
        audienta: 'participanti',
        status: 'trimis',
        provider_status: 200,
        eroare: null,
        editie: 5,
      },
    ]);

    // Deblochează DUPĂ ce subiectul s-a stabilizat pe cel din șablon.
    await screen.findByDisplayValue('Detalii pentru sâmbătă');
    fireEvent.click(screen.getByRole('button', { name: 'Trimite oricum' }));

    const trimite = screen.getByRole('button', { name: /Trimite email/ }) as HTMLButtonElement;
    await waitFor(() => expect(trimite.disabled).toBe(false));

    fireEvent.click(trimite);
    await waitFor(() => expect(api.current?.sendBulkEmail).toHaveBeenCalled());

    // Cheia trimisă e cea cu suprascriere — altfel serverul ar refuza din nou.
    const meta = api.current!.sendBulkEmail.mock.calls.at(-1)![2];
    expect(meta?.onceKey).not.toBe(cheieDifuzare(5, 'participanti', 'Detalii pentru sâmbătă'));
    expect(meta?.onceKey).toContain(cheieDifuzare(5, 'participanti', 'Detalii pentru sâmbătă'));
  });

  it('fără trimitere anterioară nu apare niciun avertisment', async () => {
    const { container } = monteaza([]);
    await screen.findByRole('button', { name: /Trimite email/ });
    expect(container.textContent).not.toContain('a plecat deja');
  });
});
