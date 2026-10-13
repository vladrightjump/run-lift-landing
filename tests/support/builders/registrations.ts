import type { AdminRegistration, AdminEmailLogEntry } from '../../../src/features/admin/zones/evenimente/api';

export const participant = (
  over: Partial<AdminRegistration> & Pick<AdminRegistration, 'id' | 'nume' | 'email'>
): AdminRegistration => ({
  created_at: '2026-08-20T10:00:00Z',
  telefon: '069000000',
  echipa: '',
  editie: 5,
  dezabonat_la: null,
  ...over,
});

export const logEntry = (
  over: Partial<AdminEmailLogEntry> & Pick<AdminEmailLogEntry, 'id' | 'email' | 'subiect'>
): AdminEmailLogEntry => ({
  created_at: '2026-08-20T12:00:00Z',
  nume: '',
  text_email: '',
  mod: 'admin',
  audienta: 'participanti',
  sablon: null,
  status: 'trimis',
  provider_status: 200,
  eroare: null,
  editie: 5,
  ...over,
});
