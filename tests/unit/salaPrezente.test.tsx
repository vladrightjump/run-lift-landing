import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, within, fireEvent, waitFor } from '@testing-library/react';
import { FurnizorSesiuneAdmin } from '../../src/admin/adminSession';
import { EcranPrezente } from '../../src/admin/sala/EcranPrezente';
import { SubmitHttpError } from '../../src/lib/supabase';
import { dateSala, membruSala } from './helpers/salaFixtures';
import { dataLunga, urmatorulSondaj } from '../../src/admin/sala/sondaj';
import type { SalaAntrenament } from '../../src/lib/salaApi';
import { cereFiltruUrmatorul } from '../../src/admin/sala/filtruUrmatorul';

const api = vi.hoisted(() => ({
  incarcaSala: vi.fn(),
  seteazaPrezenta: vi.fn(),
  seteazaAntrenament: vi.fn(),
}));
vi.mock('../../src/lib/salaApi', async (orig) => ({
  ...(await orig<typeof import('../../src/lib/salaApi')>()),
  ...api,
}));

const showToast = vi.fn();
const randeaza = () =>
  render(
    <FurnizorSesiuneAdmin token="tok" onAuthError={() => false} showToast={showToast}>
      <EcranPrezente />
    </FurnizorSesiuneAdmin>
  );

beforeEach(() => {
  Object.values(api).forEach((f) => f.mockReset());
  showToast.mockReset();
  api.seteazaPrezenta.mockResolvedValue(undefined);
  api.seteazaAntrenament.mockResolvedValue(undefined);
});
afterEach(cleanup);

const coloana = (titlu: RegExp) => screen.getByRole('heading', { name: titlu }).parentElement as HTMLElement;

describe('Prezențe', () => {
  it('împarte antrenamentul următor în vin, nu vin și n-au răspuns, cu cifrele mari', async () => {
    api.incarcaSala.mockResolvedValue(dateSala());
    randeaza();
    expect(await screen.findByRole('heading', { name: 'Joi, 8 oct' })).toBeTruthy();
    expect(within(coloana(/^Vin/)).getByText('Ana')).toBeTruthy();
    expect(within(coloana(/^Nu vin/)).getByText('Ion')).toBeTruthy();
    // Maria și Roma sunt activi, cu Telegram, fără răspuns; „Fara" n-are cont, deci nu e așteptat.
    const tacuti = within(coloana(/^N-au răspuns/));
    expect(tacuti.getByText('Maria')).toBeTruthy();
    expect(tacuti.getByText('Roma')).toBeTruthy();
    expect(tacuti.queryByText('Fara')).toBeNull();
  });

  it('se deschide cu filtrul cerut din Acum, o singură dată, iar „Toți" le arată pe toate (R10)', async () => {
    api.incarcaSala.mockResolvedValue(dateSala());
    cereFiltruUrmatorul('fara');
    const { unmount } = randeaza();
    const filtre = within(await screen.findByRole('group', { name: 'Filtrează răspunsurile' }));
    expect(filtre.getByRole('button', { name: 'Fără răspuns' }).getAttribute('aria-pressed')).toBe('true');
    expect(within(coloana(/^N-au răspuns/)).getByText('Maria')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: /^Vin/ })).toBeNull();
    expect(screen.queryByRole('heading', { name: /^Nu vin/ })).toBeNull();

    fireEvent.click(filtre.getByRole('button', { name: 'Toți' }));
    expect(within(coloana(/^Vin/)).getByText('Ana')).toBeTruthy();
    expect(within(coloana(/^Nu vin/)).getByText('Ion')).toBeTruthy();

    // A doua deschidere (Back, sau din navigare) nu mai moștenește filtrul.
    unmount();
    randeaza();
    await screen.findByRole('heading', { name: 'Joi, 8 oct' });
    expect(within(coloana(/^Vin/)).getByText('Ana')).toBeTruthy();
  });

  it('un membru inactiv fără răspuns nu apare la „n-au răspuns"', async () => {
    const d = dateSala();
    d.membri.push(membruSala('pauza', { status: 'paused' }));
    api.incarcaSala.mockResolvedValue(d);
    randeaza();
    await screen.findByRole('heading', { name: 'Joi, 8 oct' });
    expect(within(coloana(/^N-au răspuns/)).queryByText('Pauza')).toBeNull();
  });

  it('marcarea de mână „vine" cheamă serverul cu antrenamentul și membrul', async () => {
    api.incarcaSala.mockResolvedValue(dateSala());
    randeaza();
    await screen.findByRole('heading', { name: 'Joi, 8 oct' });
    const maria = within(screen.getByRole('group', { name: 'Prezența lui Maria, Joi, 8 oct' }));
    fireEvent.click(maria.getByRole('button', { name: 'Vine' }));
    await waitFor(() => expect(api.seteazaPrezenta).toHaveBeenCalledWith('tok', 's2', 'maria', 'yes'));
    expect(showToast).toHaveBeenCalledWith({ kind: 'success', msg: 'Maria: vine.' });
  });

  it('anularea cere confirmare; renunțarea nu cheamă serverul', async () => {
    api.incarcaSala.mockResolvedValue(dateSala());
    randeaza();
    await screen.findByRole('heading', { name: 'Joi, 8 oct' });
    fireEvent.click(screen.getAllByRole('button', { name: 'Anulează antrenamentul' })[0]);
    const dialog = screen.getByRole('alertdialog');
    expect(dialog.textContent).toContain('Sondajul a plecat deja');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Nu anula' }));
    expect(api.seteazaAntrenament).not.toHaveBeenCalled();
  });

  it('confirmarea anulează ziua antrenamentului', async () => {
    api.incarcaSala.mockResolvedValue(dateSala());
    randeaza();
    await screen.findByRole('heading', { name: 'Joi, 8 oct' });
    fireEvent.click(screen.getAllByRole('button', { name: 'Anulează antrenamentul' })[0]);
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Anulează antrenamentul' }));
    await waitFor(() => expect(api.seteazaAntrenament).toHaveBeenCalledWith('tok', '2026-10-08', true));
  });

  it('Covers R13. cu sondajul plecat, confirmarea spune că botul anunță grupul și pe câți pomenește', async () => {
    api.incarcaSala.mockResolvedValue(dateSala());
    randeaza();
    await screen.findByRole('heading', { name: 'Joi, 8 oct' });
    fireEvent.click(screen.getAllByRole('button', { name: 'Anulează antrenamentul' })[0]);
    const dialog = screen.getByRole('alertdialog');
    expect(dialog.textContent).toMatch(/anunță grupul/);
    expect(dialog.textContent).toMatch(/pe cei 1 care au spus „Vin”/);
  });

  it('motivul scris în dialog ajunge la server; unul gol nu se trimite', async () => {
    api.incarcaSala.mockResolvedValue(dateSala());
    randeaza();
    await screen.findByRole('heading', { name: 'Joi, 8 oct' });
    fireEvent.click(screen.getAllByRole('button', { name: 'Anulează antrenamentul' })[0]);
    let dialog = screen.getByRole('alertdialog');
    fireEvent.change(within(dialog).getByLabelText(/Motiv/), { target: { value: '  ploaie ' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Anulează antrenamentul' }));
    await waitFor(() => expect(api.seteazaAntrenament).toHaveBeenCalledWith('tok', '2026-10-08', true, 'ploaie'));

    api.seteazaAntrenament.mockClear();
    fireEvent.click(screen.getAllByRole('button', { name: 'Anulează antrenamentul' })[0]);
    dialog = screen.getByRole('alertdialog');
    fireEvent.change(within(dialog).getByLabelText(/Motiv/), { target: { value: '   ' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Anulează antrenamentul' }));
    await waitFor(() => expect(api.seteazaAntrenament).toHaveBeenCalledWith('tok', '2026-10-08', true));
  });

  it('fără sondaj plecat, confirmarea spune că în grup nu pleacă nimic și nu cere motiv', async () => {
    const urmator = { ...dateSala().antrenamente[0], poll_sent: false };
    api.incarcaSala.mockResolvedValue(dateSala({ antrenamente: [urmator, ...dateSala().antrenamente.slice(1)], raspunsuri: [] }));
    randeaza();
    await screen.findByRole('heading', { name: 'Joi, 8 oct' });
    fireEvent.click(screen.getAllByRole('button', { name: 'Anulează antrenamentul' })[0]);
    const dialog = screen.getByRole('alertdialog');
    expect(dialog.textContent).toMatch(/În grup nu pleacă nimic/);
    expect(within(dialog).queryByLabelText(/Motiv/)).toBeNull();
  });

  it('fără antrenament următor: spune când pleacă sondajul', async () => {
    api.incarcaSala.mockResolvedValue(dateSala({ antrenamente: [], raspunsuri: [] }));
    randeaza();
    const titlu = await screen.findByRole('heading', { level: 2 });
    expect(titlu.textContent).toMatch(/^[A-ZȘȚ][a-zăâîșț]+, \d+ [a-z]{3}$/);
    expect(screen.getByText(/Sondajul pleacă .* la 12:00/)).toBeTruthy();
  });

  it('un antrenament trecut se deschide și își arată răspunsurile', async () => {
    api.incarcaSala.mockResolvedValue(dateSala());
    randeaza();
    const trecut = (await screen.findByText('Marți, 6 oct')).closest('details') as HTMLElement;
    expect(within(trecut).getByText(/1 au venit/)).toBeTruthy();
    expect(within(trecut).getByText('Maria')).toBeTruthy();
  });

  it('o scriere refuzată arată motivul, iar lista rămâne pe ecran', async () => {
    api.incarcaSala.mockResolvedValue(dateSala());
    api.seteazaPrezenta.mockRejectedValue(new SubmitHttpError(400, '{"message":"antrenament_inexistent"}'));
    randeaza();
    await screen.findByRole('heading', { name: 'Joi, 8 oct' });
    fireEvent.click(within(screen.getByRole('group', { name: 'Prezența lui Maria, Joi, 8 oct' })).getByRole('button', { name: 'Nu' }));
    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith({ kind: 'error', msg: 'Antrenamentul nu mai există.' })
    );
    expect(screen.getByRole('heading', { name: 'Joi, 8 oct' })).toBeTruthy();
  });
});

describe('Prezențe — zilele anulate și istoricul', () => {
  const trecut = (i: number): SalaAntrenament => ({
    id: `p${i}`,
    session_date: `2026-09-${String(10 + i).padStart(2, '0')}`,
    starts_at: '06:30',
    location: 'Parc',
    status: 'done',
    poll_sent: true,
  });

  it('o zi anulată se reactivează dintr-un clic', async () => {
    api.incarcaSala.mockResolvedValue(
      dateSala({
        antrenamente: [
          ...dateSala().antrenamente,
          { id: 'x', session_date: '2026-10-13', starts_at: '06:30', location: 'Parc', status: 'cancelled', poll_sent: false },
        ],
      })
    );
    randeaza();
    const rand = (await screen.findByText('Marți, 13 oct')).closest('li') as HTMLElement;
    fireEvent.click(within(rand).getByRole('button', { name: 'Reactivează' }));
    await waitFor(() => expect(api.seteazaAntrenament).toHaveBeenCalledWith('tok', '2026-10-13', false));
  });

  it('Covers R13. reactivarea unei zile cu sondaj plecat cere confirmare și spune că botul anunță grupul', async () => {
    api.incarcaSala.mockResolvedValue(
      dateSala({
        antrenamente: [
          ...dateSala().antrenamente,
          { id: 'x', session_date: '2026-10-13', starts_at: '06:30', location: 'Parc', status: 'cancelled', poll_sent: true },
        ],
      })
    );
    randeaza();
    const rand = (await screen.findByText('Marți, 13 oct')).closest('li') as HTMLElement;
    fireEvent.click(within(rand).getByRole('button', { name: 'Reactivează' }));
    const dialog = screen.getByRole('alertdialog');
    expect(dialog.textContent).toMatch(/anunță grupul/);
    expect(api.seteazaAntrenament).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reactivează' }));
    await waitFor(() => expect(api.seteazaAntrenament).toHaveBeenCalledWith('tok', '2026-10-13', false));
  });

  it('formularul trece prin aceeași confirmare când ziua aleasă are sondajul plecat', async () => {
    api.incarcaSala.mockResolvedValue(dateSala());
    randeaza();
    await screen.findByRole('heading', { name: 'Joi, 8 oct' });
    fireEvent.change(screen.getByLabelText('Anulează o zi'), { target: { value: '2026-10-08' } });
    fireEvent.click(screen.getByRole('button', { name: 'Anulează ziua' }));
    expect(screen.getByRole('alertdialog').textContent).toMatch(/anunță grupul/);
    expect(api.seteazaAntrenament).not.toHaveBeenCalled();
  });

  it('Covers R25. un antrenament mutat își arată ora și locul', async () => {
    const mutat = { ...dateSala().antrenamente[0], starts_at: '07:30', location: 'Valea Morilor' };
    api.incarcaSala.mockResolvedValue(dateSala({ antrenamente: [mutat, ...dateSala().antrenamente.slice(1)] }));
    randeaza();
    const sectiune = (await screen.findByRole('heading', { name: 'Joi, 8 oct' })).closest('section') as HTMLElement;
    expect(sectiune.textContent).toContain('07:30');
    expect(sectiune.textContent).toContain('Valea Morilor');
  });

  it('formularul anulează o zi aleasă și se golește după succes', async () => {
    api.incarcaSala.mockResolvedValue(dateSala());
    randeaza();
    await screen.findByRole('heading', { name: 'Joi, 8 oct' });
    const zi = screen.getByLabelText('Anulează o zi') as HTMLInputElement;
    fireEvent.change(zi, { target: { value: '2026-10-15' } });
    fireEvent.click(screen.getByRole('button', { name: 'Anulează ziua' }));
    await waitFor(() => expect(api.seteazaAntrenament).toHaveBeenCalledWith('tok', '2026-10-15', true));
    await waitFor(() => expect(zi.value).toBe(''));
  });

  it('o altă zi aleasă cât se anulează prima rămâne în câmp', async () => {
    let gata: () => void = () => {};
    api.seteazaAntrenament.mockImplementation(() => new Promise<void>((r) => (gata = r)));
    api.incarcaSala.mockResolvedValue(dateSala());
    randeaza();
    await screen.findByRole('heading', { name: 'Joi, 8 oct' });
    const zi = screen.getByLabelText('Anulează o zi') as HTMLInputElement;
    fireEvent.change(zi, { target: { value: '2026-10-15' } });
    fireEvent.click(screen.getByRole('button', { name: 'Anulează ziua' }));
    await waitFor(() => expect(api.seteazaAntrenament).toHaveBeenCalledWith('tok', '2026-10-15', true));
    fireEvent.change(zi, { target: { value: '2026-10-22' } });
    gata();
    await waitFor(() => expect(showToast).toHaveBeenCalledWith(expect.objectContaining({ kind: 'success' })));
    await waitFor(() => expect((screen.getByRole('button', { name: 'Anulează ziua' }) as HTMLButtonElement).disabled).toBe(false));
    expect(zi.value).toBe('2026-10-22');
  });

  it('Covers R6. un membru fără Telegram se marchează de mână la antrenamentul următor', async () => {
    api.incarcaSala.mockResolvedValue(dateSala());
    randeaza();
    const urmator = (await screen.findByRole('heading', { name: 'Joi, 8 oct' })).closest('section') as HTMLElement;
    const alege = within(urmator).getByLabelText('Fără sondaj (fără Telegram sau în pauză)') as HTMLSelectElement;
    expect(within(alege).getByRole('option', { name: 'Fara' })).toBeTruthy();
    const marcheaza = within(urmator).getByRole('button', { name: 'Marchează că vine' }) as HTMLButtonElement;
    expect(marcheaza.disabled).toBe(true);
    fireEvent.change(alege, { target: { value: 'fara' } });
    fireEvent.click(marcheaza);
    await waitFor(() => expect(api.seteazaPrezenta).toHaveBeenCalledWith('tok', 's2', 'fara', 'yes'));
  });

  it('lista „fără sondaj" are membrii în pauză, dar nu pe cei ieșiți și nici pe cei care au răspuns', async () => {
    const d = dateSala();
    d.membri.push(membruSala('pauza', { status: 'paused' }), membruSala('plecat', { status: 'cancelled', telegram_user_id: null }));
    d.raspunsuri.push({ session_id: 's2', member_id: 'fara', response: 'yes', is_first_training: false, responded_at: '2026-10-07T09:10:00Z' });
    api.incarcaSala.mockResolvedValue(d);
    randeaza();
    const urmator = (await screen.findByRole('heading', { name: 'Joi, 8 oct' })).closest('section') as HTMLElement;
    const optiuni = within(within(urmator).getByLabelText('Fără sondaj (fără Telegram sau în pauză)'))
      .getAllByRole('option')
      .map((o) => o.textContent);
    expect(optiuni).toEqual(['Alege un membru…', 'Pauza']);
    // „Fara" a fost marcat: e acum la „Vin", cu corecturile obișnuite.
    expect(within(coloana(/^Vin/)).getByText('Fara')).toBeTruthy();
  });

  it('un membru fără Telegram se marchează de mână și la un antrenament trecut', async () => {
    api.incarcaSala.mockResolvedValue(dateSala());
    randeaza();
    const zi = (await screen.findByText('Marți, 6 oct')).closest('details') as HTMLElement;
    fireEvent.change(within(zi).getByLabelText('Fără sondaj (fără Telegram sau în pauză)'), { target: { value: 'fara' } });
    fireEvent.click(within(zi).getByRole('button', { name: 'Marchează că a venit' }));
    await waitFor(() => expect(api.seteazaPrezenta).toHaveBeenCalledWith('tok', 's1', 'fara', 'yes'));
  });

  it('o zi reactivată departe, fără sondaj, nu ascunde antrenamentul pe care orarul îl întreabă înainte', async () => {
    const primul = urmatorulSondaj([1, 3], '12:00', new Date());
    expect(primul).not.toBeNull();
    const departe = new Date(`${primul!.antrenament}T12:00:00Z`);
    departe.setUTCDate(departe.getUTCDate() + 14);
    const ziDeparte = departe.toISOString().slice(0, 10);
    api.incarcaSala.mockResolvedValue(
      dateSala({
        azi: primul!.data,
        antrenamente: [
          { id: 'r', session_date: ziDeparte, starts_at: '06:30', location: 'Parc', status: 'scheduled', poll_sent: false },
        ],
        raspunsuri: [],
      })
    );
    randeaza();
    const titlu = await screen.findByRole('heading', { level: 2 });
    expect(titlu.textContent).toBe(dataLunga(primul!.antrenament));
    expect(screen.queryByRole('heading', { name: dataLunga(ziDeparte) })).toBeNull();
  });

  it('„×" șterge răspunsul cuiva', async () => {
    api.incarcaSala.mockResolvedValue(dateSala());
    randeaza();
    fireEvent.click(await screen.findByRole('button', { name: 'Șterge răspunsul lui Ana, Joi, 8 oct' }));
    await waitFor(() => expect(api.seteazaPrezenta).toHaveBeenCalledWith('tok', 's2', 'ana', 'clear'));
  });

  it('antrenamentele trecute se arată câte șase, cu „Arată mai multe"', async () => {
    api.incarcaSala.mockResolvedValue(dateSala({ antrenamente: Array.from({ length: 8 }, (_, i) => trecut(i)), raspunsuri: [] }));
    randeaza();
    await screen.findByRole('button', { name: 'Arată mai multe (2)' });
    expect(document.querySelectorAll('details.admin-sala-trecut')).toHaveLength(6);
    fireEvent.click(screen.getByRole('button', { name: 'Arată mai multe (2)' }));
    expect(document.querySelectorAll('details.admin-sala-trecut')).toHaveLength(8);
  });

  it('fără antrenament următor, sondajul promis sare peste o zi anulată', async () => {
    const primul = urmatorulSondaj([1, 3], '12:00', new Date());
    expect(primul).not.toBeNull();
    api.incarcaSala.mockResolvedValue(
      dateSala({
        antrenamente: [
          { id: 'x', session_date: primul!.antrenament, starts_at: '06:30', location: 'Parc', status: 'cancelled', poll_sent: false },
        ],
        raspunsuri: [],
      })
    );
    randeaza();
    const titlu = await screen.findByRole('heading', { level: 2 });
    expect(titlu.textContent).not.toBe(dataLunga(primul!.antrenament));
  });
});
