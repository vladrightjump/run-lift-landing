import type { SalaComanda, SalaConfig } from '../../lib/salaApi';

/**
 * Formularul setărilor botului, fără React: valorile implicite, verificarea
 * dinaintea salvării și „ai modificări nesalvate".
 *
 * Verificarea de aici e o oglindă a celei din server
 * (`admin_sala_salveaza_config`), ca organizatorul să afle de ce nu se poate
 * salva înainte să apese. Serverul rămâne autoritatea.
 */

/** Setările de dinaintea primei salvări — exact valorile implicite din bot. */
export const CONFIG_IMPLICIT: SalaConfig = {
  enabled: true,
  poll_days: [1, 3],
  poll_time: '20:00',
  summary_days: [2, 4],
  summary_time: '06:00',
  training_time: '06:30',
  location: 'Parcul Dumitru Râșcanu',
  auto_reminder_enabled: true,
  reminder_threshold: 6,
  poll_title: null,
  poll_yes_label: null,
  poll_no_label: null,
};

/** Doar câmpurile pe care le editează formularul, din rândul primit de la server. */
export const dinServer = (c: Partial<SalaConfig> | null): SalaConfig => ({
  enabled: c?.enabled ?? CONFIG_IMPLICIT.enabled,
  poll_days: [...(c?.poll_days ?? CONFIG_IMPLICIT.poll_days)].sort((a, b) => a - b),
  poll_time: c?.poll_time ?? CONFIG_IMPLICIT.poll_time,
  summary_days: [...(c?.summary_days ?? CONFIG_IMPLICIT.summary_days)].sort((a, b) => a - b),
  summary_time: c?.summary_time ?? CONFIG_IMPLICIT.summary_time,
  training_time: c?.training_time ?? CONFIG_IMPLICIT.training_time,
  location: c?.location ?? CONFIG_IMPLICIT.location,
  auto_reminder_enabled: c?.auto_reminder_enabled ?? CONFIG_IMPLICIT.auto_reminder_enabled,
  reminder_threshold: c?.reminder_threshold ?? CONFIG_IMPLICIT.reminder_threshold,
  poll_title: c?.poll_title ?? null,
  poll_yes_label: c?.poll_yes_label ?? null,
  poll_no_label: c?.poll_no_label ?? null,
});

const ORA = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

/** Ce împiedică salvarea, în cuvintele organizatorului. Gol = se poate salva. */
export const problemeConfig = (c: SalaConfig): string[] => {
  const p: string[] = [];
  if (!ORA.test(c.poll_time)) p.push('Ora sondajului trebuie scrisă ca 12:00.');
  if (!ORA.test(c.summary_time)) p.push('Ora rezumatului trebuie scrisă ca 06:00.');
  if (!ORA.test(c.training_time)) p.push('Ora antrenamentului trebuie scrisă ca 06:30.');
  const loc = c.location.trim();
  if (loc.length === 0 || loc.length > 120) p.push('Locul nu poate fi gol (cel mult 120 de caractere).');
  if (!Number.isInteger(c.reminder_threshold) || c.reminder_threshold < 0 || c.reminder_threshold > 999) {
    p.push('Pragul reminderului e un număr întreg, de la 0 în sus.');
  }
  if ((c.poll_title ?? '').trim().length > 80) p.push('Titlul sondajului are voie la 80 de caractere.');
  if ((c.poll_yes_label ?? '').trim().length > 32 || (c.poll_no_label ?? '').trim().length > 32) {
    p.push('Butoanele au voie la 32 de caractere.');
  }
  return p;
};

/** Același conținut? Ordinea zilelor și spațiile din jurul textelor nu contează. */
export const configEgal = (a: SalaConfig, b: SalaConfig): boolean => {
  const norm = (c: SalaConfig) => ({
    ...c,
    poll_days: [...c.poll_days].sort((x, y) => x - y),
    summary_days: [...c.summary_days].sort((x, y) => x - y),
    location: c.location.trim(),
    poll_title: c.poll_title?.trim() || null,
    poll_yes_label: c.poll_yes_label?.trim() || null,
    poll_no_label: c.poll_no_label?.trim() || null,
  });
  return JSON.stringify(norm(a)) === JSON.stringify(norm(b));
};

/** Zilele săptămânii, de luni încolo, cu numărul lor (0 = duminică). */
export const ZILE: [number, string][] = [
  [1, 'Lu'],
  [2, 'Ma'],
  [3, 'Mi'],
  [4, 'Jo'],
  [5, 'Vi'],
  [6, 'Sâ'],
  [0, 'Du'],
];

export const ETICHETE_COMENZI: Record<SalaComanda['action'], string> = {
  send_poll: 'Sondaj trimis acum',
  send_summary: 'Rezumat trimis acum',
  send_reminder: 'Reminder trimis acum',
  send_message: 'Mesaj în grup',
  kick_member: 'Scoatere din grup',
  cancel_session: 'Antrenament anulat',
  reactivate_session: 'Antrenament reactivat',
  move_session: 'Antrenament mutat',
  add_session: 'Antrenament extra',
};

export const ETICHETE_STARE_COMANDA: Record<SalaComanda['status'], string> = {
  pending: 'în așteptare',
  done: 'făcută',
  failed: 'eșuată',
};
