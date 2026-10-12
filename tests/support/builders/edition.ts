import type { AdminEdition } from '../../../src/lib/adminApi';

export const editie = (over: Partial<AdminEdition> = {}): AdminEdition => ({
  editie: 5,
  participanti: 2,
  asteptare: 0,
  lansare: 0,
  prima: '2026-08-01T10:00:00Z',
  ultima: '2026-08-20T10:00:00Z',
  este_curenta: true,
  ...over,
});
