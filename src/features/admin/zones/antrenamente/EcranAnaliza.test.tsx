import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, within, waitFor } from '@testing-library/react';
import { FurnizorSesiuneAdmin } from '../../data/adminSession';
import { EcranAnaliza } from './EcranAnaliza';
import { dateSala } from '../../../../../tests/support/builders/sala';
import type { SalaDate } from './api';

const api = vi.hoisted(() => ({ incarcaSala: vi.fn(), incarcaVoturi: vi.fn(), scoateDinGrup: vi.fn() }));
vi.mock('./api', async (orig) => ({
  ...(await orig<typeof import('./api')>()),
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
  api.incarcaVoturi.mockReset().mockResolvedValue({ posted_at: null, votes: [] });
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
    fireEvent.click(screen.getByRole('button', { name: '90 de zile' }));
    expect(cifra('antrenamente')).toBe('2');
  });

  it('distinge lista salvată de totalul estimat când schimb perioada și sondajul', async () => {
    const d = cuUnulVechi();
    const recent = d.antrenamente.find((s) => s.id === 's1')!;
    recent.poll_roster = ['ana', 'maria', 'roma'];
    api.incarcaSala.mockResolvedValue(d);
    randeaza();
    await screen.findByText(/Membri incluși în calcul: 2 · 1 „Vin”/);
    expect(screen.getByText(/Total calculat din lista salvată/)).toBeTruthy();
    expect(screen.getByText(/Comparația cu perioada anterioară folosește/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '90 de zile' }));
    expect(screen.getByText(/Unele totaluri de membri din perioada selectată/)).toBeTruthy();
    fireEvent.click(screen.getAllByRole('listitem', { name: /vin,.*fără răspuns/ })[0]);
    expect(screen.getByText(/Membri incluși în calcul: 3 · 1 „Vin”/)).toBeTruthy();
    expect(screen.getByText(/Total estimat din voturile înregistrate/)).toBeTruthy();
  });

  it('lista „inactivi" îi conține pe cei fără prezență în ultimele 14 zile', async () => {
    api.incarcaSala.mockResolvedValue(cuUnulVechi());
    randeaza();
    await screen.findByText('Fiecare antrenament');
    fireEvent.click(screen.getByRole('button', { name: 'Ultima confirmare acum peste 14 zile' }));
    const lista = screen.getByRole('heading', { name: 'Membrii' }).parentElement as HTMLElement;
    expect(within(lista).getByText('Ion')).toBeTruthy();
    expect(within(lista).queryByText('Maria')).toBeNull();
  });

  it('istoricul unui membru arată procentul și punctele', async () => {
    api.incarcaSala.mockResolvedValue(dateSala());
    randeaza();
    await screen.findByText('Fiecare antrenament');
    const rand = screen.getByText('Maria', { selector: '[data-css~="admin-sala-nume"]' }).closest('li') as HTMLElement;
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
    screen.getAllByText(nume, { selector: '[data-css~="admin-sala-nume"]' }).map((e) => e.closest('li') as HTMLElement)[0];

  it('se face de aici cu același dialog ca pe Membri', async () => {
    api.incarcaSala.mockResolvedValue(dateSala());
    randeaza();
    await screen.findByText('Ion', { selector: '[data-css~="admin-sala-nume"]' });
    fireEvent.click(within(randul('Ion')).getByRole('button', { name: /Scoate-l pe Ion/ }));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Scoate din grup' }));
    await waitFor(() => expect(api.scoateDinGrup).toHaveBeenCalledWith('tok', 'ion'));
  });

  it('exclude administratorii din statistici, inclusiv când au votat', async () => {
    const d = dateSala();
    d.raspunsuri.push({ ...d.raspunsuri[2], member_id: 'roma' });
    api.incarcaSala.mockResolvedValue(d);
    randeaza();
    await screen.findByText('Fiecare antrenament');
    expect(screen.queryByText('Roma')).toBeNull();
    expect(cifra('au răspuns „Vin”, în medie')).toBe('33%');
    expect(cifra('cele mai multe confirmări')).toBe('1');
    expect(cifra('fără răspuns')).toBe('2');
  });

  it('arată votul inițial și fiecare schimbare cu ora locală și durata', async () => {
    api.incarcaSala.mockResolvedValue(cuUnulVechi());
    const vot = { name: 'Maria', member_id: 'maria', response: 'yes', at: '2026-10-05T09:02:00Z' };
    api.incarcaVoturi.mockResolvedValue({
      posted_at: '2026-10-05T09:00:00Z',
      votes: [vot, vot, { ...vot, response: 'no', at: '2026-10-05T09:30:00Z' },
        { ...vot, at: '2026-10-05T10:00:00Z' }],
    });
    randeaza();
    const jurnal = within(await screen.findByRole('region', { name: 'Voturile din sondaj' }));
    expect(await jurnal.findByText(/Vin → Nu vin/)).toBeTruthy();
    expect(jurnal.getByText(/Nu vin → Vin/)).toBeTruthy();
    expect(jurnal.getAllByText(/după 2 min/)).toHaveLength(1);
    expect(jurnal.getByText(/12:02/)).toBeTruthy();
    api.incarcaVoturi.mockResolvedValue({ posted_at: null, votes: [vot] });
    fireEvent.click(screen.getByRole('button', { name: '90 de zile' }));
    fireEvent.click(screen.getAllByRole('listitem', { name: /vin,.*fără răspuns/ })[0]);
    expect(await screen.findByText(/Ora publicării lipsește/)).toBeTruthy();
    expect(screen.queryByText(/Vin → Nu vin/)).toBeNull();
  });
});
