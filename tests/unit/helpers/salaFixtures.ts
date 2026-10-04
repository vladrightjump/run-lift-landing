/**
 * Datele false ale grupului de antrenament, pentru testele de componentă.
 *
 * O singură formă pentru toate ecranele (`SalaDate`), ca un test nou să nu-și
 * inventeze propria versiune a răspunsului serverului.
 *
 * Nu e el însuși un test — `vitest.config.ts` colectează doar `*.test.ts(x)`.
 */
import type { SalaComanda, SalaDate, SalaMembru } from '../../../src/lib/salaApi';

export const membruSala = (id: string, peste: Partial<SalaMembru> = {}): SalaMembru => ({
  id,
  full_name: id.charAt(0).toUpperCase() + id.slice(1),
  status: 'active',
  is_admin: false,
  telegram_user_id: 1000 + id.length,
  telegram_username: null,
  bot_dm_enabled: false,
  join_date: '2026-07-01',
  ...peste,
});

export const comandaSala = (peste: Partial<SalaComanda> = {}): SalaComanda => ({
  id: 'c1',
  action: 'send_poll',
  member_id: null,
  status: 'done',
  result: null,
  created_at: '2026-10-07T08:00:00Z',
  processed_at: '2026-10-07T08:00:30Z',
  ...peste,
});

/** Azi e miercuri 7 octombrie; antrenamentul următor joi, cu un vot de fiecare fel. */
export const dateSala = (peste: Partial<SalaDate> = {}): SalaDate => ({
  azi: '2026-10-07',
  config: {
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
  },
  membri: [
    membruSala('ana', { telegram_username: 'ana_run' }),
    membruSala('ion'),
    membruSala('maria'),
    membruSala('roma', { is_admin: true }),
    membruSala('fara', { telegram_user_id: null }),
  ],
  antrenamente: [
    { id: 's2', session_date: '2026-10-08', starts_at: '06:30', location: 'Parc', status: 'scheduled', poll_sent: true },
    { id: 's1', session_date: '2026-10-06', starts_at: '06:30', location: 'Parc', status: 'done', poll_sent: true },
  ],
  raspunsuri: [
    { session_id: 's2', member_id: 'ana', response: 'yes', is_first_training: false, responded_at: '2026-10-07T09:00:00Z' },
    { session_id: 's2', member_id: 'ion', response: 'no', is_first_training: false, responded_at: '2026-10-07T09:05:00Z' },
    { session_id: 's1', member_id: 'maria', response: 'yes', is_first_training: false, responded_at: '2026-10-05T09:00:00Z' },
  ],
  necunoscuti: [],
  comenzi: [],
  ...peste,
});
