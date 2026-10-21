import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { HttpResponse } from 'msw';
import { server } from '../../../../tests/support/vitest.setup';
import { rpcHandler } from '../../../../tests/support/handlers';
import { atribuire, blocProgram, profilSportiv, program, ziProgram } from '../../../../tests/support/builders/programare';
import type { AntrenamentZi, DateAzi } from '../data/tipuri';
import { FurnizorProgramare } from '../data/sesiune';
import { aziProgramare, dataCompleta, decaleazaData } from '../lib/date';
import { EcranAzi } from './EcranAzi';

const azi = aziProgramare();
const antrenament = (extra: Partial<AntrenamentZi> = {}): AntrenamentZi => ({ atribuire: atribuire(), program: program(), zi: ziProgram(), ...extra });
const monteaza = (parametri: string[] = [], onNavigare = vi.fn()) => {
  render(<FurnizorProgramare sesiune={{ token: 'token-test', onAuthError: vi.fn(() => false), showToast: vi.fn() }}><EcranAzi parametri={parametri} onNavigare={onNavigare} /></FurnizorProgramare>);
  return onNavigare;
};
const raspunsAzi = (antrenamente: AntrenamentZi[], extra: Partial<DateAzi> = {}) => server.use(rpcHandler('admin_prog_azi', () => HttpResponse.json({ data: azi, profil: profilSportiv(), antrenamente, ...extra })));
afterEach(cleanup);

describe('Azi', () => {
  it('trimite sportivul fără profil la configurarea din Programe', async () => {
    raspunsAzi([], { profil: null });
    const navigare = monteaza();
    fireEvent.click(await screen.findByRole('button', { name: 'Creează profilul' }));
    expect(navigare).toHaveBeenCalledWith('prog-programe', []);
  });

  it('reîncarcă antrenamentele după eroare la cererea sportivului', async () => {
    const incarcare = vi.fn(() => new HttpResponse('Eroare demo', { status: 500 }));
    server.use(rpcHandler('admin_prog_azi', incarcare));
    monteaza();
    await screen.findByRole('alert');
    raspunsAzi([antrenament()]);
    fireEvent.click(screen.getByRole('button', { name: 'Încearcă din nou' }));
    expect(await screen.findByRole('article', { name: 'Program sintetic' })).toBeDefined();
    expect(incarcare).toHaveBeenCalledTimes(1);
  });

  it('pornește compact și extinde seturile, pauzele, notele și ținta feminină pe loc', async () => {
    const baza = blocProgram();
    const bloc = blocProgram({ seturi: [{ ...baza.seturi[0], note: 'Mișcare controlată.' }, { ...baza.seturi[0], id: 'set-2', ordine: 2, note: 'Mișcare controlată.' }], note_sportiv: 'Păstrează ritmul.', note_antrenor: 'Indicație demo.' });
    raspunsAzi([antrenament({ zi: ziProgram({ blocuri: [bloc, blocProgram({ id: 'bloc-2', ordine: 2, nume: 'Mobilitate demo', parametri: { prefix: 'B' } }), blocProgram({ id: 'bloc-3', ordine: 3, nume: 'Final demo', parametri: { prefix: 'C' } })] }) })], { profil: profilSportiv({ gen: 'feminin' }) });
    monteaza();
    expect(await screen.findByRole('heading', { name: 'Azi' })).toBeDefined();
    expect(await screen.findByText('Genuflexiune demo 2 x 5 · 15 kg')).toBeDefined();
    expect(screen.getByText('Mobilitate demo')).toBeDefined();
    expect(screen.getByText('Final demo')).toBeDefined();
    expect(screen.queryByText('Pauză 30 de secunde')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Arată tot antrenamentul' }));
    expect(screen.getAllByText('Pauză 30 de secunde').length).toBeGreaterThan(0);
    expect(screen.getByText('Mișcare controlată.')).toBeDefined();
    expect(screen.getByText('Păstrează ritmul.')).toBeDefined();
    expect(screen.queryByText('Indicație demo.')).toBeNull();
    expect(screen.getByText('2 × 5 Genuflexiune demo · 15 kg')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Restrânge antrenamentul' }));
    expect(screen.queryByText('Pauză 30 de secunde')).toBeNull();
  });

  it('ziua goală păstrează banda, fără carduri', async () => {
    raspunsAzi([]); monteaza();
    expect(await screen.findByText('Niciun antrenament programat pentru această zi.')).toBeDefined();
    expect(screen.getByRole('navigation', { name: 'Alege data antrenamentului' })).toBeDefined();
    expect(screen.queryByRole('article')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Înapoi la azi' })).toBeNull();
  });

  it('citește data din fragment și revine la azi prin navigarea admin', async () => {
    const alta = decaleazaData(azi, -3);
    const cereri: string[] = [];
    server.use(rpcHandler('admin_prog_azi', async ({ request }) => { const corp = await request.json() as { p_data: string }; cereri.push(corp.p_data); return HttpResponse.json({ data: corp.p_data, profil: profilSportiv(), antrenamente: [] }); }));
    const navigare = monteaza([alta]);
    expect(await screen.findByRole('heading', { name: dataCompleta(alta) })).toBeDefined();
    expect(cereri).toEqual([alta]);
    expect(screen.getByRole('button', { name: `${dataCompleta(alta)}, fără antrenament` }).getAttribute('aria-current')).toBe('date');
    fireEvent.click(screen.getByRole('button', { name: 'Înapoi la azi' }));
    expect(navigare).toHaveBeenLastCalledWith('prog-azi', []);
    fireEvent.click(screen.getByRole('button', { name: `${dataCompleta(azi)}, fără antrenament` }));
    expect(navigare).toHaveBeenLastCalledWith('prog-azi', [azi]);
  });

  it('un fragment cu data invalidă rămâne la azi și nu provoacă RangeError', async () => {
    raspunsAzi([]); monteaza(['2026-99-99']);
    expect(await screen.findByRole('heading', { name: 'Azi' })).toBeDefined();
    expect(await screen.findByText('Niciun antrenament programat pentru această zi.')).toBeDefined();
  });

  it('afișează două atribuiri active ca două carduri distincte și ignoră blocurile ascunse', async () => {
    raspunsAzi([antrenament({ zi: ziProgram({ blocuri: [blocProgram(), blocProgram({ id: 'ascuns', nume: 'Ascuns demo', ascuns: true })] }) }), antrenament({ atribuire: atribuire({ id: 'atribuire-2' }), program: program({ id: 'program-2', nume: 'Al doilea program demo' }) })]);
    monteaza();
    expect(await screen.findByRole('article', { name: 'Program sintetic' })).toBeDefined();
    expect(screen.getByRole('article', { name: 'Al doilea program demo' })).toBeDefined();
    expect(screen.queryByText('Ascuns demo')).toBeNull();
  });

  it('deschide exercițiul ales inclusiv A2 în pagina de citire', async () => {
    const baza = blocProgram();
    raspunsAzi([antrenament({ zi: ziProgram({ blocuri: [blocProgram({ seturi: [baza.seturi[0], { ...baza.seturi[0], id: 'set-2', exercitiu: 2, ordine: 2, miscare: { ...baza.seturi[0].miscare, id: 'miscare-2', nume: 'Fandare demo' } }] })] }) })]);
    const navigare = monteaza();
    fireEvent.click(await screen.findByRole('button', { name: 'A2. Fandare demo 1 x 5 · 20 kg' }));
    expect(navigare).toHaveBeenLastCalledWith('prog-azi', [azi, 'bloc-1', '2', 'atribuire-1']);
    fireEvent.click(screen.getByRole('button', { name: 'Deschide antrenamentul' }));
    expect(navigare).toHaveBeenLastCalledWith('prog-azi', [azi, 'bloc-1', '1', 'atribuire-1']);
  });

  it('o adresă directă deschide toată prescripția supersetului și evidențiază A2 fără formular de logare', async () => {
    const baza = blocProgram();
    const superset = blocProgram({ instructiuni_inainte: 'Pregătește spațiul demo.', note_sportiv: 'Păstrează ritmul demo.', seturi: [baza.seturi[0], { ...baza.seturi[0], id: 'set-2', exercitiu: 2, ordine: 2, miscare: { ...baza.seturi[0].miscare, id: 'miscare-2', nume: 'Fandare demo' } }] });
    raspunsAzi([antrenament({ zi: ziProgram({ blocuri: [superset] }) })]);
    monteaza([azi, superset.id, '2', 'atribuire-1']);
    const pagina = await screen.findByRole('region', { name: 'Antrenament: Program sintetic' });
    const context = within(pagina).getByRole('region', { name: 'Bloc A' });
    expect(within(context).getByText('5 Genuflexiune demo · 20 kg')).toBeDefined();
    expect(within(context).getByText('5 Fandare demo · 20 kg').closest('li')?.getAttribute('aria-current')).toBe('true');
    expect(within(context).getByText('Pregătește spațiul demo.')).toBeDefined();
    expect(within(context).getByText('Păstrează ritmul demo.')).toBeDefined();
    expect(within(pagina).getByRole('heading', { name: 'Istoric' })).toBeDefined();
    expect(within(pagina).getByText('Nu există rezultate înregistrate pentru acest exercițiu.')).toBeDefined();
    expect(within(pagina).queryByRole('form')).toBeNull();
    expect(within(pagina).queryByRole('button', { name: /salvează|loghează/i })).toBeNull();
  });

  it('o atribuire aleasă din calendar citește ziua sportivului vizat, cu țintele sale feminine', async () => {
    const alta = atribuire({ id: 'atribuire-alta', sportiv_id: 2, sportiv_nume: 'Sportivă demo', sportiv_gen: 'feminin' });
    raspunsAzi([]);
    server.use(
      rpcHandler('admin_prog_programe', () => HttpResponse.json([program({ atribuiri: [alta] })])),
      rpcHandler('admin_prog_calendar', () => HttpResponse.json({ atribuire: alta, zile: [{ ...ziProgram(), data: azi, stare: 'nefăcut' }], totaluri: { zile_antrenament: 1, rezultate: 0, pr: 0 } })),
    );
    const navigare = monteaza([azi, 'bloc-1', '1', alta.id]);
    const pagina = await screen.findByRole('region', { name: 'Antrenament: Program sintetic' });
    expect(within(pagina).getAllByText('5 Genuflexiune demo · 15 kg').length).toBeGreaterThan(0);
    expect(within(pagina).queryByText('5 Genuflexiune demo · 20 kg')).toBeNull();
    fireEvent.click(within(pagina).getByRole('button', { name: 'Închide antrenamentul' }));
    expect(navigare).toHaveBeenLastCalledWith('prog-azi', [azi]);
  });

  it('A2 înlocuiește fragmentul curent fără pași suplimentari, iar închiderea unei foi deschise în admin revine înapoi', async () => {
    const baza = blocProgram();
    const superset = blocProgram({ seturi: [baza.seturi[0], { ...baza.seturi[0], id: 'set-2', exercitiu: 2, ordine: 2, miscare: { ...baza.seturi[0].miscare, id: 'miscare-2', nume: 'Fandare demo' } }] });
    const adresa = window.location.href;
    const stare = window.history.state;
    const inapoi = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    try {
      window.history.replaceState({ programareFoaie: { data: azi, atribuire: 'atribuire-1' }, altaStare: 'păstrată' }, '', `#prog-azi/${azi}/bloc-1/1/atribuire-1`);
      const pasi = window.history.length;
      raspunsAzi([antrenament({ zi: ziProgram({ blocuri: [superset] }) })]);
      monteaza([azi, 'bloc-1', '1', 'atribuire-1']);
      const pagina = await screen.findByRole('region', { name: 'Antrenament: Program sintetic' });
      fireEvent.click(within(pagina).getByRole('button', { name: 'A2' }));
      expect(window.location.hash).toBe(`#prog-azi/${azi}/bloc-1/2/atribuire-1`);
      expect(window.history.length).toBe(pasi);
      expect(window.history.state.altaStare).toBe('păstrată');
      fireEvent.click(within(pagina).getByRole('button', { name: 'Închide antrenamentul' }));
      expect(inapoi).toHaveBeenCalledTimes(1);
    } finally {
      inapoi.mockRestore();
      window.history.replaceState(stare, '', adresa);
    }
  });

  it('o adresă directă către un bloc ascuns sau necunoscut arată o ieșire înapoi la zi', async () => {
    raspunsAzi([antrenament()]);
    const navigare = monteaza([azi, 'bloc-inexistent', '1', 'atribuire-1']);
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('Antrenamentul cerut nu este disponibil'));
    fireEvent.click(screen.getByRole('button', { name: 'Înapoi la zi' }));
    expect(navigare).toHaveBeenLastCalledWith('prog-azi', [azi]);
  });

  it('o dată invalidă din adresa antrenamentului arată ieșirea către azi fără eroare de afișare', async () => {
    raspunsAzi([antrenament()]);
    const navigare = monteaza(['2026-02-31', 'bloc-1', '1', 'atribuire-1']);
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('Antrenamentul cerut nu este disponibil'));
    fireEvent.click(screen.getByRole('button', { name: 'Înapoi la zi' }));
    expect(navigare).toHaveBeenLastCalledWith('prog-azi', [azi]);
  });

  it('deschide video valid în Dialog și închide cu butonul sau Escape', async () => {
    raspunsAzi([antrenament()]); monteaza();
    const declansator = await screen.findByRole('button', { name: 'Video: Genuflexiune demo' });
    declansator.focus(); fireEvent.click(declansator);
    const dialog = screen.getByRole('dialog', { name: 'Genuflexiune demo' });
    const iframe = within(dialog).getByTitle('Demonstrație: Genuflexiune demo');
    expect(iframe.getAttribute('src')).toContain('https://www.youtube-nocookie.com/embed/abcdefghijk');
    expect(iframe.getAttribute('sandbox')).toContain('allow-scripts');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Închide video' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(declansator);
    fireEvent.click(declansator);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('mișcările fără video ori cu id invalid nu primesc buton video', async () => {
    const baza = blocProgram();
    raspunsAzi([antrenament({ zi: ziProgram({ blocuri: [blocProgram({ seturi: [{ ...baza.seturi[0], miscare: { ...baza.seturi[0].miscare, youtube_id: null } }, { ...baza.seturi[0], id: 'set-2', exercitiu: 2, miscare: { ...baza.seturi[0].miscare, id: 'miscare-2', youtube_id: 'invalid' } }] })] }) })]);
    monteaza(); await screen.findByRole('article', { name: 'Program sintetic' });
    expect(screen.queryByRole('button', { name: /^Video:/ })).toBeNull();
  });

  it('marchează datele reale ale atribuirilor proprii, inclusiv programe cu zile neregulate', async () => {
    raspunsAzi([]);
    const proprie = atribuire({ data_start: azi });
    const straina = atribuire({ id: 'straina', sportiv_id: 2 });
    const calendar = vi.fn(async ({ request }: { request: Request }) => {
      const corp = await request.json() as { p_atribuire_id: string };
      expect(corp.p_atribuire_id).toBe(proprie.id);
      return HttpResponse.json({ atribuire: proprie, zile: [ { ...ziProgram(), data: azi, stare: 'nefăcut' }, { ...ziProgram({ id: 'zi-2', zi: 4 }), data: decaleazaData(azi, 3), stare: 'viitor' } ], totaluri: { zile_antrenament: 2, rezultate: 0, pr: 0 } });
    });
    server.use(rpcHandler('admin_prog_programe', () => HttpResponse.json([program({ atribuiri: [proprie, straina] })])), rpcHandler('admin_prog_calendar', calendar));
    monteaza();
    await screen.findByRole('button', { name: `${dataCompleta(decaleazaData(azi, 3))}, are antrenament` });
    expect(screen.getByRole('button', { name: `${dataCompleta(decaleazaData(azi, 1))}, fără antrenament` })).toBeDefined();
    await waitFor(() => expect(calendar).toHaveBeenCalledTimes(1));
  });
});
