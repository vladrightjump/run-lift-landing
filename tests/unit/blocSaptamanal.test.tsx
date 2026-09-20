import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { FurnizorSesiuneAdmin } from '../../src/admin/adminSession';
import { BlocSaptamanal } from '../../src/admin/BlocSaptamanal';
import type { AdminWorkoutRow } from '../../src/lib/adminApi';

/**
 * Blocul „în fiecare săptămână", de sub linia de timp.
 *
 * Treaba lui e una singură: să spui unde a ajuns programul FĂRĂ să-l deschizi.
 * Dacă trebuie să intri în ecran ca să afli ce vede publicul, blocul n-a făcut
 * nimic. De asta testele de aici sunt despre ce SCRIE în el, nu despre ce se
 * întâmplă când apeși.
 *
 * Starea e mereu în cuvinte, nu doar prin culoarea punctului — aceeași regulă
 * ca pe nodurile liniei de timp.
 */

const { listWeeklyWorkout } = vi.hoisted(() => ({ listWeeklyWorkout: vi.fn() }));

vi.mock('../../src/lib/adminApi', () => ({ listWeeklyWorkout }));

const onAuthError = vi.fn(() => false);
const showToast = vi.fn();
const onDeschide = vi.fn();

const rand = (over: Partial<AdminWorkoutRow> = {}): AdminWorkoutRow => ({
  id: 'r1',
  numar: 1,
  status: 'published',
  titlu: 'Tempo',
  corp: '5×1000m',
  vizibil: true,
  creat_la: '2026-09-15T10:00:00Z',
  ...over,
});

const programDe = (n: number, over: Partial<AdminWorkoutRow> = {}): AdminWorkoutRow[] =>
  Array.from({ length: n }, (_, i) =>
    rand({ id: `s${i + 1}`, numar: i + 1, titlu: `S${i + 1}`, ...over })
  );

const randeaza = () =>
  render(
    <FurnizorSesiuneAdmin token="t" onAuthError={onAuthError} showToast={showToast}>
      <BlocSaptamanal onDeschide={onDeschide} />
    </FurnizorSesiuneAdmin>
  );

const bloc = () => screen.getByLabelText('În fiecare săptămână');

beforeEach(() => {
  vi.clearAllMocks();
  listWeeklyWorkout.mockResolvedValue(programDe(3));
});

afterEach(cleanup);

describe('ce scrie în bloc', () => {
  it('spune ce săptămână vede publicul și câte are programul', async () => {
    randeaza();
    await waitFor(() => expect(bloc().textContent).toMatch(/Săptămâna 3 pe pagină/));
    expect(bloc().textContent).toMatch(/S3/);
    expect(bloc().textContent).toMatch(/3 în program/);
  });

  it('săptămâna curentă e cea mai mare VIZIBILĂ, nu pur și simplu ultima', async () => {
    listWeeklyWorkout.mockResolvedValue([
      rand({ id: 's1', numar: 1, titlu: 'S1' }),
      rand({ id: 's2', numar: 2, titlu: 'S2' }),
      rand({ id: 's3', numar: 3, titlu: 'S3', vizibil: false }),
    ]);
    randeaza();

    await waitFor(() => expect(bloc().textContent).toMatch(/Săptămâna 2 pe pagină/));
    expect(bloc().textContent).toMatch(/S2/);
    // Programul are tot trei, chiar dacă una e ascunsă.
    expect(bloc().textContent).toMatch(/3 în program/);
  });

  it('cu tot programul ascuns spune că pagina e oprită, fără să inventeze un titlu', async () => {
    listWeeklyWorkout.mockResolvedValue(programDe(2, { vizibil: false }));
    randeaza();

    await waitFor(() => expect(bloc().textContent).toMatch(/Pagina e oprită/));
    expect(bloc().textContent).toMatch(/2 în program, niciuna vizibilă/);
    expect(bloc().textContent).not.toMatch(/S1|S2/);
  });

  it('fără niciun antrenament scris o spune pe șleau', async () => {
    listWeeklyWorkout.mockResolvedValue([]);
    randeaza();

    await waitFor(() => expect(bloc().textContent).toMatch(/Niciun antrenament scris încă/));
  });

  it('versiunile înlocuite nu se numără în program', async () => {
    listWeeklyWorkout.mockResolvedValue([
      ...programDe(2),
      rand({ id: 'v1', numar: 1, status: 'superseded', titlu: 'S1 vechi' }),
    ]);
    randeaza();

    await waitFor(() => expect(bloc().textContent).toMatch(/2 în program/));
  });

  it('cu o singură săptămână numără tot corect', async () => {
    listWeeklyWorkout.mockResolvedValue(programDe(1));
    randeaza();

    await waitFor(() => expect(bloc().textContent).toMatch(/Săptămâna 1 pe pagină/));
    expect(bloc().textContent).toMatch(/1 în program/);
  });

  it('cât timp lista n-a sosit, nu afirmă nimic despre stare', async () => {
    listWeeklyWorkout.mockReturnValue(new Promise(() => {}));
    randeaza();

    expect(bloc().textContent).toMatch(/se încarcă…/);
    expect(bloc().textContent).not.toMatch(/oprită|pe pagină/);
  });
});

describe('încărcarea', () => {
  it('cere lista o singură dată — antrenamentul se schimbă o dată pe săptămână', async () => {
    randeaza();
    await waitFor(() => expect(bloc().textContent).toMatch(/Săptămâna 3/));
    expect(listWeeklyWorkout).toHaveBeenCalledTimes(1);
  });

  it('un eșec de autentificare e tratat de sesiune, nu de bloc', async () => {
    onAuthError.mockReturnValue(true);
    listWeeklyWorkout.mockRejectedValue(new Error('invalid_token'));
    randeaza();

    await waitFor(() => expect(onAuthError).toHaveBeenCalled());
    expect(showToast).not.toHaveBeenCalled();
  });
});
