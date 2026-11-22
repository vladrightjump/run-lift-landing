import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { GiveawayPage } from './GiveawayPage';
import { formResponse } from '../../../../tests/support/publicForms';
import { raspunde } from '../../../../tests/support/linkEmail';
import { publicGiveaway } from '../../../../tests/support/builders/public';

vi.mock('../content', () => ({
  continutGiveaway: (slug: string) =>
    slug === 'toamna'
      ? {
          titlu: 'Giveaway de toamnă',
          premiu: 'Un abonament de trei luni la antrenamentele din parc.',
          produse: [],
          sponsor: { nume: 'Sponsor Sport', logo: '/giveaway/sponsor.svg' },
          conditii: [
            { text: 'Urmărește @runlift.md', url: 'https://instagram.com/runlift.md' },
            { text: 'Urmărește @sponsor.sport', url: 'https://instagram.com/sponsor.sport' },
          ],
          regulament: [
            { titlu: 'Cine poate participa', paragrafe: ['Orice persoană de peste 18 ani din Republica Moldova.'] },
          ],
        }
      : null,
}));

afterEach(cleanup);

const completeaza = (over: Record<string, string> = {}) => {
  const valori = {
    'Nume și prenume': 'Ana Popescu',
    Telefon: '069 123 456',
    Email: 'ana@exemplu.ro',
    Instagram: '@Ana.Run',
    ...over,
  };
  for (const [eticheta, value] of Object.entries(valori)) {
    fireEvent.change(screen.getByLabelText(eticheta), { target: { value } });
  }
};

const bifeazaRegulamentul = () => fireEvent.click(screen.getByRole('checkbox', { name: /accept regulamentul/i }));
const trimite = () => fireEvent.click(screen.getByRole('button', { name: 'Intră în giveaway' }));

const deschis = async (over: Parameters<typeof publicGiveaway>[0] = {}) => {
  raspunde('public_giveaway', { body: publicGiveaway({ ...over, stare: 'deschis' }) });
  render(<GiveawayPage />);
  await screen.findByRole('button', { name: 'Intră în giveaway' });
};

describe('pagina /giveaway — stările giveaway-ului', () => {
  it('programat: arată premiul și când încep înscrierile, fără formular', async () => {
    raspunde('public_giveaway', {
      body: publicGiveaway({ stare: 'programat', starts_at: '2026-11-20T08:00:00Z' }),
    });
    render(<GiveawayPage />);

    await screen.findByRole('heading', { name: 'Giveaway de toamnă' });
    expect(screen.getByText(/Înscrierile încep pe 20 noiembrie 2026/)).toBeDefined();
    expect(screen.getByText(/abonament de trei luni/)).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Intră în giveaway' })).toBeNull();
  });

  it('deschis: arată întâi formularul și păstrează datele la consultarea detaliilor', async () => {
    await deschis();

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Înscrie-te la giveaway');
    const detalii = screen.getByText('Premiul și pașii de participare', { exact: true });
    expect(detalii.closest('details')?.open).toBe(false);
    const nume = screen.getByLabelText<HTMLInputElement>('Nume și prenume');
    fireEvent.change(nume, { target: { value: 'Ana Popescu' } });
    const bifa = screen.getByRole<HTMLInputElement>('checkbox', { name: /accept regulamentul/i });
    fireEvent.click(bifa);

    fireEvent.click(detalii);
    expect(screen.getByText(/abonament de trei luni/)).toBeDefined();
    expect(screen.getByRole('img', { name: 'Sponsor Sport' }).getAttribute('src')).toBe('/giveaway/sponsor.svg');
    expect(screen.getByText(/1 noiembrie 2026/)).toBeDefined();
    expect(screen.getByText(/30 noiembrie 2026/)).toBeDefined();
    expect(screen.getByRole('link', { name: 'Urmărește @sponsor.sport' })).toBeDefined();
    fireEvent.click(detalii);
    expect(detalii.closest('details')?.open).toBe(false);

    for (const eticheta of ['Nume și prenume', 'Telefon', 'Email', 'Instagram']) {
      expect(screen.getByLabelText(eticheta)).toBeDefined();
    }
    expect(screen.getAllByRole('checkbox')).toHaveLength(2);
    expect(screen.getByRole('link', { name: 'regulamentul' }).getAttribute('href')).toBe('#regulament');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(nume.value).toBe('Ana Popescu');
    expect(bifa.checked).toBe(true);
  });

  it('închis: spune că înscrierile s-au încheiat, fără formular', async () => {
    raspunde('public_giveaway', { body: publicGiveaway({ stare: 'inchis' }) });
    render(<GiveawayPage />);

    await screen.findByText(/Înscrierile s-au încheiat/);
    expect(screen.queryByRole('button', { name: 'Intră în giveaway' })).toBeNull();
  });

  it('fără niciun giveaway spune că nu e niciunul activ', async () => {
    raspunde('public_giveaway', { body: null });
    render(<GiveawayPage />);
    await screen.findByRole('heading', { name: /niciun giveaway activ/i });
  });

  it('un giveaway fără texte în cod arată tot „niciun giveaway activ"', async () => {
    raspunde('public_giveaway', { body: publicGiveaway({ slug: 'fara-continut', stare: 'deschis' }) });
    render(<GiveawayPage />);
    await screen.findByRole('heading', { name: /niciun giveaway activ/i });
    expect(screen.queryByRole('button', { name: 'Intră în giveaway' })).toBeNull();
  });

  it('o citire eșuată arată un mesaj și reîncearcă la cerere', async () => {
    const stricat = raspunde('public_giveaway', { status: 500, brut: 'boom' });
    render(<GiveawayPage />);
    await screen.findByText(/Nu am putut încărca giveaway-ul/);
    expect(stricat.numar).toBe(1);

    raspunde('public_giveaway', { body: publicGiveaway({ stare: 'deschis' }) });
    fireEvent.click(screen.getByRole('button', { name: 'Încearcă din nou' }));
    await screen.findByRole('button', { name: 'Intră în giveaway' });
  });
});

describe('pagina /giveaway — înscrierea', () => {
  it('o trimitere validă arată confirmarea și pleacă prin poarta anti-bot', async () => {
    const cereri = formResponse();
    await deschis();
    completeaza();
    bifeazaRegulamentul();
    trimite();

    await screen.findByRole('heading', { name: /Ești în giveaway/ });
    expect(cereri.bodies[0]).toMatchObject({
      mode: 'giveaway',
      hp: '',
      data: {
        nume: 'Ana Popescu',
        telefon: '069123456',
        email: 'ana@exemplu.ro',
        instagram: 'ana.run',
        acord_regulament: true,
        acord_contact: false,
      },
    });
  });

  it('acordul de contact bifat pleacă odată cu participarea', async () => {
    const cereri = formResponse();
    await deschis();
    completeaza();
    bifeazaRegulamentul();
    fireEvent.click(screen.getByRole('checkbox', { name: /vești despre evenimente/i }));
    trimite();

    await screen.findByRole('heading', { name: /Ești în giveaway/ });
    expect(cereri.bodies[0]).toMatchObject({ data: { acord_contact: true } });
  });

  it('fără bifa de regulament cere bifa și nu trimite nimic', async () => {
    const cereri = formResponse();
    await deschis();
    completeaza();
    trimite();

    expect((await screen.findByRole('alert')).textContent).toMatch(/accepți regulamentul/);
    expect(cereri.count).toBe(0);
  });

  it.each([
    ['Telefon', '06950'],
    ['Email', 'ana@exemplu'],
    ['Instagram', 'ana run'],
  ])('un câmp greșit (%s) oprește trimiterea și își păstrează valoarea', async (eticheta, valoare) => {
    const cereri = formResponse();
    await deschis();
    completeaza({ [eticheta]: valoare });
    bifeazaRegulamentul();
    trimite();

    expect((await screen.findByRole('alert')).textContent).toMatch(/Verifică câmpurile/);
    expect(cereri.count).toBe(0);
    expect((screen.getByLabelText(eticheta) as HTMLInputElement).value).toBe(valoare);
    expect(screen.getByLabelText(eticheta).getAttribute('aria-invalid')).toBe('true');
  });

  it('un link de profil lipit în câmpul de Instagram pleacă drept cont simplu', async () => {
    const cereri = formResponse();
    await deschis();
    completeaza({ Instagram: 'https://www.instagram.com/ana.run/' });
    bifeazaRegulamentul();
    trimite();

    await screen.findByRole('heading', { name: /Ești în giveaway/ });
    expect(cereri.bodies[0]).toMatchObject({ data: { instagram: 'ana.run' } });
  });

  it('o dublură (409) spune că persoana e deja înscrisă', async () => {
    formResponse({ status: 409, text: '{"code":"23505","message":"duplicate key"}' });
    await deschis();
    completeaza();
    bifeazaRegulamentul();
    trimite();

    await screen.findByRole('heading', { name: /Ești deja în giveaway/ });
    expect(screen.queryByRole('heading', { name: /^Ești în giveaway/ })).toBeNull();
  });

  it('un refuz „giveaway închis" înlocuiește formularul cu mesajul de închidere', async () => {
    formResponse({ status: 400, text: '{"code":"P0001","message":"giveaway_inchis"}' });
    await deschis({ ends_at: 'infinity' });
    expect(screen.getByText(/Anunțăm pe Instagram când se vor închide înscrierile/)).toBeDefined();
    completeaza();
    bifeazaRegulamentul();
    trimite();

    await screen.findByText(/Înscrierile s-au încheiat/);
    expect(screen.queryByText(/Anunțăm pe Instagram când se vor închide înscrierile/)).toBeNull();
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Intră în giveaway' })).toBeNull());
  });

  it('un refuz „giveaway neînceput" nu spune că înscrierile s-au încheiat', async () => {
    formResponse({ status: 400, text: '{"code":"P0001","message":"giveaway_neinceput"}' });
    await deschis();
    completeaza();
    bifeazaRegulamentul();
    trimite();

    expect((await screen.findByRole('alert')).textContent).toMatch(/nu sunt deschise acum/);
    expect(screen.queryByText(/Înscrierile s-au încheiat/)).toBeNull();
  });

  it('o respingere anti-bot arată mesajul ei și lasă formularul completat', async () => {
    formResponse({ status: 403, text: '{"error":"captcha_failed"}' });
    await deschis();
    completeaza();
    bifeazaRegulamentul();
    trimite();

    expect((await screen.findByRole('alert')).textContent).toMatch(/Verificarea anti-bot/);
    expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe('ana@exemplu.ro');
  });

  it('un eșec de server păstrează datele și permite reîncercarea', async () => {
    const cereri = formResponse({ status: 500, text: 'failed' });
    await deschis();
    completeaza();
    bifeazaRegulamentul();
    trimite();

    expect((await screen.findByRole('alert')).textContent).toMatch(/Nu am putut trimite/);
    expect(cereri.count).toBe(1);
    expect((screen.getByLabelText('Nume și prenume') as HTMLInputElement).value).toBe('Ana Popescu');
  });
});
