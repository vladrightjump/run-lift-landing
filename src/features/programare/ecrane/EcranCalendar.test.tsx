import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { HttpResponse } from 'msw';
import { server } from '../../../../tests/support/vitest.setup';
import { rpcHandler } from '../../../../tests/support/handlers';
import { atribuire, blocProgram, profilSportiv, program, ziProgram } from '../../../../tests/support/builders/programare';
import { FurnizorProgramare } from '../data/sesiune';
import type { DateCalendar } from '../data/tipuri';
import { EcranCalendar } from './EcranCalendar';

// Calendar sintetic, independent de programul importat.
const calendarDemo = (zilePeSaptamana = 5): DateCalendar => ({
  atribuire: atribuire({ data_start: '2026-09-07', data_sfarsit: zilePeSaptamana === 6 ? '2026-11-28' : '2026-11-29' }),
  zile: Array.from({ length: 12 }, (_saptamana, saptamana) => Array.from({ length: zilePeSaptamana }, (_, zi) => {
    const data = new Date(Date.UTC(2026, 8, 7 + saptamana * 7 + zi)).toISOString().slice(0, 10);
    return { ...ziProgram({ id: `zi-${saptamana}-${zi}`, saptamana: saptamana + 1, zi: zi + 1 }), data, stare: data > '2026-10-21' ? 'viitor' as const : 'nefăcut' as const };
  })).flat(),
  totaluri: { zile_antrenament: 12 * zilePeSaptamana, rezultate: 0, pr: 0 },
});
const monteaza = (parametri: string[] = []) => {
  const onNavigare = vi.fn();
  const onAuthError = vi.fn(() => true);
  render(<FurnizorProgramare sesiune={{ token: 'token-test', onAuthError, showToast: vi.fn() }}>
    <EcranCalendar parametri={parametri} onNavigare={onNavigare} />
  </FurnizorProgramare>);
  return { onNavigare, onAuthError };
};
const raspunde = (calendar = calendarDemo()) => server.use(
  rpcHandler('admin_prog_profil', () => HttpResponse.json(profilSportiv())),
  rpcHandler('admin_prog_programe', () => HttpResponse.json([program({ saptamani: 12, zile_pe_saptamana: 5, atribuiri: [calendar.atribuire] })])),
  rpcHandler('admin_prog_calendar', () => HttpResponse.json(calendar)),
);

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-21T09:00:00Z')); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('Calendarul atribuirii', () => {
  it('arată toate cele 12 săptămâni, cele 60 de antrenamente și weekendurile goale', async () => {
    raspunde();
    monteaza();
    const saptamani = await screen.findByRole('region', { name: 'Toate săptămânile atribuirii' });
    expect(within(saptamani).getAllByRole('heading', { name: /^Săptămâna / })).toHaveLength(12);
    expect(within(saptamani).getAllByRole('button')).toHaveLength(60);
    expect(within(saptamani).getAllByLabelText(/^Pauză, /)).toHaveLength(24);
    expect(screen.getByText('60', { selector: 'dd' })).toBeDefined();
    expect(screen.getByText('Zile de antrenament')).toBeDefined();
    expect(screen.getByText('Rezultate')).toBeDefined();
    expect(screen.getByText('PR-uri')).toBeDefined();
    expect(screen.getAllByText('0', { selector: 'dd' })).toHaveLength(2);
    expect(screen.getByRole('img', { name: 'Harta antrenamentelor în 2026' })).toBeDefined();
  });

  it('deschide o zi viitoare la primul bloc vizibil, inclusiv un bloc generic fără seturi', async () => {
    const calendar = calendarDemo();
    const zi = calendar.zile.find(z => z.data === '2026-11-27')!;
    zi.blocuri = [blocProgram({ id: 'ascuns', ordine: 1, ascuns: true }), blocProgram({ id: 'generic-vizibil', ordine: 2, tip: 'generic', seturi: [] })];
    raspunde(calendar);
    const { onNavigare } = monteaza();
    fireEvent.click(await screen.findByRole('button', { name: 'vineri, 27 noiembrie 2026, viitor' }));
    expect(onNavigare).toHaveBeenCalledWith('prog-azi', ['2026-11-27', 'generic-vizibil', '1', 'atribuire-1']);
    fireEvent.click(screen.getByRole('button', { name: 'luni, 7 septembrie 2026, nefăcut' }));
    expect(onNavigare).toHaveBeenLastCalledWith('prog-azi', ['2026-09-07', 'bloc-1', '1', 'atribuire-1']);
  });

  it('păstrează a șasea zi din sursă și limitele atribuirii, fără să inventeze o mască de cinci zile', async () => {
    raspunde(calendarDemo(6));
    const { onNavigare } = monteaza();
    const saptamani = await screen.findByRole('region', { name: 'Toate săptămânile atribuirii' });
    expect(within(saptamani).getAllByRole('button')).toHaveLength(72);
    fireEvent.click(within(saptamani).getByRole('button', { name: 'sâmbătă, 28 noiembrie 2026, viitor' }));
    expect(onNavigare).toHaveBeenCalledWith('prog-azi', ['2026-11-28', 'bloc-1', '1', 'atribuire-1']);
    expect(within(saptamani).queryByLabelText(/Pauză, duminică, 29 noiembrie/)).toBeNull();
    expect(within(saptamani).queryByRole('button', { name: /30 noiembrie/ })).toBeNull();
  });

  it('preferă profilul curent și permite alegerea atribuirii altui admin prin adresă', async () => {
    const calendar = calendarDemo();
    const alta = atribuire({ id: 'alta-atribuire', sportiv_id: 2, sportiv_nume: 'Alt sportiv' });
    const cereri: string[] = [];
    server.use(
      rpcHandler('admin_prog_profil', () => HttpResponse.json(profilSportiv())),
      rpcHandler('admin_prog_programe', () => HttpResponse.json([program({ atribuiri: [alta, calendar.atribuire] })])),
      rpcHandler('admin_prog_calendar', async ({ request }) => {
        const corp = await request.json() as { p_atribuire_id: string };
        cereri.push(corp.p_atribuire_id);
        return HttpResponse.json({ ...calendar, atribuire: corp.p_atribuire_id === alta.id ? alta : calendar.atribuire });
      }),
    );
    const { onNavigare } = monteaza();
    await screen.findByRole('region', { name: 'Toate săptămânile atribuirii' });
    expect(cereri).toEqual(['atribuire-1']);
    const selector = screen.getByLabelText('Sportiv și program') as HTMLSelectElement;
    expect(selector.value).toBe('atribuire-1');
    expect(within(selector).getByRole('option', { name: /Alt sportiv · Program sintetic/ })).toBeDefined();
    fireEvent.change(selector, { target: { value: alta.id } });
    expect(onNavigare).toHaveBeenCalledWith('prog-calendar', [alta.id, '2026']);
    cleanup();
    monteaza([alta.id, '2026']);
    await screen.findByRole('heading', { name: 'Alt sportiv · Calendar' });
    expect(cereri.at(-1)).toBe(alta.id);
  });

  it('schimbă anul hărții fără să ascundă săptămânile atribuirii din alt an', async () => {
    raspunde();
    const { onNavigare } = monteaza(['atribuire-1', '2024']);
    const harta = await screen.findByRole('img', { name: 'Harta antrenamentelor în 2024' });
    expect(harta.querySelectorAll('rect')).toHaveLength(366);
    expect(screen.getByRole('button', { name: 'luni, 7 septembrie 2026, nefăcut' })).toBeDefined();
    expect(screen.getByText('Toată atribuirea · 2026')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Anul anterior' }));
    expect(onNavigare).toHaveBeenCalledWith('prog-calendar', ['atribuire-1', '2023']);
    fireEvent.click(screen.getByRole('button', { name: 'Anul următor' }));
    expect(onNavigare).toHaveBeenLastCalledWith('prog-calendar', ['atribuire-1', '2025']);
  });

  it.each([
    { caz: 'preferă intervalul curent, inclusiv când începe azi', date: [['2026-01-05', '2026-03-28'], ['2026-10-21', '2026-11-28'], ['2027-01-05', '2027-03-28']], aleasa: 1 },
    { caz: 'include ultima zi a intervalului curent', date: [['2026-01-05', '2026-03-28'], ['2026-09-07', '2026-10-21'], ['2027-01-05', '2027-03-28']], aleasa: 1 },
    { caz: 'preferă cel mai recent start între intervale curente', date: [['2026-01-05', '2026-03-28'], ['2026-09-07', '2026-11-28'], ['2026-10-19', '2026-11-28']], aleasa: 2 },
    { caz: 'alege ultimul start când toate atribuirile sunt terminate', date: [['2026-01-05', '2026-03-28'], ['2026-05-04', '2026-07-25']], aleasa: 1 },
    { caz: 'alege ultimul start când toate atribuirile sunt viitoare', date: [['2026-11-02', '2027-01-23'], ['2027-01-05', '2027-03-28']], aleasa: 1 },
    { caz: 'alege ultimul start fără interval curent, între trecut și viitor', date: [['2026-01-05', '2026-03-28'], ['2027-01-05', '2027-03-28']], aleasa: 1 },
    { caz: 'păstrează legătura explicită la atribuirea terminată', date: [['2026-01-05', '2026-03-28'], ['2026-10-19', '2026-11-28']], aleasa: 0, explicita: true },
    { caz: 'păstrează prima atribuire ca rezervă fără atribuiri proprii', date: [['2026-01-05', '2026-03-28'], ['2026-10-19', '2026-11-28']], aleasa: 0, altSportiv: true },
  ])('$caz', async ({ date, aleasa, explicita, altSportiv }) => {
    const atribuiri = date.map(([data_start, data_sfarsit], index) => atribuire({ id: `atribuire-${index}`, sportiv_id: altSportiv ? 2 : 1, data_start, data_sfarsit }));
    const cereri: string[] = [];
    server.use(
      rpcHandler('admin_prog_profil', () => HttpResponse.json(profilSportiv())),
      rpcHandler('admin_prog_programe', () => HttpResponse.json([program({ atribuiri })])),
      rpcHandler('admin_prog_calendar', async ({ request }) => {
        const { p_atribuire_id } = await request.json() as { p_atribuire_id: string };
        cereri.push(p_atribuire_id);
        return HttpResponse.json({ atribuire: atribuiri.find(a => a.id === p_atribuire_id), zile: [], totaluri: { zile_antrenament: 0, rezultate: 0, pr: 0 } });
      }),
    );
    monteaza(explicita ? [atribuiri[aleasa].id] : []);
    await screen.findByRole('region', { name: 'Toate săptămânile atribuirii' });
    expect((screen.getByLabelText('Sportiv și program') as HTMLSelectElement).value).toBe(atribuiri[aleasa].id);
    expect(cereri).toEqual([atribuiri[aleasa].id]);
  });

  it('păstrează o atribuire care trece în anul următor și aliniază pauzele după datele reale', async () => {
    const calendar: DateCalendar = {
      atribuire: atribuire({ data_start: '2026-12-31', data_sfarsit: '2027-01-03' }),
      zile: [
        { ...ziProgram(), data: '2026-12-31', stare: 'viitor' },
        { ...ziProgram({ id: 'zi-2', zi: 2 }), data: '2027-01-01', stare: 'viitor' },
      ],
      totaluri: { zile_antrenament: 2, rezultate: 0, pr: 0 },
    };
    raspunde(calendar);
    monteaza(['atribuire-1', '2027']);
    const harta = await screen.findByRole('img', { name: 'Harta antrenamentelor în 2027' });
    expect(harta.querySelectorAll('rect')).toHaveLength(365);
    const titluri = [...harta.querySelectorAll('rect title')].map(t => t.textContent);
    expect(titluri).toContain('vineri, 1 ianuarie 2027, viitor');
    expect(titluri.some(t => t?.includes('2026'))).toBe(false);
    expect(screen.getByText('Toată atribuirea · 2026–2027')).toBeDefined();
    const saptamani = screen.getByRole('region', { name: 'Toate săptămânile atribuirii' });
    expect(within(saptamani).getAllByRole('button')).toHaveLength(2);
    expect(within(saptamani).getByRole('button', { name: 'joi, 31 decembrie 2026, viitor' })).toBeDefined();
    expect(within(saptamani).getAllByLabelText(/^Pauză, /)).toHaveLength(2);
    expect(within(saptamani).getByLabelText('Pauză, sâmbătă, 2 ianuarie 2027')).toBeDefined();
    expect(within(saptamani).queryByLabelText(/Pauză, miercuri, 30 decembrie/)).toBeNull();
  });

  it('nu afișează un calendar inventat dacă nu există atribuiri', async () => {
    monteaza();
    expect(await screen.findByText('Nicio atribuire încă. Alege un program din Programe.')).toBeDefined();
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.queryByText('Zile de antrenament')).toBeNull();
  });

  it('arată eroarea de citire și reîncarcă calendarul', async () => {
    raspunde();
    server.use(rpcHandler('admin_prog_calendar', () => new HttpResponse('eroare', { status: 500 })));
    monteaza();
    expect((await screen.findByRole('alert')).textContent).toContain('Nu am putut încărca calendarul.');
    expect(screen.queryByRole('img')).toBeNull();
    server.use(rpcHandler('admin_prog_calendar', () => HttpResponse.json(calendarDemo())));
    fireEvent.click(screen.getByRole('button', { name: 'Reîncearcă' }));
    await screen.findByRole('img', { name: 'Harta antrenamentelor în 2026' });
  });

  it('trimite sesiunea expirată la autentificare', async () => {
    raspunde();
    server.use(rpcHandler('admin_prog_calendar', () => new HttpResponse('invalid_token', { status: 401 })));
    const { onAuthError } = monteaza();
    await waitFor(() => expect(onAuthError).toHaveBeenCalled());
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
