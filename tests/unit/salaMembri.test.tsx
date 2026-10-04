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
        scoateri: [
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
        scoateri: [comandaSala({ action: 'kick_member', member_id: 'ion', status: 'done' })],
      })
    );
    randeaza();
    await screen.findByText('Ana');
    expect(screen.queryByRole('heading', { name: /Scoateri eșuate/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Ieșiți' }));
    expect((within(randul('Ion')).getByRole('button', { name: /Scoate din grup: E deja ieșit/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('o scoatere eșuată rămâne reîncercabilă și după 30 de comenzi mai noi', async () => {
    // `comenzi` are doar ultimele 30; scoaterea eșuată e mai veche decât toate,
    // deci o găsește doar `scoateri` (ultima scoatere a fiecărui membru).
    api.incarcaSala.mockResolvedValue(
      dateSala({
        membri: [...dateSala().membri.filter((m) => m.id !== 'ion'), membruSala('ion', { status: 'cancelled' })],
        comenzi: Array.from({ length: 30 }, (_, i) => comandaSala({ id: `c${i}`, action: 'send_summary', status: 'done' })),
        scoateri: [comandaSala({ action: 'kick_member', member_id: 'ion', status: 'failed', result: 'Bad Request: not enough rights' })],
      })
    );
    randeaza();
    const sectiune = (await screen.findByRole('heading', { name: /Scoateri eșuate/ })).closest('section') as HTMLElement;
    expect(within(sectiune).getByRole('button', { name: /Reîncearcă scoaterea lui Ion/ })).toBeTruthy();
  });

  it('un cont parcat al cărui id e deja al unui membru nu mai apare la „nelegate"', async () => {
    // Botul l-a legat după utilizator (sau id-ul a fost scris din „Editează"),
    // dar rândul parcat a rămas: n-ar avea niciun buton care să-l rezolve.
    api.incarcaSala.mockResolvedValue(
      dateSala({
        necunoscuti: [
          { telegram_user_id: 909, username: 'nou', first_name: 'Dan', last_name: null, created_at: 'x' },
          { telegram_user_id: 1005, username: 'maria_tg', first_name: 'Maria', last_name: null, created_at: 'x' },
        ],
      })
    );
    randeaza();
    const titlu = await screen.findByRole('heading', { name: /Conturi de Telegram nelegate/ });
    expect(within(titlu).getByText('1')).toBeTruthy();
    const sectiune = titlu.closest('section') as HTMLElement;
    expect(within(sectiune).queryByLabelText(/contul lui Maria/)).toBeNull();
    expect(within(sectiune).getByLabelText('Membrul de care se leagă contul lui Dan')).toBeTruthy();
  });

  it('fără conturi cu adevărat nelegate, secțiunea lipsește', async () => {
    api.incarcaSala.mockResolvedValue(
      dateSala({
        necunoscuti: [{ telegram_user_id: 1005, username: 'maria_tg', first_name: 'Maria', last_name: null, created_at: 'x' }],
      })
    );
    randeaza();
    await screen.findByText('Ion');
    expect(screen.queryByRole('heading', { name: /Conturi de Telegram nelegate/ })).toBeNull();
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

describe('Membrii grupului — editarea, conturile, unirea', () => {
  it('editarea trimite numele, contul, starea și adminul', async () => {
    api.incarcaSala.mockResolvedValue(dateSala());
    randeaza();
    await screen.findByText('Ion');
    fireEvent.click(within(randul('Ion')).getByRole('button', { name: 'Editează' }));
    const dialog = within(screen.getByRole('dialog'));
    fireEvent.change(dialog.getByLabelText('Nume'), { target: { value: 'Ion Ceban' } });
    fireEvent.change(dialog.getByLabelText('Utilizator Telegram'), { target: { value: 'ion_c' } });
    fireEvent.change(dialog.getByLabelText('Stare'), { target: { value: 'paused' } });
    fireEvent.click(dialog.getByRole('button', { name: 'Salvează' }));
    await waitFor(() =>
      expect(api.salveazaMembru).toHaveBeenCalledWith('tok', 'ion', {
        nume: 'Ion Ceban',
        telegramId: 1003,
        telegramUser: 'ion_c',
        status: 'paused',
        admin: false,
      })
    );
  });

  it.each([
    ['un nume de o literă', 'Nume', 'I'],
    ['un id de Telegram cu litere', 'Id Telegram', '12a'],
    ['un utilizator cu caractere HTML', 'Utilizator Telegram', '<b>'],
  ])('%s blochează salvarea', async (_, camp, valoare) => {
    api.incarcaSala.mockResolvedValue(dateSala());
    randeaza();
    await screen.findByText('Ion');
    fireEvent.click(within(randul('Ion')).getByRole('button', { name: 'Editează' }));
    const dialog = within(screen.getByRole('dialog'));
    fireEvent.change(dialog.getByLabelText(camp), { target: { value: valoare } });
    expect((dialog.getByRole('button', { name: 'Salvează' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('un cont nelegat devine membru nou, cu numele din Telegram', async () => {
    api.incarcaSala.mockResolvedValue(
      dateSala({
        necunoscuti: [{ telegram_user_id: 909, username: 'nou', first_name: 'Dan', last_name: null, created_at: 'x' }],
      })
    );
    randeaza();
    fireEvent.click(await screen.findByRole('button', { name: 'Membru nou' }));
    await waitFor(() => expect(api.membruDinCont).toHaveBeenCalledWith('tok', 909, 'Dan'));
  });

  it('unirea spune cine rămâne și trimite perechea aleasă', async () => {
    api.incarcaSala.mockResolvedValue(dateSala());
    randeaza();
    await screen.findByText('Ion');
    fireEvent.click(screen.getByRole('button', { name: /Unește doi membri/ }));
    const dialog = within(screen.getByRole('dialog'));
    fireEvent.change(dialog.getByLabelText('Păstrează'), { target: { value: 'ana' } });
    fireEvent.change(dialog.getByLabelText('Duplicatul (dispare)'), { target: { value: 'ion' } });
    expect(screen.getByRole('dialog').textContent).toMatch(/Rămâne.*Ana/);
    fireEvent.click(dialog.getByRole('button', { name: 'Unește' }));
    await waitFor(() => expect(api.unesteMembri).toHaveBeenCalledWith('tok', 'ana', 'ion'));
  });

  it('textul conturilor nelegate nu mai spune că voturile lor nu se numără', async () => {
    api.incarcaSala.mockResolvedValue(
      dateSala({
        necunoscuti: [{ telegram_user_id: 909, username: 'nou', first_name: 'Dan', last_name: null, created_at: 'x' }],
      })
    );
    randeaza();
    const sectiune = (await screen.findByRole('heading', { name: /Conturi de Telegram nelegate/ })).closest('section') as HTMLElement;
    expect(sectiune.textContent).toContain('Au intrat în grup');
    expect(sectiune.textContent).not.toContain('nu se numără');
  });
});
