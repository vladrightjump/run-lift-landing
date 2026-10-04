import { describe, it, expect } from 'vitest';
import {
  antrenamentulUrmator,
  cineVine,
  deMarcatDeMana,
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
  scoateri: [],
  ...peste,
});

// Miercuri 7 octombrie, 10:00 la Chișinău.
const ACUM = new Date('2026-10-07T10:00:00+03:00');
const ORAR: SalaDate['config'] = {
  enabled: true,
  poll_days: [1, 3],
  poll_time: '12:00',
  summary_days: [2, 4],
  summary_time: '06:00',
  training_time: '06:30',
  location: 'Parc',
  auto_reminder_enabled: true,
  reminder_threshold: 6,
  poll_title: null,
  poll_yes_label: null,
  poll_no_label: null,
};

describe('antrenamentulUrmator', () => {
  it('primul neanulat de azi încolo', () => {
    expect(antrenamentulUrmator(date(), ACUM)?.id).toBe('s3');
  });

  it('o zi reactivată departe, fără sondaj, nu trece înaintea zilei pe care orarul o întreabă azi', () => {
    // Singurul rând viitor e marți 20, reactivat; sondajul de azi (12:00) e pentru joi 8.
    const d = date({ config: ORAR });
    d.antrenamente = [
      { id: 's9', session_date: '2026-10-20', starts_at: '06:30', location: 'Parc', status: 'scheduled', poll_sent: false },
      ...d.antrenamente.filter((a) => a.id !== 's3'),
    ];
    expect(antrenamentulUrmator(d, ACUM)).toBeNull();
  });

  it('un rând fără sondaj, dar cu voturi puse de mână, rămâne următorul', () => {
    const d = date({ config: ORAR });
    d.antrenamente = [
      { id: 's9', session_date: '2026-10-20', starts_at: '06:30', location: 'Parc', status: 'scheduled', poll_sent: false },
      ...d.antrenamente.filter((a) => a.id !== 's3'),
    ];
    d.raspunsuri.push({ session_id: 's9', member_id: 'ana', response: 'yes', is_first_training: false, responded_at: '2026-10-07T08:00:00Z' });
    expect(antrenamentulUrmator(d, ACUM)?.id).toBe('s9');
  });

  it('un rând fără sondaj, mai aproape decât orarul, rămâne următorul', () => {
    const d = date({ config: ORAR });
    d.antrenamente = [
      { id: 's9', session_date: '2026-10-07', starts_at: '06:30', location: 'Parc', status: 'scheduled', poll_sent: false },
      ...d.antrenamente.filter((a) => a.id !== 's3'),
    ];
    expect(antrenamentulUrmator(d, ACUM)?.id).toBe('s9');
  });

  it('sare peste unul anulat', () => {
    const d = date();
    d.antrenamente.unshift({
      id: 's4', session_date: '2026-10-07', starts_at: '06:30', location: 'Parc', status: 'cancelled', poll_sent: false,
    });
    expect(antrenamentulUrmator(d, ACUM)?.id).toBe('s3');
  });

  it('azi se socotește „de acum încolo"', () => {
    const d = date({ azi: '2026-10-08' });
    expect(antrenamentulUrmator(d, ACUM)?.id).toBe('s3');
  });

  it('fără antrenament viitor → null', () => {
    expect(antrenamentulUrmator(date({ azi: '2026-10-09' }), ACUM)).toBeNull();
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

describe('deMarcatDeMana', () => {
  it('îi dă pe cei fără sondaj (fără Telegram sau în pauză) care n-au răspuns, fără cei ieșiți', () => {
    const d = date();
    d.membri.push(membru('pauza', { status: 'paused' }));
    expect(deMarcatDeMana(d, 's3').map((m) => m.id)).toEqual(['fara', 'pauza']);
  });

  it('cine a răspuns deja nu mai e în listă', () => {
    const d = date();
    d.raspunsuri.push({ session_id: 's3', member_id: 'fara', response: 'yes', is_first_training: false, responded_at: '2026-10-07T08:00:00Z' });
    expect(deMarcatDeMana(d, 's3')).toEqual([]);
  });

  it('un membru activ cu Telegram nu e aici: e la „n-au răspuns"', () => {
    expect(deMarcatDeMana(date(), 's3').some((m) => m.id === 'maria')).toBe(false);
  });
});
