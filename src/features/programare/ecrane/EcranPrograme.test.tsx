import { describe, it, expect, vi, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within, cleanup } from '@testing-library/react';
import { HttpResponse } from 'msw';
import { server } from '../../../../tests/support/vitest.setup';
import { rpcHandler } from '../../../../tests/support/handlers';
import { atribuire, documentProgram, profilSportiv, program } from '../../../../tests/support/builders/programare';
import { EcranProgramare } from '../index';

afterEach(cleanup);
const monteaza = (parametri: string[] = [], onAuthError = vi.fn(() => false)) => render(
  <EcranProgramare ecran="prog-programe" parametri={parametri} sesiune={{ token: 'token-test', onAuthError, showToast: vi.fn() }} />
);
const alegeFisier = (continut: unknown) => fireEvent.change(screen.getByLabelText('Fișier JSON de import'), { target: { files: [new File([JSON.stringify(continut)], 'demo.json', { type: 'application/json' })] } });

describe('Programe', () => {
  it('salvează profilul și explică lipsa alertelor fără Telegram', async () => {
    let trimis: unknown;
    let profil: ReturnType<typeof profilSportiv> | null = null;
    server.use(rpcHandler('admin_prog_profil', () => HttpResponse.json(profil)), rpcHandler('admin_prog_profil_salveaza', async ({ request }) => {
      trimis = await request.json(); profil = profilSportiv({ nume: 'Ana', gen: 'feminin' }); return HttpResponse.json(profil);
    }));
    monteaza();
    const nume = await screen.findByLabelText('Nume afișat');
    expect(screen.getByText(/Fără id Telegram, nu vei primi alerte/)).toBeDefined();
    fireEvent.change(nume, { target: { value: 'Ana' } });
    fireEvent.change(screen.getByLabelText('Gen'), { target: { value: 'feminin' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvează profilul' }));
    await waitFor(() => expect(trimis).toEqual({ p_token: 'token-test', p_nume: 'Ana', p_gen: 'feminin', p_unitate_greutate: 'kg', p_unitate_distanta: 'm', p_telegram_id: null }));
    expect(await screen.findByText('Profil salvat.')).toBeDefined();
  });

  it('respinge importul invalid inclusiv câmpuri adânc imbricate fără RPC', async () => {
    const importa = vi.fn(() => HttpResponse.json(program()));
    server.use(rpcHandler('admin_prog_importa', importa));
    monteaza();
    await screen.findByLabelText('Fișier JSON de import');
    const invalid = documentProgram(); invalid.zile[0].blocuri[0].seturi[0].pauza_sec = -30;
    alegeFisier(invalid);
    expect((await screen.findByRole('alert')).textContent).toContain('Fișier de import invalid');
    expect(importa).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Confirmă importul' })).toBeNull();
  });

  it('arată rezumatul înainte de confirmare și reimportă fără duplicare', async () => {
    let programe: ReturnType<typeof program>[] = [];
    const importa = vi.fn(() => { programe = [program()]; return HttpResponse.json(program()); });
    server.use(rpcHandler('admin_prog_programe', () => HttpResponse.json(programe)), rpcHandler('admin_prog_importa', importa));
    monteaza();
    await screen.findByLabelText('Fișier JSON de import');
    for (let i = 0; i < 2; i++) {
      alegeFisier(documentProgram());
      expect(await screen.findByText('2 săptămâni · 1 zile · 1 mișcări')).toBeDefined();
      expect(importa).toHaveBeenCalledTimes(i);
      fireEvent.click(screen.getByRole('button', { name: 'Confirmă importul' }));
      await waitFor(() => expect(importa).toHaveBeenCalledTimes(i + 1));
      await waitFor(() => expect(screen.getAllByRole('button', { name: 'Program sintetic' })).toHaveLength(1));
    }
    expect(screen.getByText('Referință externă: TTT / WodUp')).toBeDefined();
  });

  it('alegerea altui fișier șterge confirmarea și nu lasă importul vechi activ', async () => {
    const importa = vi.fn(() => HttpResponse.json(program()));
    server.use(rpcHandler('admin_prog_importa', importa));
    monteaza();
    await screen.findByLabelText('Fișier JSON de import');
    alegeFisier(documentProgram());
    await screen.findByRole('button', { name: 'Confirmă importul' });
    alegeFisier({ versiune: 1 });
    expect(screen.queryByRole('button', { name: 'Confirmă importul' })).toBeNull();
    await screen.findByRole('alert');
    expect(importa).not.toHaveBeenCalled();
  });

  it('afișează atribuirile tuturor și creează una nouă cu data cerută', async () => {
    const atribuiri = [atribuire({ sportiv_id: 2, sportiv_nume: 'Alt sportiv' })];
    let trimis: unknown;
    server.use(rpcHandler('admin_prog_profil', () => HttpResponse.json(profilSportiv())), rpcHandler('admin_prog_program', () => HttpResponse.json(program({ atribuiri }))), rpcHandler('admin_prog_atribuie', async ({ request }) => {
      trimis = await request.json(); const noua = atribuire({ id: 'atribuire-2', data_start: '2026-11-01', data_sfarsit: '2026-11-08' });
      atribuiri.push(noua); return HttpResponse.json(noua);
    }));
    monteaza(['program-1']);
    expect(await screen.findByText('Alt sportiv')).toBeDefined();
    expect(screen.getByLabelText('Data de start').getAttribute('required')).not.toBeNull();
    fireEvent.change(screen.getByLabelText('Data de start'), { target: { value: '2026-11-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Atribuie-mi programul' }));
    await waitFor(() => expect(trimis).toEqual({ p_token: 'token-test', p_program_id: 'program-1', p_data_start: '2026-11-01' }));
    expect(await screen.findByText('Sportiv demo')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Începe din nou' })).toBeDefined();
    expect(within(screen.getByLabelText('Istoricul atribuirilor')).getAllByRole('listitem')).toHaveLength(2);
    fireEvent.change(screen.getByLabelText('Data de start'), { target: { value: '2026-12-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Începe din nou' }));
    await waitFor(() => expect(trimis).toEqual({ p_token: 'token-test', p_program_id: 'program-1', p_data_start: '2026-12-01' }));
    await waitFor(() => expect(within(screen.getByLabelText('Istoricul atribuirilor')).getAllByRole('listitem')).toHaveLength(3));
  });

  it('trimite eroarea de sesiune la login', async () => {
    const onAuthError = vi.fn(() => true);
    server.use(rpcHandler('admin_prog_programe', () => new HttpResponse('invalid_token', { status: 401 })));
    monteaza([], onAuthError);
    await waitFor(() => expect(onAuthError).toHaveBeenCalled());
    expect(screen.queryByText('Nu am putut încărca programele.')).toBeNull();
  });
});
