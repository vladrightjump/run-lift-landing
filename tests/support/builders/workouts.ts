import type { AdminWorkoutRow } from '../../../src/lib/adminApi';

export const workout = (over: Partial<AdminWorkoutRow> = {}): AdminWorkoutRow => ({
  id: 'w1', numar: 1, status: 'published', titlu: 'Bază aerobă',
  corp: '3 × 8 min alergare ușoară\nPauză 2 min între blocuri', vizibil: true,
  creat_la: '2026-08-01T10:00:00Z', ...over,
});
