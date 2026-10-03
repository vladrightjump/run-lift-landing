import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, within, fireEvent, waitFor } from '@testing-library/react';
import { FurnizorSesiuneAdmin } from '../../src/admin/adminSession';
import { EcranPrezente } from '../../src/admin/sala/EcranPrezente';
import { SubmitHttpError } from '../../src/lib/supabase';
import { dateSala, membruSala } from './helpers/salaFixtures';

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
