import { describe, it, expect } from 'vitest';
import {
  normalizeWaitlist,
  normalizeParticipant,
  dedupeByEmail,
  recipientsFor,
  audientaLog,
  fillTemplate,
} from '../../src/admin/emailAudience';
import type { Recipient } from '../../src/admin/emailAudience';
import type {
  AdminRegistration,
  AdminLaunchSignup,
  AdminWaitlistEntry,
} from '../../src/lib/adminApi';

const reg = (over: Partial<AdminRegistration> = {}): AdminRegistration => ({
  id: 'r1',
  created_at: '2026-08-01T10:00:00Z',
  nume: 'Ion Pop',
  telefon: '069000001',
  email: 'ion@ex.ro',
  echipa: '',
  editie: 5,
  dezabonat_la: null,
  ...over,
});

const wl = (over: Partial<AdminWaitlistEntry> = {}): AdminWaitlistEntry => ({
  id: 'w1',
  created_at: '2026-08-02T10:00:00Z',
  nume: 'Ana Ban',
  telefon: '069000002',
  email: 'ana@ex.ro',
  editie: 5,
  ...over,
});

const ln = (over: Partial<AdminLaunchSignup> = {}): AdminLaunchSignup => ({
  id: 'l1',
  created_at: '2026-08-03T10:00:00Z',
  nume: 'Radu',
  prenume: 'Mihai',
  email: 'radu@ex.ro',
  telefon: '069000003',
  editie: 5,
  sursa: 'lansare',
  confirmat_la: null,
  dezabonat_la: null,
  ...over,
});

const rec = (over: Partial<Recipient>): Recipient => ({
  id: 'x',
  nume: 'X',
  prenume: 'X',
  email: 'x@ex.ro',
  telefon: '',
  created_at: '',
  dezabonat: false,
  ...over,
});

describe('emailAudience', () => {
  it('normalizeWaitlist derivă prenume din nume și nu e niciodată dezabonat', () => {
    const r = normalizeWaitlist(wl({ nume: 'Ana Maria Ban' }));
    expect(r.prenume).toBe('Ana');
    expect(r.dezabonat).toBe(false);
  });

  it('normalizeParticipant marchează dezabonat după dezabonat_la', () => {
    expect(normalizeParticipant(reg({ dezabonat_la: null })).dezabonat).toBe(false);
    expect(normalizeParticipant(reg({ dezabonat_la: '2026-08-05T00:00:00Z' })).dezabonat).toBe(true);
  });

  it('dedupeByEmail elimină dublurile case-insensitive, păstrează prima apariție', () => {
    const out = dedupeByEmail([
      rec({ id: 'a', email: 'X@ex.ro' }),
      rec({ id: 'b', email: 'x@ex.ro' }),
      rec({ id: 'c', email: 'c@ex.ro' }),
    ]);
    expect(out.map((r) => r.id)).toEqual(['a', 'c']);
  });

  it('recipientsFor întoarce lista corectă pentru fiecare audiență', () => {
    const src = {
      participants: [reg({ id: 'r1', email: 'ion@ex.ro' })],
      eventWaitlist: [wl({ id: 'w1', email: 'ana@ex.ro' })],
      launch: [ln({ id: 'l1', email: 'radu@ex.ro' })],
    };
    expect(recipientsFor('participanti', src).map((r) => r.email)).toEqual(['ion@ex.ro']);
    expect(recipientsFor('eveniment', src).map((r) => r.email)).toEqual(['ana@ex.ro']);
    expect(recipientsFor('lansare', src).map((r) => r.email)).toEqual(['radu@ex.ro']);
    expect(
      recipientsFor('toti', src)
        .map((r) => r.email)
        .sort()
    ).toEqual(['ana@ex.ro', 'ion@ex.ro', 'radu@ex.ro']);
  });

  it('recipientsFor „toti" deduplică între liste; participantul are prioritate', () => {
    const src = {
      participants: [reg({ id: 'r1', email: 'dup@ex.ro' })],
      eventWaitlist: [wl({ id: 'w1', email: 'DUP@ex.ro' })],
      launch: [],
    };
    const out = recipientsFor('toti', src);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('r1');
  });

  it('audientaLog mapează audiențele pe etichetele jurnalului', () => {
    expect(audientaLog('participanti')).toBe('participanti');
    expect(audientaLog('toti')).toBe('participanti');
    expect(audientaLog('eveniment')).toBe('asteptare');
    expect(audientaLog('lansare')).toBe('asteptare');
  });

  it('fillTemplate înlocuiește toate variabilele', () => {
    const r = rec({ nume: 'Ion Pop', prenume: 'Ion', email: 'ion@ex.ro', telefon: '069' });
    const out = fillTemplate(
      'Salut {prenume} ({nume}), {email} / {telefon} — {data_inscrierii}',
      r,
      '01.08.2026'
    );
    expect(out).toBe('Salut Ion (Ion Pop), ion@ex.ro / 069 — 01.08.2026');
  });

  it('fillTemplate derivă prenume din nume dacă lipsește', () => {
    expect(fillTemplate('{prenume}', rec({ nume: 'Ana Maria', prenume: '' }), '')).toBe('Ana');
  });

  it('fillTemplate înlocuiește toate aparițiile aceleiași variabile', () => {
    expect(fillTemplate('{nume}-{nume}', rec({ nume: 'X' }), '')).toBe('X-X');
  });
});
