// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import type { AdminEmailLogEntry } from '../../src/lib/adminApi';

/**
 * Anunțul către toți participanții de până acum, din tabul „Emailuri".
 *
 * Contractul dinspre client: ce cere de la server, ce trimite înapoi, și ce NU
 * lasă să plece. Lista și compunerea per destinatar sunt ale funcției Edge și se
 * verifică pe producție; aici se păzește că butonul face exact ce spune.
 */

const api = vi.hoisted(() => ({
  listEmailTemplates: vi.fn(),
  previewAnunt: vi.fn(),
  trimiteAnunt: vi.fn(),
  trimiteTestAnunt: vi.fn(),
}));

vi.mock('../../src/lib/adminApi', async (importOriginal) => {
  // Clasele de eroare rămân cele reale: `motivEroareAnunt` le recunoaște după tip.
  const real = await importOriginal<typeof import('../../src/lib/adminApi')>();
  return { ...real, ...api };
});

const { AnuntIstoric } = await import('../../src/admin/AnuntIstoric');
const { FurnizorSesiuneAdmin } = await import('../../src/admin/adminSession');
const { AnuntError } = await import('../../src/lib/adminApi');
const { cheieDifuzare } = await import('../../src/admin/sendLock');

const showToast = vi.fn();

const LISTA = [
  { email: 'ana@exemplu.ro', nume: 'Ana Popescu', ultima_editie: 6 },
  { email: 'ion@exemplu.ro', nume: 'Ion Rusu', ultima_editie: 4 },
  { email: 'vio@exemplu.ro', nume: 'Vio Ceban', ultima_editie: 2 },
];

const SABLON = {
  cheie: 'bulk_participant_anunt',
  subiect: 'Ne vedem din nou? {numele_cursei}',
  text_email: 'Salut, {prenume}!\n\nS-au deschis înscrierile.',
  actualizat_la: '2026-09-17T10:00:00Z',
};

const monteaza = (emailLog: AdminEmailLogEntry[] = [], readOnly = false) =>
  render(
    <FurnizorSesiuneAdmin token="t" onAuthError={() => false} showToast={showToast}>
      <AnuntIstoric editie={7} emailLog={emailLog} readOnly={readOnly} audiente={null} />
    </FurnizorSesiuneAdmin>
  );

const butonTrimite = () =>
  screen.getByRole('button', { name: /Trimite anunțul/ }) as HTMLButtonElement;

/** Așteaptă lista ȘI șablonul — butonul e activ doar când le are pe amândouă. */
const asteaptaIncarcarea = async () => {
  await screen.findByText('Ana Popescu');
  await waitFor(() => expect(screen.getByDisplayValue(SABLON.subiect)).toBeTruthy());
};

beforeEach(() => {
  api.listEmailTemplates.mockResolvedValue([SABLON]);
  api.previewAnunt.mockResolvedValue({ total: LISTA.length, destinatari: LISTA });
  api.trimiteAnunt.mockResolvedValue({ sent: 3, failed: 0 });
  api.trimiteTestAnunt.mockResolvedValue({ sent: 1, failed: 0 });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('AnuntIstoric — lista vine de la server', () => {
  it('cere lista o singură dată și arată câți oameni sunt', async () => {
    monteaza();
    await asteaptaIncarcarea();
    expect(api.previewAnunt).toHaveBeenCalledTimes(1);
    expect(butonTrimite().textContent).toContain('(3)');
  });

  it('arată ultima ediție a fiecăruia, ca operatorul să-i recunoască', async () => {
    monteaza();
    expect(await screen.findByText(/ultima dată la ediția 4/)).toBeTruthy();
  });

  it('listă goală → mesajul dedicat și buton inactiv', async () => {
    api.previewAnunt.mockResolvedValue({ total: 0, destinatari: [] });
    monteaza();
    expect(await screen.findByText(/Nimeni de anunțat/)).toBeTruthy();
    expect(butonTrimite().disabled).toBe(true);
  });

  /**
   * `recipients_failed` apare cât timp migrarea nu e aplicată. Un mesaj generic
   * l-ar pune pe operator să reîncerce la nesfârșit ceva ce nu se repară singur.
   */
  it('eroarea de la server spune cauza și lasă butonul inactiv', async () => {
    api.previewAnunt.mockRejectedValue(new AnuntError(500, 'recipients_failed'));
    monteaza();
    expect(await screen.findByText(/migrarea anunțului nu e aplicată/)).toBeTruthy();
    expect(butonTrimite().disabled).toBe(true);
  });

  it('„Reîncearcă" cere lista din nou', async () => {
    api.previewAnunt.mockRejectedValueOnce(new AnuntError(500, 'recipients_failed'));
    monteaza();
    fireEvent.click(await screen.findByRole('button', { name: 'Reîncearcă' }));
    expect(await screen.findByText('Ana Popescu')).toBeTruthy();
    expect(api.previewAnunt).toHaveBeenCalledTimes(2);
  });
});

describe('AnuntIstoric — debifarea doar scoate', () => {
  it('debifarea scade numărul și ajunge în `exclude` la trimitere', async () => {
    monteaza();
    await asteaptaIncarcarea();
    fireEvent.click(screen.getByRole('checkbox', { name: /Ion Rusu/ }));
    expect(butonTrimite().textContent).toContain('(2)');

    fireEvent.click(butonTrimite());
    fireEvent.click(screen.getByRole('button', { name: 'Da, trimite' }));

    await waitFor(() => expect(api.trimiteAnunt).toHaveBeenCalled());
    expect(api.trimiteAnunt.mock.calls[0][1].exclude).toEqual(['ion@exemplu.ro']);
  });

  it('bifa de sus scoate pe toți — și butonul devine inactiv', async () => {
    monteaza();
    await asteaptaIncarcarea();
    fireEvent.click(screen.getByRole('checkbox', { name: /Toți participanții de până acum/ }));
    expect(butonTrimite().disabled).toBe(true);
  });
});

describe('AnuntIstoric — trimiterea', () => {
  it('cere confirmare, cu numărul exact, înainte să trimită', async () => {
    monteaza();
    await asteaptaIncarcarea();
    fireEvent.click(butonTrimite());
    expect(screen.getByRole('alertdialog').textContent).toContain('3');
    expect(api.trimiteAnunt).not.toHaveBeenCalled();
  });

  it('„Anulează" nu trimite nimic', async () => {
    monteaza();
    await asteaptaIncarcarea();
    fireEvent.click(butonTrimite());
    fireEvent.click(screen.getByRole('button', { name: 'Anulează' }));
    expect(api.trimiteAnunt).not.toHaveBeenCalled();
  });

  it('trimite subiectul NEcompletat și cheia derivată din audiența `istoric`', async () => {
    monteaza();
    await asteaptaIncarcarea();
    fireEvent.click(butonTrimite());
    fireEvent.click(screen.getByRole('button', { name: 'Da, trimite' }));

    await waitFor(() => expect(api.trimiteAnunt).toHaveBeenCalled());
    const date = api.trimiteAnunt.mock.calls[0][1];
    // Variabilele le completează serverul, per destinatar — nu clientul.
    expect(date.subiect).toBe(SABLON.subiect);
    expect(date.onceKey).toBe(cheieDifuzare(7, 'istoric', SABLON.subiect));
  });

  it('un zăvor refuzat spune că anunțul a plecat deja', async () => {
    api.trimiteAnunt.mockResolvedValue({ sent: 0, failed: 0, skipped: true });
    monteaza();
    await asteaptaIncarcarea();
    fireEvent.click(butonTrimite());
    fireEvent.click(screen.getByRole('button', { name: 'Da, trimite' }));
    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith(
        expect.objectContaining({ msg: expect.stringContaining('a plecat deja') })
      )
    );
  });

  it('o ediție de arhivă nu trimite', async () => {
    monteaza([], true);
    await asteaptaIncarcarea();
    expect(butonTrimite().disabled).toBe(true);
  });
});

describe('AnuntIstoric — ediția a mai fost anunțată', () => {
  const anterior: AdminEmailLogEntry = {
    id: 'l1',
    created_at: '2026-09-17T09:00:00Z',
    email: 'ana@exemplu.ro',
    nume: 'Ana Popescu',
    subiect: 'Alt subiect, cu variabilele completate',
    text_email: '',
    mod: 'anunt',
    audienta: 'istoric',
    sablon: 'bulk_participant_anunt',
    status: 'trimis',
    provider_status: 200,
    eroare: null,
    editie: 7,
  };

  it('blochează butonul și cere deblocare explicită', async () => {
    monteaza([anterior]);
    await asteaptaIncarcarea();
    expect(screen.getByText(/a fost deja anunțată/)).toBeTruthy();
    expect(butonTrimite().disabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Trimite oricum' }));
    expect(butonTrimite().disabled).toBe(false);
  });
});

describe('AnuntIstoric — testul către operator', () => {
  it('butonul de test e inactiv pe o adresă invalidă', async () => {
    monteaza();
    await asteaptaIncarcarea();
    fireEvent.change(screen.getByPlaceholderText('adresa ta'), { target: { value: 'nu-e-email' } });
    expect(
      (screen.getByRole('button', { name: 'Trimite testul' }) as HTMLButtonElement).disabled
    ).toBe(true);
  });

  it('pe o adresă validă trimite testul doar acolo, fără să atingă lista', async () => {
    monteaza();
    await asteaptaIncarcarea();
    fireEvent.change(screen.getByPlaceholderText('adresa ta'), {
      target: { value: 'eu@exemplu.ro' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Trimite testul' }));

    await waitFor(() => expect(api.trimiteTestAnunt).toHaveBeenCalled());
    expect(api.trimiteTestAnunt.mock.calls[0][1].catre).toBe('eu@exemplu.ro');
    expect(api.trimiteAnunt).not.toHaveBeenCalled();
  });
});

describe('AnuntIstoric — variabilele pe care serverul nu le completează', () => {
  it('le semnalează înainte de trimitere', async () => {
    monteaza();
    await asteaptaIncarcarea();
    fireEvent.change(screen.getByPlaceholderText('Scrie anunțul aici…'), {
      target: { value: 'Te-ai înscris pe {data_inscrierii}.' },
    });
    expect(screen.getByText(/nu se completează într-un anunț/)).toBeTruthy();
  });
});
