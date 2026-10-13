import type { AdminReelRow } from '../../../src/features/admin/zones/site/api';

export const reel = (over: Partial<AdminReelRow> = {}): AdminReelRow => ({
  id: 'c1', numar: 1, youtube: 'dQw4w9WgXcQ', caption: 'Marți seara, în parc',
  url: 'https://www.instagram.com/reel/AAAAA11111/', vizibil: true, ...over,
});
