import { describe, it, expect } from 'vitest';
import { cheieDifuzare, ultimaDifuzare } from '../../src/admin/sendLock';
import type { AdminEmailLogEntry } from '../../src/lib/adminApi';

const log = (over: Partial<AdminEmailLogEntry> = {}): AdminEmailLogEntry => ({
  id: 'e1',
  created_at: '2026-08-20T12:00:00Z',
  email: 'a@ex.ro',
  nume: 'Ana',
  subiect: 'Detalii pentru sâmbătă',
  text_email: 'text',
  mod: 'admin',
  audienta: 'participanti',
  status: 'trimis',
  provider_status: 200,
  eroare: null,
  editie: 5,
  ...over,
});

describe('cheieDifuzare', () => {
  it('aceeași ediție + audiență + subiect dau aceeași cheie', () => {
    expect(cheieDifuzare(5, 'participanti', 'Detalii pentru sâmbătă')).toBe(
      cheieDifuzare(5, 'participanti', 'Detalii pentru sâmbătă')
    );
  });

  it('subiect schimbat → cheie diferită', () => {
    expect(cheieDifuzare(5, 'participanti', 'Detalii pentru sâmbătă')).not.toBe(
      cheieDifuzare(5, 'participanti', 'Detalii pentru duminică')
    );
  });

  it('audiență schimbată → cheie diferită', () => {
    expect(cheieDifuzare(5, 'participanti', 'Acelasi')).not.toBe(
      cheieDifuzare(5, 'asteptare', 'Acelasi')
    );
  });

  it('ediție schimbată → cheie diferită', () => {
    // Altfel aceeași difuzare n-ar mai putea pleca la ediția următoare.
    expect(cheieDifuzare(5, 'participanti', 'Acelasi')).not.toBe(
      cheieDifuzare(6, 'participanti', 'Acelasi')
    );
  });

  it('spațiile și majusculele din subiect nu schimbă cheia', () => {
    // Un subiect recompus identic, dar cu un spațiu în plus, e aceeași difuzare.
    expect(cheieDifuzare(5, 'participanti', '  Detalii   pentru sâmbătă ')).toBe(
      cheieDifuzare(5, 'participanti', 'detalii pentru sâmbătă')
    );
  });

  it('suprascrierea dă o cheie nouă, dar stabilă pentru același jeton', () => {
    const fara = cheieDifuzare(5, 'participanti', 'Acelasi');
    const cu = cheieDifuzare(5, 'participanti', 'Acelasi', 'jeton-1');
    expect(cu).not.toBe(fara);
    // Un al doilea click pe „trimite oricum" refolosește jetonul → server refuză.
    expect(cheieDifuzare(5, 'participanti', 'Acelasi', 'jeton-1')).toBe(cu);
    // O suprascriere nouă, deliberată, e o cheie nouă.
    expect(cheieDifuzare(5, 'participanti', 'Acelasi', 'jeton-2')).not.toBe(cu);
  });

  it('cheia nu conține caractere care ar strica o cheie app_config', () => {
    const k = cheieDifuzare(5, 'participanti', 'Diacritice: șțăîâ & spații');
    expect(k).toMatch(/^[a-z0-9:_-]+$/);
  });
});

describe('ultimaDifuzare', () => {
  it('fără nicio trimitere anterioară întoarce null', () => {
    expect(ultimaDifuzare([], 5, 'participanti', 'Detalii pentru sâmbătă')).toBeNull();
  });

  it('raportează când s-a trimis și către câți', () => {
    const intrari = [
      log({ id: 'a', email: 'a@ex.ro' }),
      log({ id: 'b', email: 'b@ex.ro' }),
      log({ id: 'c', email: 'c@ex.ro' }),
    ];
    const r = ultimaDifuzare(intrari, 5, 'participanti', 'Detalii pentru sâmbătă');
    expect(r?.catreCati).toBe(3);
    expect(r?.cand).toBe('2026-08-20T12:00:00Z');
  });

  it('numără doar ultima difuzare, nu toate încercările istorice', () => {
    const intrari = [
      log({ id: 'nou1', email: 'a@ex.ro', created_at: '2026-08-21T09:00:00Z' }),
      log({ id: 'vechi1', email: 'a@ex.ro', created_at: '2026-08-20T12:00:00Z' }),
      log({ id: 'vechi2', email: 'b@ex.ro', created_at: '2026-08-20T12:00:00Z' }),
    ];
    const r = ultimaDifuzare(intrari, 5, 'participanti', 'Detalii pentru sâmbătă');
    expect(r?.catreCati).toBe(1);
    expect(r?.cand).toBe('2026-08-21T09:00:00Z');
  });

  it('ignoră alt subiect, altă audiență și emailurile automate', () => {
    const intrari = [
      log({ id: 'x', subiect: 'Alt subiect' }),
      log({ id: 'y', audienta: 'asteptare' }),
      // Reminderul programat nu e o difuzare manuală — nu blochează una.
      log({ id: 'z', mod: 'broadcast' }),
    ];
    expect(ultimaDifuzare(intrari, 5, 'participanti', 'Detalii pentru sâmbătă')).toBeNull();
  });

  it('o trimitere eșuată contează tot ca trimitere anterioară', () => {
    // Altfel operatorul retrimite orbește peste cei cărora chiar le-a ajuns.
    const intrari = [log({ id: 'f', status: 'esuat', provider_status: 422 })];
    expect(ultimaDifuzare(intrari, 5, 'participanti', 'Detalii pentru sâmbătă')?.catreCati).toBe(1);
  });
});
