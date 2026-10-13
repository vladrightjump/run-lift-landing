import { SNAPSHOT_CONFIG, type EventConfig } from '../../../src/shared/content/eventConfig';
import type { AdminEventConfigRow } from '../../../src/features/admin/zones/evenimente/api';

export const publicConfig = (over: Partial<EventConfig> = {}): EventConfig => ({
  ...structuredClone(SNAPSHOT_CONFIG), ...over,
});

export const configRow = (over: Partial<AdminEventConfigRow> = {}): AdminEventConfigRow => ({
  id: 'cfg-pub', editie: 5, config: publicConfig(), status: 'published',
  created_at: '2026-08-01T10:00:00Z', published_at: '2026-08-01T10:00:00Z', ...over,
});
