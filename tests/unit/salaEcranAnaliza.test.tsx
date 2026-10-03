import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, within, waitFor } from '@testing-library/react';
import { FurnizorSesiuneAdmin } from '../../src/admin/adminSession';
import { EcranAnaliza } from '../../src/admin/sala/EcranAnaliza';
import { dateSala } from './helpers/salaFixtures';
import type { SalaDate } from '../../src/lib/salaApi';

const api = vi.hoisted(() => ({ incarcaSala: vi.fn(), scoateDinGrup: vi.fn() }));
vi.mock('../../src/lib/salaApi', async (orig) => ({
  ...(await orig<typeof import('../../src/lib/salaApi')>()),
  ...api,
}));

const randeaza = () =>
  render(
    <FurnizorSesiuneAdmin token="tok" onAuthError={() => false} showToast={vi.fn()}>
      <EcranAnaliza />
    </FurnizorSesiuneAdmin>
  );

/** Un antrenament acum 40 de zile, în afara lunii dar în cele 3 luni. */
const cuUnulVechi = (): SalaDate => {
  const d = dateSala();
  d.antrenamente.push({ id: 's0', session_date: '2026-08-28', starts_at: '06:30', location: 'Parc', status: 'done', poll_sent: true });
  d.raspunsuri.push({ session_id: 's0', member_id: 'ion', response: 'yes', is_first_training: true, responded_at: 'x' });
  return d;
};

const cifra = (eticheta: string) =>
  screen.getByText(eticheta, { selector: 'dt' }).parentElement?.querySelector('dd')?.textContent;

beforeEach(() => {
  api.incarcaSala.mockReset();
  api.scoateDinGrup.mockReset();
  api.scoateDinGrup.mockResolvedValue('id');
});
afterEach(cleanup);

describe('Analiza prezențelor', () => {
  it('schimbarea perioadei schimbă rezumatul', async () => {
    api.incarcaSala.mockResolvedValue(cuUnulVechi());
    randeaza();
    await screen.findByText('Fiecare antrenament');
    expect(cifra('antrenamente')).toBe('1');
    fireEvent.click(screen.getByRole('button', { name: '3 luni' }));
    expect(cifra('antrenamente')).toBe('2');
  });

  it('lista „inactivi" îi conține pe cei fără prezență în ultimele 14 zile', async () => {
    api.incarcaSala.mockResolvedValue(cuUnulVechi());
    randeaza();
    await screen.findByText('Fiecare antrenament');
    fireEvent.click(screen.getByRole('button', { name: 'Inactivi 2+ săpt.' }));
    const lista = screen.getByRole('heading', { name: 'Membrii' }).parentElement as HTMLElement;
    expect(within(lista).getByText('Ion')).toBeTruthy();
    expect(within(lista).queryByText('Maria')).toBeNull();
  });

  it('istoricul unui membru arată procentul și punctele', async () => {
    api.incarcaSala.mockResolvedValue(dateSala());
    randeaza();
    await screen.findByText('Fiecare antrenament');
    const rand = screen.getByText('Maria', { selector: '.admin-sala-nume' }).closest('li') as HTMLElement;
    fireEvent.click(within(rand).getByRole('button', { name: 'Istoric' }));
    expect(within(rand).getByText(/1 din ultimele 1 \(100%\)/)).toBeTruthy();
  });

  it('fără antrenamente: spune asta, fără erori', async () => {
    api.incarcaSala.mockResolvedValue(dateSala({ antrenamente: [], raspunsuri: [] }));
    randeaza();
    expect(await screen.findByText('Niciun antrenament în perioada asta.')).toBeTruthy();
  });
});

describe('Analiza — scoaterea din grup', () => {
  const randul = (nume: string) =>
    screen.getAllByText(nume, { selector: '.admin-sala-nume' }).map((e) => e.closest('li') as HTMLElement)[0];

  it('se face de aici cu același dialog ca pe Membri', async () => {
    api.incarcaSala.mockResolvedValue(dateSala());
    randeaza();
    await screen.findByText('Ion', { selector: '.admin-sala-nume' });
    fireEvent.click(within(randul('Ion')).getByRole('button', { name: /Scoate-l pe Ion/ }));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Scoate din grup' }));
    await waitFor(() => expect(api.scoateDinGrup).toHaveBeenCalledWith('tok', 'ion'));
  });

  it('la un admin, motivul se citește și de pe ecran, și de cititorul de ecran', async () => {
    api.incarcaSala.mockResolvedValue(dateSala());
    randeaza();
    await screen.findByText('Roma', { selector: '.admin-sala-nume' });
    const rand = randul('Roma');
    expect((within(rand).getByRole('button', { name: /Scoate din grup: Adminii grupului nu se scot/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(within(rand).getByText('Adminii grupului nu se scot.')).toBeTruthy();
  });
});
