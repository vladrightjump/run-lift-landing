import { describe, it, expect } from 'vitest';
import {
  antrenamentulUrmator,
  cineVine,
  raspunsul,
  sesiuniPentruStatistici,
} from '../../src/admin/sala/model';
import type { SalaDate, SalaMembru } from '../../src/lib/salaApi';

const membru = (id: string, peste: Partial<SalaMembru> = {}): SalaMembru => ({
  id,
  full_name: id.toUpperCase(),
  status: 'active',
  is_admin: false,
  telegram_user_id: 100 + id.length,
  telegram_username: null,
  bot_dm_enabled: false,
  join_date: '2026-07-01',
  ...peste,
});

const date = (peste: Partial<SalaDate> = {}): SalaDate => ({
  azi: '2026-10-07',
  config: null,
  membri: [
    membru('ana'),
    membru('ion'),
    membru('maria'),
    membru('vechi', { status: 'cancelled' }),
    membru('fara', { telegram_user_id: null }),
  ],
  antrenamente: [
    { id: 's3', session_date: '2026-10-08', starts_at: '06:30', location: 'Parc', status: 'scheduled', poll_sent: true },
    { id: 's2', session_date: '2026-10-06', starts_at: '06:30', location: 'Parc', status: 'done', poll_sent: true },
    { id: 's1', session_date: '2026-10-01', starts_at: '06:30', location: 'Parc', status: 'done', poll_sent: true },
  ],
  raspunsuri: [
    { session_id: 's3', member_id: 'ana', response: 'yes', is_first_training: false, responded_at: '2026-10-07T09:00:00Z' },
    { session_id: 's3', member_id: 'ion', response: 'no', is_first_training: false, responded_at: '2026-10-07T09:01:00Z' },
    { session_id: 's2', member_id: 'maria', response: 'yes', is_first_training: true, responded_at: '2026-10-05T09:00:00Z' },
  ],
  necunoscuti: [],
  comenzi: [],
  ...peste,
});

describe('antrenamentulUrmator', () => {
  it('primul neanulat de azi încolo', () => {
    expect(antrenamentulUrmator(date())?.id).toBe('s3');
  });

  it('sare peste unul anulat', () => {
    const d = date();
    d.antrenamente.unshift({
      id: 's4', session_date: '2026-10-07', starts_at: '06:30', location: 'Parc', status: 'cancelled', poll_sent: false,
    });
    expect(antrenamentulUrmator(d)?.id).toBe('s3');
  });

  it('azi se socotește „de acum încolo"', () => {
    const d = date({ azi: '2026-10-08' });
    expect(antrenamentulUrmator(d)?.id).toBe('s3');
  });

  it('fără antrenament viitor → null', () => {
    expect(antrenamentulUrmator(date({ azi: '2026-10-09' }))).toBeNull();
  });
});

describe('cineVine', () => {
  it('împarte în vin, nu vin și n-au răspuns', () => {
    const c = cineVine(date(), 's3');
    expect(c.vin.map((m) => m.id)).toEqual(['ana']);
    expect(c.nuVin.map((m) => m.id)).toEqual(['ion']);
    expect(c.nuAuRaspuns.map((m) => m.id)).toEqual(['maria']);
  });

  it('un membru inactiv sau fără cont de Telegram nu apare la „n-au răspuns"', () => {
    const ids = cineVine(date(), 's3').nuAuRaspuns.map((m) => m.id);
    expect(ids).not.toContain('vechi');
    expect(ids).not.toContain('fara');
  });

  it('un rând dublat pentru același membru se numără o dată', () => {
    const d = date();
    d.raspunsuri.push({ ...d.raspunsuri[0], response: 'no' });
    const c = cineVine(d, 's3');
    expect(c.vin.map((m) => m.id)).toEqual(['ana']);
    expect(c.nuVin.map((m) => m.id)).toEqual(['ion']);
  });

  it('un membru inactiv care a votat totuși apare la vin', () => {
    const d = date();
    d.raspunsuri.push({
      session_id: 's3', member_id: 'vechi', response: 'yes', is_first_training: false, responded_at: '2026-10-07T10:00:00Z',
    });
    expect(cineVine(d, 's3').vin.map((m) => m.id)).toEqual(['ana', 'vechi']);
  });
});

describe('sesiuniPentruStatistici', () => {
  it('leagă răspunsurile de antrenamente, cu numele membrului', () => {
    const s = sesiuniPentruStatistici(date());
    expect(s.find((x) => x.id === 's3')?.attendance).toEqual([
      { response: 'yes', is_first_training: false, member: { id: 'ana', full_name: 'ANA' } },
      { response: 'no', is_first_training: false, member: { id: 'ion', full_name: 'ION' } },
    ]);
    expect(s.find((x) => x.id === 's1')?.attendance).toEqual([]);
  });
});

describe('raspunsul', () => {
  it('găsește răspunsul unui membru sau întoarce null', () => {
    expect(raspunsul(date(), 's3', 'ana')).toBe('yes');
    expect(raspunsul(date(), 's3', 'maria')).toBeNull();
  });
});
