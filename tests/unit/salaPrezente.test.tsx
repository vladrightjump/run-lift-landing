import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, within, fireEvent, waitFor } from '@testing-library/react';
import { FurnizorSesiuneAdmin } from '../../src/admin/adminSession';
import { EcranPrezente } from '../../src/admin/sala/EcranPrezente';
import { SubmitHttpError } from '../../src/lib/supabase';
import { dateSala, membruSala } from './helpers/salaFixtures';
import { dataLunga, urmatorulSondaj } from '../../src/admin/sala/sondaj';
import type { SalaAntrenament } from '../../src/lib/salaApi';

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
