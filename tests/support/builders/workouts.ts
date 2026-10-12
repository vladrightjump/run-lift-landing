import type { WeeklyWorkout } from '../../../src/features/antrenament/data/api';
import type { AdminWorkoutRow } from '../../../src/lib/adminApi';

export const workout = (over: Partial<AdminWorkoutRow> = {}): AdminWorkoutRow => ({
  id: 'w1', numar: 1, status: 'published', titlu: 'Bază aerobă',
  corp: '3 × 8 min alergare ușoară\nPauză 2 min între blocuri', vizibil: true,
  creat_la: '2026-08-01T10:00:00Z', ...over,
});

/** O săptămână din programul public (`public_weekly_workouts`). */
export const saptamanaPublica = (numar: number, over: Partial<WeeklyWorkout> = {}): WeeklyWorkout => ({
  numar,
  titlu: `Titlu ${numar}`,
  corp: `corpul săptămânii ${numar}`,
  ...over,
});

/** Săptămânile 1…n, crescător, cum le dă serverul. */
export const programDe = (n: number): WeeklyWorkout[] =>
  Array.from({ length: n }, (_, i) => saptamanaPublica(i + 1));
