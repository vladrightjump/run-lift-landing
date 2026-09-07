// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';

/**
 * Previzualizarea HTML a șabloanelor.
 *
 * O previzualizare de TEXT exista deja, în tabul „Emailuri". Gaura era exact
 * HTML-ul randat — adică singurul loc unde se strică lucrurile: un link rupt sau
 * o variabilă necompletată nu se văd în textul brut, care are `{prenume}` în el
 * prin construcție.
 *
 * Randarea propriu-zisă stă în funcția Edge (Deno, deployată separat, în afara
 * suitei) și se verifică prin previzualizarea fiecărui șablon din backoffice.
 * Aici se păzește contractul dinspre client: ce cere, ce arată, și — mai ales —
 * ce NU face.
 */

const { listEmailTemplates, listRegistrations, previewEmailHtml, saveEmailTemplate } = vi.hoisted(
  () => ({
    listEmailTemplates: vi.fn(),
    listRegistrations: vi.fn(),
    previewEmailHtml: vi.fn(),
    saveEmailTemplate: vi.fn(),
  })
);

vi.mock('../../src/lib/adminApi', () => ({
  listEmailTemplates,
  listRegistrations,
  previewEmailHtml,
  saveEmailTemplate,
}));

const { AdminTemplatesTab } = await import('../../src/admin/AdminTemplatesTab');
const { FurnizorSesiuneAdmin } = await import('../../src/admin/adminSession');

const SABLON = {
  cheie: 'bulk_participant_reminder',
  subiect: 'Mâine alergăm',
  text_email: 'Salut, {prenume}!\n\nEliberează-ți locul aici:\n{link_renunt}',
  actualizat_la: '2026-09-01T10:00:00Z',
};

const PARTICIPANT = {
  id: 'r1',
  created_at: '2026-08-20T10:00:00Z',
  nume: 'Ana Popescu',
  telefon: '+37360000000',
  email: 'ana@exemplu.ro',
  echipa: '',
  editie: 5,
  dezabonat_la: null,
};

const PREVIEW = {
  html: '<!doctype html><html><body><p>Salut, Ana!</p><a href="https://parktraining.fit/renunt?token=abc">renunț</a></body></html>',
  subiect: 'Mâine alergăm',
  pentru: { email: 'ana@exemplu.ro', nume: 'Ana Popescu' },
};

const randeaza = () => {
  listEmailTemplates.mockResolvedValue([SABLON]);
  listRegistrations.mockResolvedValue([PARTICIPANT]);
  previewEmailHtml.mockResolvedValue(PREVIEW);
  return render(
    <FurnizorSesiuneAdmin token="t" onAuthError={() => false} showToast={() => {}}>
      <AdminTemplatesTab />
    </FurnizorSesiuneAdmin>
  );
};

const cadru = (): HTMLIFrameElement | null =>
  document.querySelector('.admin-tpl-preview-frame') as HTMLIFrameElement | null;

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('AdminTemplatesTab — previzualizarea HTML', () => {
  it('cere randarea șablonului apăsat, nu a altuia', async () => {
    randeaza();
    fireEvent.click(await screen.findByRole('button', { name: 'Previzualizează' }));

    await waitFor(() => expect(previewEmailHtml).toHaveBeenCalled());
    const [, cheie] = previewEmailHtml.mock.calls.at(-1)!;
    expect(cheie).toBe('bulk_participant_reminder');
  });

  it('arată HTML-ul întors într-un iframe izolat', async () => {
    randeaza();
    fireEvent.click(await screen.findByRole('button', { name: 'Previzualizează' }));

    await waitFor(() => expect(cadru()).not.toBeNull());
    expect(cadru()!.getAttribute('srcdoc')).toContain('Salut, Ana!');
  });

  it('iframe-ul e sandboxat, ca randarea să nu atingă documentul gazdă', async () => {
    randeaza();
    fireEvent.click(await screen.findByRole('button', { name: 'Previzualizează' }));

    await waitFor(() => expect(cadru()).not.toBeNull());
    // `sandbox=""` — fără scripturi, fără forme, fără navigare. Prezența
    // atributului e ce contează; conținutul gol e cea mai strictă valoare.
    expect(cadru()!.hasAttribute('sandbox')).toBe(true);
    expect(cadru()!.getAttribute('sandbox')).toBe('');
  });

  it('spune pentru CINE s-au completat variabilele', async () => {
    randeaza();
    fireEvent.click(await screen.findByRole('button', { name: 'Previzualizează' }));

    expect(await screen.findByText(/Ana Popescu \(ana@exemplu\.ro\)/)).toBeTruthy();
  });

  it('destinatarul ales ajunge în cerere', async () => {
    randeaza();
    fireEvent.click(await screen.findByRole('button', { name: 'Previzualizează' }));
    await waitFor(() => expect(cadru()).not.toBeNull());

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'ana@exemplu.ro' } });

    await waitFor(() => expect(previewEmailHtml).toHaveBeenCalledTimes(2));
    const [, , email] = previewEmailHtml.mock.calls.at(-1)!;
    expect(email).toBe('ana@exemplu.ro');
  });

  it('previzualizarea nu salvează și nu trimite nimic', async () => {
    randeaza();
    fireEvent.click(await screen.findByRole('button', { name: 'Previzualizează' }));

    await waitFor(() => expect(cadru()).not.toBeNull());
    expect(saveEmailTemplate).not.toHaveBeenCalled();
  });

  it('cu modificări nesalvate butonul e inert — ar randa altceva decât ce pleacă', async () => {
    randeaza();
    await screen.findByRole('button', { name: 'Previzualizează' });
    fireEvent.change(screen.getByDisplayValue(SABLON.subiect), {
      target: { value: 'Alt subiect' },
    });

    expect(
      (screen.getByRole('button', { name: 'Previzualizează' }) as HTMLButtonElement).disabled
    ).toBe(true);
  });

  it('o ediție fără destinatari spune de ce n-are ce randa', async () => {
    randeaza();
    previewEmailHtml.mockRejectedValueOnce(new Error('Supabase 404: {"error":"no_recipient"}'));
    fireEvent.click(await screen.findByRole('button', { name: 'Previzualizează' }));

    expect(await screen.findByText(/niciun destinatar înscris/)).toBeTruthy();
    expect(cadru()).toBeNull();
  });

  it('un eșec de randare nu lasă un cadru gol care pare emailul real', async () => {
    randeaza();
    previewEmailHtml.mockRejectedValueOnce(new Error('Supabase 500: boom'));
    fireEvent.click(await screen.findByRole('button', { name: 'Previzualizează' }));

    expect(await screen.findByText(/Nu am putut randa/)).toBeTruthy();
    expect(cadru()).toBeNull();
  });

  it('„Închide" retrage previzualizarea', async () => {
    randeaza();
    fireEvent.click(await screen.findByRole('button', { name: 'Previzualizează' }));
    await waitFor(() => expect(cadru()).not.toBeNull());

    fireEvent.click(screen.getByRole('button', { name: 'Închide' }));
    expect(cadru()).toBeNull();
  });
});

describe('AdminTemplatesTab — cursele previzualizării', () => {
  it('un răspuns întârziat al unei cereri anterioare nu calcă peste cea curentă', async () => {
    // Fără gardă de ordine, HTML-ul altcuiva — cu linkurile și tokenurile lui —
    // ar rămâne pe ecran sub un select care arată alt nume.
    const ALT = { ...PARTICIPANT, id: 'r2', nume: 'Radu Vasile', email: 'radu@exemplu.ro' };
    listEmailTemplates.mockResolvedValue([SABLON]);
    listRegistrations.mockResolvedValue([PARTICIPANT, ALT]);

    let rezolvaPrima: ((v: typeof PREVIEW) => void) | null = null;
    previewEmailHtml
      .mockImplementationOnce(() => new Promise((res) => { rezolvaPrima = res; }))
      .mockResolvedValue({ ...PREVIEW, pentru: { email: ALT.email, nume: ALT.nume } });

    render(
      <FurnizorSesiuneAdmin token="t" onAuthError={() => false} showToast={() => {}}>
        <AdminTemplatesTab />
      </FurnizorSesiuneAdmin>
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Previzualizează' }));
    // A doua cerere pleacă și se rezolvă înaintea primei.
    fireEvent.change(screen.getByRole('combobox'), { target: { value: ALT.email } });
    await screen.findByText(/Radu Vasile \(radu@exemplu\.ro\)/);

    // Abia acum aterizează prima, cu alt destinatar.
    rezolvaPrima!(PREVIEW);
    await waitFor(() => expect(previewEmailHtml).toHaveBeenCalledTimes(2));
    // Rândul „completat pentru …" e cel care spune ce s-a randat; `Radu Vasile`
    // singur ar prinde și opțiunea din select.
    expect(screen.getByText(/Radu Vasile \(radu@exemplu\.ro\)/)).toBeTruthy();
    expect(screen.queryByText(/Ana Popescu \(ana@exemplu\.ro\)/)).toBeNull();
  });

  it('un destinatar dezabonat între timp e numit ca atare, nu pus în seama ediției', async () => {
    // Selectul listează participanții (dezabonații incluși); serverul îi caută
    // în `edition2_recipients`, care îi filtrează. Un singur mesaj pentru ambele
    // stări ar afirma ceva fals despre ediție.
    randeaza();
    previewEmailHtml.mockRejectedValueOnce(
      new Error('Supabase 404: {"error":"recipient_not_eligible"}')
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Previzualizează' }));

    expect(await screen.findByText(/nu mai e destinatar al ediției/)).toBeTruthy();
    expect(screen.queryByText(/niciun destinatar înscris/)).toBeNull();
  });
});
