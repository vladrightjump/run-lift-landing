import { describe, it, expect } from 'vitest';
import {
  cheieTrimitere,
  motivEsec,
  ultimaIncercarePerCheie,
  emailuriNelivrate,
  emailuriRetrimisibile,
  participantiFaraEmail,
} from '../../src/admin/deliveryLog';
import type { AdminEmailLogEntry, AdminRegistration } from '../../src/lib/adminApi';

const log = (over: Partial<AdminEmailLogEntry> = {}): AdminEmailLogEntry => ({
  id: 'e1',
  created_at: '2026-08-10T10:00:00Z',
  email: 'a@ex.ro',
  nume: 'Ana',
  subiect: 'Reminder',
  text_email: 'text',
  mod: 'admin',
  audienta: 'participanti',
  status: 'esuat',
  provider_status: 422,
  eroare: '{"message":"Invalid email"}',
  editie: 5,
  ...over,
});

const reg = (over: Partial<AdminRegistration> = {}): AdminRegistration => ({
  id: 'r1',
  created_at: '2026-08-01T10:00:00Z',
  nume: 'Ion Pop',
  telefon: '069',
  email: 'ion@ex.ro',
  echipa: '',
  editie: 5,
  dezabonat_la: null,
  ...over,
});

describe('deliveryLog', () => {
  it('cheieTrimitere normalizează adresa și include subiectul', () => {
    expect(cheieTrimitere(log({ email: 'A@Ex.RO', subiect: 'X' }))).toBe('a@ex.ro|X');
  });

  it('motivEsec citește message din JSON-ul providerului', () => {
    expect(motivEsec(log({ eroare: '{"message":"Invalid email"}' }))).toBe('Invalid email');
  });

  it('motivEsec cade pe name, apoi corpul brut, apoi HTTP/necunoscut', () => {
    expect(motivEsec(log({ eroare: '{"name":"validation_error"}' }))).toBe('validation_error');
    expect(motivEsec(log({ eroare: 'boom' }))).toBe('boom');
    expect(motivEsec(log({ eroare: null, provider_status: 500 }))).toBe('HTTP 500');
    expect(motivEsec(log({ eroare: null, provider_status: null }))).toBe('Motiv necunoscut');
  });

  it('ultimaIncercarePerCheie păstrează prima apariție (cea mai recentă)', () => {
    const intrari = [
      log({ id: 'nou', subiect: 'S', status: 'trimis' }),
      log({ id: 'vechi', subiect: 'S', status: 'esuat' }),
    ];
    const m = ultimaIncercarePerCheie(intrari);
    expect(m.size).toBe(1);
    expect(m.get('a@ex.ro|S')?.id).toBe('nou');
  });

  it('emailuriNelivrate: o retrimitere reușită repară un eșec vechi', () => {
    const intrari = [
      log({ id: 'nou', status: 'trimis' }),
      log({ id: 'vechi', status: 'esuat' }),
      log({ id: 'alt', email: 'b@ex.ro', status: 'esuat' }),
    ];
    expect(emailuriNelivrate(intrari).map((e) => e.id)).toEqual(['alt']);
  });

  it('emailuriRetrimisibile păstrează doar modul admin', () => {
    const ne = [
      log({ id: 'a', mod: 'admin' }),
      log({ id: 'b', mod: 'broadcast' }),
      log({ id: 'c', mod: 'confirm' }),
    ];
    expect(emailuriRetrimisibile(ne).map((e) => e.id)).toEqual(['a']);
  });

  it('participantiFaraEmail: cine nu apare deloc în jurnal (case-insensitive)', () => {
    const participanti = [reg({ id: 'r1', email: 'ion@ex.ro' }), reg({ id: 'r2', email: 'Ana@Ex.ro' })];
    const intrari = [log({ email: 'ION@ex.ro' })];
    expect(participantiFaraEmail(participanti, intrari).map((p) => p.id)).toEqual(['r2']);
  });
});
