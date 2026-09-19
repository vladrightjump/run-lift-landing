import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { FurnizorSesiuneAdmin } from '../../src/admin/adminSession';
import { AdminAntrenamentTab } from '../../src/admin/AdminAntrenamentTab';
import type { AdminWorkoutRow } from '../../src/lib/adminApi';

/**
 * Ecranul antrenamentului săptămânii.
 *
 * Contractul păzit aici: refuzul serverului ajunge la om fără să-i piardă
 * textul, comutatorul e independent de conținut, iar o salvare proprie nu
 * rescrie câmpurile din care tocmai edita cineva.
 */

const { listWeeklyWorkout, saveWeeklyWorkout, restoreWeeklyWorkout, mesajRefuzAntrenament } =
  vi.hoisted(() => ({
    listWeeklyWorkout: vi.fn(),
    saveWeeklyWorkout: vi.fn(),
    restoreWeeklyWorkout: vi.fn(),
    mesajRefuzAntrenament: vi.fn((e: unknown) =>
      String(e).includes('workout_empty') ? 'Nu poți porni pagina cu antrenamentul gol.' : 'eroare'
    ),
  }));

vi.mock('../../src/lib/adminApi', () => ({
  listWeeklyWorkout,
  saveWeeklyWorkout,
  restoreWeeklyWorkout,
  mesajRefuzAntrenament,
}));

const showToast = vi.fn();
const onAuthError = vi.fn(() => false);

const rand = (over: Partial<AdminWorkoutRow> = {}): AdminWorkoutRow => ({
  id: 'r1',
  status: 'published',
  titlu: 'Tempo',
  corp: '5×1000m',
  activ: true,
  creat_la: '2026-09-15T10:00:00Z',
  ...over,
});

const randeaza = () =>
  render(
    <FurnizorSesiuneAdmin token="t" onAuthError={onAuthError} showToast={showToast}>
      <AdminAntrenamentTab />
    </FurnizorSesiuneAdmin>
  );

const camp = (eticheta: RegExp): HTMLInputElement | HTMLTextAreaElement =>
  screen.getByLabelText(eticheta) as HTMLInputElement | HTMLTextAreaElement;

const butonSalveaza = (): HTMLButtonElement =>
  screen.getByRole('button', { name: /Salvează|Se salvează/ }) as HTMLButtonElement;

beforeEach(() => {
  vi.clearAllMocks();
  listWeeklyWorkout.mockResolvedValue([rand()]);
  saveWeeklyWorkout.mockResolvedValue('r2');
  restoreWeeklyWorkout.mockResolvedValue('r1');
});

afterEach(cleanup);

describe('la deschidere', () => {
  it('populează formularul din antrenamentul publicat', async () => {
    randeaza();
    await waitFor(() => expect(camp(/Titlu/).value).toBe('Tempo'));
    expect(camp(/Antrenamentul/).value).toBe('5×1000m');
  });

  it('spune dacă pagina e pornită sau oprită, fără să intri în ea', async () => {
    listWeeklyWorkout.mockResolvedValue([rand({ activ: false })]);
    randeaza();
    await waitFor(() => expect(screen.getByText('oprită')).toBeDefined());
  });

  it('fără niciun antrenament salvat, ecranul se randează gol, nu rupt', async () => {
    listWeeklyWorkout.mockResolvedValue([]);
    randeaza();
    await waitFor(() => expect(camp(/Titlu/).value).toBe(''));
    expect(screen.getByText('—')).toBeDefined();
  });
});

describe('salvarea', () => {
  it('trimite exact ce e în câmpuri', async () => {
    randeaza();
    await waitFor(() => expect(camp(/Titlu/).value).toBe('Tempo'));

    fireEvent.change(camp(/Antrenamentul/), { target: { value: '6×1000m' } });
    fireEvent.click(butonSalveaza());

    await waitFor(() =>
      expect(saveWeeklyWorkout).toHaveBeenCalledWith('t', 'Tempo', '6×1000m', true)
    );
  });

  it('refuzul serverului ajunge la om și textul rămâne în formular', async () => {
    saveWeeklyWorkout.mockRejectedValue(new Error('workout_empty'));
    listWeeklyWorkout.mockResolvedValue([]);
    randeaza();

    fireEvent.change(camp(/Titlu/), { target: { value: 'Tempo' } });
    fireEvent.click(butonSalveaza());

    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'error', msg: expect.stringContaining('gol') })
      )
    );
    // Textul nu se pierde: altfel un refuz ar costa tot ce tocmai s-a scris.
    expect(camp(/Titlu/).value).toBe('Tempo');
  });

  it('comutatorul e independent de conținut — oprit cu text se salvează', async () => {
    listWeeklyWorkout.mockResolvedValue([]);
    randeaza();

    fireEvent.change(camp(/Antrenamentul/), { target: { value: 'de săptămâna viitoare' } });
    fireEvent.click(screen.getByRole('button', { name: 'Oprită' }));
    fireEvent.click(butonSalveaza());

    await waitFor(() =>
      expect(saveWeeklyWorkout).toHaveBeenCalledWith('t', '', 'de săptămâna viitoare', false)
    );
  });

  it('reîncărcarea de după salvare nu calcă peste ce s-a tastat între timp', async () => {
    // Cursa reală: salvezi, componenta reinterogează lista, iar tu începi deja
    // să scrii antrenamentul următor. Răspunsul care sosește poartă valoarea
    // veche și n-are voie să-ți șteargă textul din mână.
    randeaza();
    await waitFor(() => expect(camp(/Titlu/).value).toBe('Tempo'));

    let raspunde: (v: AdminWorkoutRow[]) => void = () => {};
    listWeeklyWorkout.mockReturnValueOnce(
      new Promise<AdminWorkoutRow[]>((res) => {
        raspunde = res;
      })
    );

    fireEvent.click(butonSalveaza());
    await waitFor(() => expect(saveWeeklyWorkout).toHaveBeenCalled());

    // Reîncărcarea e în zbor; omul tastează.
    fireEvent.change(camp(/Titlu/), { target: { value: 'Fartlek' } });
    raspunde([rand({ titlu: 'Tempo' })]);

    await waitFor(() => expect(listWeeklyWorkout).toHaveBeenCalledTimes(2));
    expect(camp(/Titlu/).value).toBe('Fartlek');
  });

  it('după o salvare fără editare ulterioară, formularul se aliniază la server', async () => {
    randeaza();
    await waitFor(() => expect(camp(/Titlu/).value).toBe('Tempo'));

    listWeeklyWorkout.mockResolvedValue([rand({ id: 'r2', titlu: 'Fartlek', corp: '8×400m' })]);
    fireEvent.click(butonSalveaza());

    await waitFor(() => expect(camp(/Titlu/).value).toBe('Fartlek'));
  });
});

describe('versiunile anterioare', () => {
  it('nu se arată deloc când nu există niciuna', async () => {
    randeaza();
    await waitFor(() => expect(camp(/Titlu/).value).toBe('Tempo'));
    expect(screen.queryByText('Versiuni anterioare')).toBeNull();
  });

  it('listează doar versiunile înlocuite, nu și pe cea publicată', async () => {
    listWeeklyWorkout.mockResolvedValue([
      rand(),
      rand({ id: 'r0', status: 'superseded', titlu: 'Fartlek' }),
    ]);
    randeaza();

    await waitFor(() => expect(screen.getByText('Fartlek')).toBeDefined());
    expect(screen.getAllByRole('button', { name: 'Revino la ea' })).toHaveLength(1);
  });

  it('revenirea cheamă serverul cu id-ul versiunii', async () => {
    listWeeklyWorkout.mockResolvedValue([
      rand(),
      rand({ id: 'r0', status: 'superseded', titlu: 'Fartlek' }),
    ]);
    randeaza();

    await waitFor(() => expect(screen.getByText('Fartlek')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Revino la ea' }));

    await waitFor(() => expect(restoreWeeklyWorkout).toHaveBeenCalledWith('t', 'r0'));
  });
});

describe('sesiunea expirată', () => {
  it('un eșec de autentificare nu produce un toast de eroare obișnuit', async () => {
    onAuthError.mockReturnValueOnce(true);
    saveWeeklyWorkout.mockRejectedValue(new Error('invalid_token'));
    randeaza();
    await waitFor(() => expect(camp(/Titlu/).value).toBe('Tempo'));

    fireEvent.click(butonSalveaza());

    await waitFor(() => expect(onAuthError).toHaveBeenCalled());
    expect(showToast).not.toHaveBeenCalledWith(expect.objectContaining({ kind: 'error' }));
  });
});
