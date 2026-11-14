import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { EcranGiveaway } from './EcranGiveaway';
import { FurnizorSesiuneAdmin } from '../../data/adminSession';
import { raspunde } from '../../../../../tests/support/linkEmail';
import { dateGiveaway, participareGiveaway } from '../../../../../tests/support/builders/giveaway';

/**
 * Ecranul Giveaway din admin (planul
 * docs/plans/2026-11-14-0736-feat-giveaway-instagram-plan.md, U5 și U6).
 *
 * Testele stau la granița rețelei: verifică ce cere ecranul de la server și ce
 * arată din răspuns, nu apelurile dintre fișierele lui.
 */

const toast = vi.fn();
const admin = () =>
  render(
    <FurnizorSesiuneAdmin token="token" onAuthError={() => false} showToast={toast}>
      <EcranGiveaway />
    </FurnizorSesiuneAdmin>
  );

beforeEach(() => toast.mockReset());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const ana = () =>
  participareGiveaway({
    id: 'p-ana',
    nume: 'Ana Popescu',
    telefon: '069123456',
    email: 'ana@exemplu.ro',
    instagram: 'ana.run',
    acord_contact: true,
  });
const ion = () => participareGiveaway({ id: 'p-ion', nume: 'Ion Rusu', instagram: 'ion.r' });
const maria = () => participareGiveaway({ id: 'p-maria', nume: 'Maria Ceban', instagram: 'maria.c' });

const dialog = () => within(screen.getByRole('alertdialog'));
const extragere = () => within(screen.getByRole('region', { name: 'Extragere' }));

describe('ecranul Giveaway — lista', () => {
  it('arată numărul de participări și fiecare rând cu datele din formular', async () => {
    raspunde('admin_giveaway_date', { body: dateGiveaway({ participari: [ana(), ion(), maria()] }) });
    admin();

    const rand = within((await screen.findByText('Ana Popescu')).closest('[data-css~="admin-row"]') as HTMLElement);
    expect(within(screen.getByText('Participări').parentElement as HTMLElement).getByText('3')).toBeDefined();
    expect(within(screen.getByText('Cu acord de contact').parentElement as HTMLElement).getByText('1')).toBeDefined();
    expect(rand.getByRole('link', { name: '069123456' }).getAttribute('href')).toBe('tel:069123456');
    expect(rand.getByRole('link', { name: 'ana@exemplu.ro' }).getAttribute('href')).toBe('mailto:ana@exemplu.ro');
    expect(rand.getByRole('link', { name: '@ana.run' }).getAttribute('href')).toBe('https://www.instagram.com/ana.run/');
    expect(rand.getByText('Da')).toBeDefined();
    expect(rand.getByText(/10 nov/)).toBeDefined();
    expect(screen.getAllByText('Nu')).toHaveLength(2);
  });

  it('fără niciun giveaway spune asta și nu arată lista', async () => {
    raspunde('admin_giveaway_date', { body: dateGiveaway({ giveaway: null }) });
    admin();
    await screen.findByText(/Niciun giveaway încă/);
    expect(screen.queryByRole('button', { name: 'Export CSV' })).toBeNull();
  });

  it('cu un singur giveaway nu arată selectorul', async () => {
    raspunde('admin_giveaway_date', { body: dateGiveaway({ participari: [ana()] }) });
    admin();
    await screen.findByText('Ana Popescu');
    expect(screen.queryByLabelText('Giveaway')).toBeNull();
  });

  it('cu două giveaway-uri, selectorul îl deschide pe cel vechi', async () => {
    const amandoua = [
      { id: 'gw-2', slug: 'iarna', titlu: 'Giveaway de iarnă', stare: 'deschis' as const },
      { id: 'gw-1', slug: 'toamna', titlu: 'Giveaway de toamnă', stare: 'confirmat' as const },
    ];
    const cereri = raspunde('admin_giveaway_date', {
      body: dateGiveaway({
        giveaway: { id: 'gw-2', slug: 'iarna', titlu: 'Giveaway de iarnă', stare: 'deschis' },
        giveaways: amandoua,
        participari: [ion()],
      }),
    });
    admin();
    await screen.findByText('Ion Rusu');
    expect(cereri.corpuri[0]).toEqual({ p_token: 'token', p_giveaway_id: null });

    const vechi = raspunde('admin_giveaway_date', {
      body: dateGiveaway({ giveaway: { stare: 'confirmat' }, giveaways: amandoua, participari: [ana()] }),
    });
    fireEvent.change(screen.getByLabelText('Giveaway'), { target: { value: 'gw-1' } });

    await screen.findByText('Ana Popescu');
    expect(vechi.corpuri[0]).toEqual({ p_token: 'token', p_giveaway_id: 'gw-1' });
    expect(screen.queryByText('Ion Rusu')).toBeNull();
  });

  it('ștergerea cere confirmare, iar renunțarea nu cere nimic de la server', async () => {
    raspunde('admin_giveaway_date', { body: dateGiveaway({ participari: [ana()] }) });
    const stergeri = raspunde('admin_giveaway_sterge', { body: null });
    admin();

    fireEvent.click(await screen.findByRole('button', { name: 'Șterge participarea lui Ana Popescu' }));
    expect(dialog().getByText(/definitivă/)).toBeDefined();
    fireEvent.click(dialog().getByRole('button', { name: 'Păstrează' }));

    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(stergeri.numar).toBe(0);
  });

  it('confirmarea șterge participarea și reîncarcă lista fără ea', async () => {
    raspunde('admin_giveaway_date', { body: dateGiveaway({ participari: [ana(), ion()] }) });
    const stergeri = raspunde('admin_giveaway_sterge', { body: null });
    admin();

    fireEvent.click(await screen.findByRole('button', { name: 'Șterge participarea lui Ana Popescu' }));
    raspunde('admin_giveaway_date', { body: dateGiveaway({ participari: [ion()] }) });
    fireEvent.click(dialog().getByRole('button', { name: 'Șterge definitiv' }));

    await waitFor(() => expect(screen.queryByText('Ana Popescu')).toBeNull());
    expect(stergeri.corpuri[0]).toEqual({ p_token: 'token', p_id: 'p-ana' });
    expect(screen.getByText('Ion Rusu')).toBeDefined();
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ kind: 'success' }));
  });

  it('un refuz al serverului arată mesajul lui și lasă lista neschimbată', async () => {
    raspunde('admin_giveaway_date', { body: dateGiveaway({ participari: [ana()] }) });
    raspunde('admin_giveaway_sterge', { status: 400, brut: '{"code":"P0001","message":"participare_inexistenta"}' });
    admin();

    fireEvent.click(await screen.findByRole('button', { name: 'Șterge participarea lui Ana Popescu' }));
    fireEvent.click(dialog().getByRole('button', { name: 'Șterge definitiv' }));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith({ kind: 'error', msg: 'Participarea nu mai există.' })
    );
    expect(screen.getByText('Ana Popescu')).toBeDefined();
  });

  it('exportul scrie un antet și câte un rând, cu acordul de contact pe coloana lui', async () => {
    let fisier: Blob | null = null;
    vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
      fisier = blob as Blob;
      return 'blob:test';
    });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    raspunde('admin_giveaway_date', { body: dateGiveaway({ participari: [ana(), ion()] }) });
    admin();

    fireEvent.click(await screen.findByRole('button', { name: 'Export CSV' }));

    // Blob-ul din jsdom n-are `.text()`.
    const text = await new Promise<string>((gata) => {
      const cititor = new FileReader();
      cititor.onload = () => gata(String(cititor.result));
      cititor.readAsText(fisier!);
    });
    const randuri = text.replace(/^﻿/, '').split('\n');
    expect(randuri).toHaveLength(3);
    expect(randuri[0]).toContain('"Acord de contact"');
    expect(randuri[1]).toContain('"Ana Popescu"');
    expect(randuri[1]).toContain('"da"');
    expect(randuri[2]).toContain('"Ion Rusu"');
    expect(randuri[2]).toContain('"nu"');
  });

  it('o primă încărcare eșuată spune asta și se poate reîncerca', async () => {
    raspunde('admin_giveaway_date', { status: 500, brut: 'boom' });
    admin();
    await screen.findByText(/Nu s-a putut încărca giveaway-ul/);

    raspunde('admin_giveaway_date', { body: dateGiveaway({ participari: [ana()] }) });
    fireEvent.click(screen.getByRole('button', { name: 'Reîncearcă' }));
    await screen.findByText('Ana Popescu');
  });
});

describe('ecranul Giveaway — extragerea și încheierea', () => {
  it('cât înscrierile sunt deschise, spune când se închid și nu oferă extragerea', async () => {
    raspunde('admin_giveaway_date', {
      body: dateGiveaway({ giveaway: { stare: 'deschis' }, participari: [ana()] }),
    });
    admin();

    await screen.findByText('Ana Popescu');
    expect(extragere().getByText(/Înscrierile se închid pe 30 noiembrie 2026/)).toBeDefined();
    expect(extragere().queryByRole('button')).toBeNull();
  });

  it('după închidere, extragerea cere serverului un nume și îl arată', async () => {
    raspunde('admin_giveaway_date', { body: dateGiveaway({ participari: [ana(), ion()] }) });
    const extrageri = raspunde('admin_giveaway_extrage', { body: 'p-ion' });
    admin();

    const buton = await screen.findByRole('button', { name: 'Extrage câștigătorul' });
    raspunde('admin_giveaway_date', {
      body: dateGiveaway({
        giveaway: { stare: 'extras' },
        participari: [ana(), { ...ion(), extrasa_la: '2026-12-01T10:00:00Z' }],
      }),
    });
    fireEvent.click(buton);

    await waitFor(() => expect(extragere().getByText('Ion Rusu')).toBeDefined());
    expect(extrageri.corpuri[0]).toEqual({ p_token: 'token', p_giveaway_id: 'gw-1' });
    expect(extragere().getByText(/Extrasă pe 1 decembrie 2026/)).toBeDefined();
    expect(extragere().getByRole('button', { name: 'Confirmă câștigătorul' })).toBeDefined();
  });

  it('reextragerea cere confirmare, apoi arată noua persoană și o marchează pe cea dinainte', async () => {
    raspunde('admin_giveaway_date', {
      body: dateGiveaway({
        giveaway: { stare: 'extras' },
        participari: [ana(), { ...ion(), extrasa_la: '2026-12-01T10:00:00Z' }],
      }),
    });
    const extrageri = raspunde('admin_giveaway_extrage', { body: 'p-ana' });
    admin();

    fireEvent.click(await screen.findByRole('button', { name: 'Reextrage' }));
    expect(extrageri.numar).toBe(0);
    expect(dialog().getByText(/Ion Rusu nu mai poate fi ales/)).toBeDefined();

    raspunde('admin_giveaway_date', {
      body: dateGiveaway({
        giveaway: { stare: 'extras' },
        participari: [
          { ...ana(), extrasa_la: '2026-12-01T10:05:00Z' },
          { ...ion(), extrasa_la: '2026-12-01T10:00:00Z', inlocuita_la: '2026-12-01T10:05:00Z' },
        ],
      }),
    });
    fireEvent.click(dialog().getByRole('button', { name: 'Reextrage acum' }));

    await waitFor(() => expect(extragere().getByText('Ana Popescu')).toBeDefined());
    expect(extrageri.numar).toBe(1);
    const randIon = within(screen.getByText('Ion Rusu').closest('[data-css~="admin-row"]') as HTMLElement);
    expect(randIon.getByText('Extrasă anterior')).toBeDefined();
  });

  it('când nu mai e nimeni de extras, spune asta', async () => {
    raspunde('admin_giveaway_date', { body: dateGiveaway({ participari: [] }) });
    raspunde('admin_giveaway_extrage', { status: 400, brut: '{"code":"P0001","message":"fara_participari"}' });
    admin();

    fireEvent.click(await screen.findByRole('button', { name: 'Extrage câștigătorul' }));
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith({ kind: 'error', msg: 'Nu mai e nicio participare de extras.' })
    );
  });

  it('confirmarea arată câștigătorul confirmat și oferă încheierea', async () => {
    const extras = { ...ion(), extrasa_la: '2026-12-01T10:00:00Z' };
    raspunde('admin_giveaway_date', { body: dateGiveaway({ giveaway: { stare: 'extras' }, participari: [ana(), extras] }) });
    const confirmari = raspunde('admin_giveaway_confirma', { body: null });
    admin();

    const buton = await screen.findByRole('button', { name: 'Confirmă câștigătorul' });
    raspunde('admin_giveaway_date', {
      body: dateGiveaway({
        giveaway: {
          stare: 'confirmat',
          castigator: { nume: 'Ion Rusu', instagram: 'ion.r', extras_la: '2026-12-01T10:00:00Z', confirmat_la: '2026-12-01T11:00:00Z' },
        },
        participari: [ana(), extras],
      }),
    });
    fireEvent.click(buton);

    await waitFor(() => expect(extragere().getByText('Câștigător confirmat')).toBeDefined());
    expect(confirmari.corpuri[0]).toEqual({ p_token: 'token', p_giveaway_id: 'gw-1' });
    expect(extragere().getByRole('button', { name: 'Încheie giveaway-ul' })).toBeDefined();
  });

  const confirmat = () =>
    dateGiveaway({
      giveaway: {
        stare: 'confirmat',
        castigator: { nume: 'Ion Rusu', instagram: 'ion.r', extras_la: '2026-12-01T10:00:00Z', confirmat_la: '2026-12-01T11:00:00Z' },
      },
      participari: [ana(), { ...ion(), extrasa_la: '2026-12-01T10:00:00Z' }, maria()],
    });

  it('reextragerea unui câștigător confirmat cere confirmare', async () => {
    raspunde('admin_giveaway_date', { body: confirmat() });
    const extrageri = raspunde('admin_giveaway_extrage', { body: 'p-maria' });
    admin();

    fireEvent.click(await screen.findByRole('button', { name: 'Reextrage' }));
    expect(dialog().getByText(/anulează confirmarea/)).toBeDefined();
    expect(extrageri.numar).toBe(0);

    raspunde('admin_giveaway_date', {
      body: dateGiveaway({
        giveaway: { stare: 'extras' },
        participari: [
          ana(),
          { ...ion(), extrasa_la: '2026-12-01T10:00:00Z', inlocuita_la: '2026-12-02T09:00:00Z' },
          { ...maria(), extrasa_la: '2026-12-02T09:00:00Z' },
        ],
      }),
    });
    fireEvent.click(dialog().getByRole('button', { name: 'Reextrage acum' }));

    await waitFor(() => expect(extragere().getByText('Maria Ceban')).toBeDefined());
    expect(extragere().getByRole('button', { name: 'Confirmă câștigătorul' })).toBeDefined();
  });

  it('încheierea spune câte participări se șterg și că pasul e ireversibil', async () => {
    raspunde('admin_giveaway_date', { body: confirmat() });
    const incheieri = raspunde('admin_giveaway_incheie', { body: 2 });
    admin();

    fireEvent.click(await screen.findByRole('button', { name: 'Încheie giveaway-ul' }));
    expect(dialog().getByText(/2 participări fără acord/)).toBeDefined();
    expect(dialog().getByText(/ireversibil/)).toBeDefined();
    fireEvent.click(dialog().getByRole('button', { name: 'Nu încă' }));

    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(incheieri.numar).toBe(0);
  });

  it('după încheiere arată totalul, contactele rămase și câștigătorul, fără extragere', async () => {
    raspunde('admin_giveaway_date', { body: confirmat() });
    const incheieri = raspunde('admin_giveaway_incheie', { body: 2 });
    admin();

    fireEvent.click(await screen.findByRole('button', { name: 'Încheie giveaway-ul' }));
    raspunde('admin_giveaway_date', {
      body: dateGiveaway({
        giveaway: {
          stare: 'incheiat',
          castigator: { nume: 'Ion Rusu', instagram: 'ion.r', extras_la: '2026-12-01T10:00:00Z', confirmat_la: '2026-12-01T11:00:00Z' },
          incheiat_la: '2026-12-05T12:00:00Z',
          total_participari: 3,
        },
        participari: [ana()],
      }),
    });
    fireEvent.click(dialog().getByRole('button', { name: 'Încheie definitiv' }));

    await waitFor(() => expect(extragere().getByText(/Giveaway încheiat/)).toBeDefined());
    expect(incheieri.corpuri[0]).toEqual({ p_token: 'token', p_giveaway_id: 'gw-1' });
    expect(extragere().getByText(/Au participat 3 persoane/)).toBeDefined();
    expect(extragere().getByText(/Ion Rusu/)).toBeDefined();
    expect(extragere().queryByRole('button')).toBeNull();
    expect(screen.getByText('Ana Popescu')).toBeDefined();
    expect(screen.queryByText('Maria Ceban')).toBeNull();
  });

  it('un refuz „deja încheiat" reîncarcă starea și spune ce s-a întâmplat', async () => {
    raspunde('admin_giveaway_date', { body: dateGiveaway({ participari: [ana()] }) });
    raspunde('admin_giveaway_extrage', { status: 400, brut: '{"code":"P0001","message":"giveaway_incheiat"}' });
    admin();

    const buton = await screen.findByRole('button', { name: 'Extrage câștigătorul' });
    raspunde('admin_giveaway_date', {
      body: dateGiveaway({ giveaway: { stare: 'incheiat', incheiat_la: '2026-12-05T12:00:00Z', total_participari: 1 }, participari: [ana()] }),
    });
    fireEvent.click(buton);

    await waitFor(() => expect(toast).toHaveBeenCalledWith({ kind: 'error', msg: 'Giveaway-ul e deja încheiat.' }));
    await waitFor(() => expect(extragere().getByText(/Giveaway încheiat/)).toBeDefined());
  });
});
