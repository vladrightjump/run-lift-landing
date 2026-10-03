import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { FurnizorSesiuneAdmin } from '../../src/admin/adminSession';
import { CardGrup } from '../../src/admin/sala/CardGrup';

const { incarcaRezumatSala } = vi.hoisted(() => ({ incarcaRezumatSala: vi.fn() }));
vi.mock('../../src/lib/salaApi', () => ({ incarcaRezumatSala }));

const onDeschide = vi.fn();
const randeaza = () =>
  render(
    <FurnizorSesiuneAdmin token="t" onAuthError={() => false} showToast={vi.fn()}>
      <CardGrup onDeschide={onDeschide} />
    </FurnizorSesiuneAdmin>
  );

beforeEach(() => {
  incarcaRezumatSala.mockReset();
  onDeschide.mockReset();
});
afterEach(cleanup);

describe('cardul grupului de pe pornire', () => {
  it('arată antrenamentul următor și câți vin, iar butonul deschide „Prezențe"', async () => {
    incarcaRezumatSala.mockResolvedValue({
      azi: '2026-10-07',
      pornit: true,
      poll_days: [1, 3],
      poll_time: '12:00',
      urmatorul: { session_date: '2026-10-08', starts_at: '06:30', location: 'Parc', status: 'scheduled', vin: 12, nu_vin: 3 },
    });
    randeaza();
    const card = await screen.findByLabelText('Grupul din parc');
    expect(card.textContent).toContain('Joi, 8 oct, 06:30');
    expect(card.textContent).toContain('12 vin · 3 nu');
    fireEvent.click(screen.getByRole('button', { name: 'Prezențe' }));
    expect(onDeschide).toHaveBeenCalledOnce();
  });

  it('cererea pică → cardul nu apare', async () => {
    incarcaRezumatSala.mockRejectedValue(new Error('rețea'));
    randeaza();
    await waitFor(() => expect(incarcaRezumatSala).toHaveBeenCalled());
    expect(screen.queryByLabelText('Grupul din parc')).toBeNull();
  });
});
