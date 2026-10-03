import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, within, fireEvent, waitFor } from '@testing-library/react';
import { FurnizorSesiuneAdmin } from '../../src/admin/adminSession';
import { EcranMembri } from '../../src/admin/sala/EcranMembri';
import { comandaSala, dateSala, membruSala } from './helpers/salaFixtures';

const api = vi.hoisted(() => ({
  incarcaSala: vi.fn(),
  scoateDinGrup: vi.fn(),
  leagaCont: vi.fn(),
  membruDinCont: vi.fn(),
  salveazaMembru: vi.fn(),
  unesteMembri: vi.fn(),
}));
vi.mock('../../src/lib/salaApi', async (orig) => ({
  ...(await orig<typeof import('../../src/lib/salaApi')>()),
  ...api,
}));

const randeaza = () =>
  render(
    <FurnizorSesiuneAdmin token="tok" onAuthError={() => false} showToast={vi.fn()}>
      <EcranMembri />
    </FurnizorSesiuneAdmin>
  );

const randul = (nume: string) => screen.getByText(nume, { selector: '.admin-sala-nume, .admin-sala-nume *' }).closest('li') as HTMLElement;

beforeEach(() => {
  Object.values(api).forEach((f) => f.mockReset());
  Object.values(api).forEach((f) => f.mockResolvedValue(undefined));
});
afterEach(cleanup);

describe('Membrii grupului', () => {
  it('caută după utilizatorul de Telegram', async () => {
    api.incarcaSala.mockResolvedValue(dateSala());
    randeaza();
    await screen.findByText('Ion');
    fireEvent.change(screen.getByLabelText('Caută un membru'), { target: { value: '@ana_run' } });
    expect(screen.getByText('Ana')).toBeTruthy();
    expect(screen.queryByText('Ion')).toBeNull();
  });

  it('Covers AE2. la un admin, scoaterea e dezactivată și spune de ce', async () => {
    api.incarcaSala.mockResolvedValue(dateSala());
    randeaza();
    await screen.findByText('Ion');
    const rand = randul('Roma');
    const buton = within(rand).getByRole('button', { name: /Scoate din grup/ }) as HTMLButtonElement;
    expect(buton.disabled).toBe(true);
    expect(within(rand).getByText('Adminii grupului nu se scot.')).toBeTruthy();
  });

  it('fără cont de Telegram, scoaterea e dezactivată', async () => {
    api.incarcaSala.mockResolvedValue(dateSala());
    randeaza();
    await screen.findByText('Ion');
    expect((within(randul('Fara')).getByRole('button', { name: /Scoate din grup/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('Covers AE3. o scoatere eșuată rămâne la vedere, cu motivul, și se poate reîncerca', async () => {
    // Starea reală de după cerere: serverul l-a trecut deja pe „ieșit", deci sub
    // filtrul implicit („Activi") n-ar mai apărea în listă.
    api.incarcaSala.mockResolvedValue(
      dateSala({
        membri: [...dateSala().membri.filter((m) => m.id !== 'ion'), membruSala('ion', { status: 'cancelled' })],
        comenzi: [
          comandaSala({ action: 'kick_member', member_id: 'ion', status: 'failed', result: 'Bad Request: not enough rights' }),
        ],
      })
    );
    randeaza();
    const sectiune = (await screen.findByRole('heading', { name: /Scoateri eșuate/ })).closest('section') as HTMLElement;
    expect(within(sectiune).getByText(/scoaterea a eșuat: Bad Request: not enough rights/)).toBeTruthy();
    fireEvent.click(within(sectiune).getByRole('button', { name: /Reîncearcă scoaterea lui Ion/ }));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Scoate din grup' }));
    await waitFor(() => expect(api.scoateDinGrup).toHaveBeenCalledWith('tok', 'ion'));
  });

  it('un membru ieșit cu scoaterea reușită nu apare la „Scoateri eșuate" și nu se mai scoate', async () => {
    api.incarcaSala.mockResolvedValue(
      dateSala({
        membri: [...dateSala().membri.filter((m) => m.id !== 'ion'), membruSala('ion', { status: 'cancelled' })],
        comenzi: [comandaSala({ action: 'kick_member', member_id: 'ion', status: 'done' })],
      })
    );
    randeaza();
    await screen.findByText('Ana');
    expect(screen.queryByRole('heading', { name: /Scoateri eșuate/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Ieșiți' }));
    expect((within(randul('Ion')).getByRole('button', { name: /Scoate din grup: E deja ieșit/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('scoaterea unui membru obișnuit cere confirmare, apoi cheamă serverul', async () => {
    api.incarcaSala.mockResolvedValue(dateSala());
    randeaza();
    await screen.findByText('Ion');
    fireEvent.click(within(randul('Ion')).getByRole('button', { name: /Scoate-l pe Ion/ }));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Scoate din grup' }));
    await waitFor(() => expect(api.scoateDinGrup).toHaveBeenCalledWith('tok', 'ion'));
  });

  it('leagă un cont necunoscut de membrul ales', async () => {
    api.incarcaSala.mockResolvedValue(
      dateSala({
        necunoscuti: [{ telegram_user_id: 909, username: 'nou', first_name: 'Dan', last_name: null, created_at: 'x' }],
      })
    );
    randeaza();
    await screen.findByText(/Conturi de Telegram nelegate/);
    fireEvent.change(screen.getByLabelText('Membrul de care se leagă contul lui Dan'), { target: { value: 'fara' } });
    fireEvent.click(screen.getByRole('button', { name: 'Leagă' }));
    await waitFor(() => expect(api.leagaCont).toHaveBeenCalledWith('tok', 909, 'fara'));
  });

  it('unirea nu se poate confirma cu același membru pe ambele poziții', async () => {
    api.incarcaSala.mockResolvedValue(dateSala());
    randeaza();
    await screen.findByText('Ion');
    fireEvent.click(screen.getByRole('button', { name: /Unește doi membri/ }));
    const dialog = within(screen.getByRole('dialog'));
    fireEvent.change(dialog.getByLabelText('Păstrează'), { target: { value: 'ana' } });
    fireEvent.change(dialog.getByLabelText('Duplicatul (dispare)'), { target: { value: 'ana' } });
    expect((dialog.getByRole('button', { name: 'Unește' }) as HTMLButtonElement).disabled).toBe(true);
    expect(dialog.getByText('Alege doi membri diferiți.')).toBeTruthy();
  });

  it('nu există nicio acțiune de ștergere definitivă', async () => {
    api.incarcaSala.mockResolvedValue(dateSala());
    randeaza();
    await screen.findByText('Ion');
    expect(screen.queryByRole('button', { name: /Șterge|Elimină/ })).toBeNull();
  });
});
