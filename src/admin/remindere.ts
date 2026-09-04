import { REMINDER_GRACE_HOURS, type EventConfig, type ReminderEntry } from '../content/eventConfig';
import { candScurt, durataRo, isoLocalDin } from './reperele';

/**
 * Când pleacă fiecare reminder, și dacă mai apucă să plece.
 *
 * De ce modul separat, pur: regula de declanșare trăiește în DB
 * (`runlift.maybe_send_reminder`), unde nimeni n-o vede. Un orar în admin care
 * arată „cu 72h înainte" fără să spună ce înseamnă asta ACUM e o promisiune pe
 * care organizatorul o descoperă neonorată abia după cursă — cazul concret: un
 * cron armat cu 30 de ore înainte de start nu mai trimite niciodată reminderul
 * de 72 de ore, pentru că scadența lui a trecut. Aici traducem regula în stare
 * vizibilă, cu aceleași praguri ca funcția din DB.
 *
 * `acum` e parametru, nu `Date.now()`: altfel nimic din asta n-ar fi testabil.
 */

const ORA = 3_600_000;

const la = (localIso: string, tz: string): number => new Date(`${localIso}${tz}`).getTime();

/**
 * Ce se întâmplă cu un reminder:
 *  • `oprit`     — bifa e scoasă. Rămâne în orar, nu pleacă.
 *  • `programat` — scadența e în viitor. Ăsta e cazul normal.
 *  • `iminent`   — e în fereastra de grație; pleacă la următoarea rulare de cron.
 *  • `ratat`     — scadența + grația au trecut, dar cursa n-a început. NU mai
 *                  pleacă, și ăsta e cazul care merită spus cu voce tare.
 *  • `trecut`    — startul e în urmă; întreaga ediție s-a consumat.
 */
export type StareReminder = 'oprit' | 'programat' | 'iminent' | 'ratat' | 'trecut';

export type ReminderPlanificat = {
  /** Indexul în `config.reminders` — rândurile se editează după el. */
  index: number;
  intrare: ReminderEntry;
  stare: StareReminder;
  /** Momentul local ISO al scadenței; '' dacă startul e nevalid. */
  moment: string;
  /** „joi, 6 august · 07:00". */
  cand: string;
  /** „peste 2 zile" / „acum 3 ore". */
  distanta: string;
  /** Consecința, când starea o cere. Gol altfel. */
  nota?: string;
};

/** „2026-08-22T07:00:00" — local, fără offset. */
const LOCAL_ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;
const TZ_RE = /^[+-]\d{2}:\d{2}$/;

const distantaRo = (delta: number): string =>
  delta >= 0 ? `peste ${durataRo(delta)}` : `acum ${durataRo(delta)}`;

const starea = (
  intrare: ReminderEntry,
  scadentaLa: number,
  startLa: number,
  acum: number
): { stare: StareReminder; nota?: string } => {
  if (!intrare.enabled) {
    return { stare: 'oprit', nota: 'Oprit — nu pleacă. Șterge rândul dacă nu-l mai vrei deloc.' };
  }
  if (acum >= startLa) {
    return { stare: 'trecut', nota: 'Cursa a început deja.' };
  }
  if (acum < scadentaLa) {
    return { stare: 'programat' };
  }
  if (acum <= scadentaLa + REMINDER_GRACE_HOURS * ORA) {
    return { stare: 'iminent', nota: 'Pleacă la următoarea verificare (în cel mult 15 minute).' };
  }
  return {
    stare: 'ratat',
    nota:
      'Scadența a trecut cu mai mult de ' +
      `${REMINDER_GRACE_HOURS} ore, deci NU mai pleacă. Un reminder „de mâine" primit în ` +
      'drum spre cursă e mai rău decât niciunul. Micșorează avansul dacă vrei să mai plece unul.',
  };
};

/**
 * Orarul tradus în momente concrete, în ordinea în care pleacă emailurile.
 *
 * Listă goală dacă startul sau fusul sunt nevalide: n-avem față de ce calcula,
 * iar validarea semnalează deja câmpul stricat. Mai bine lipsește decât să
 * arate ore derivate din `NaN`.
 */
export const remindereleProgramate = (c: EventConfig, acum: number): ReminderPlanificat[] => {
  if (!LOCAL_ISO_RE.test(c.start) || !TZ_RE.test(c.tz)) return [];
  const startLa = la(c.start, c.tz);
  if (!Number.isFinite(startLa)) return [];

  return c.reminders
    .map((intrare, index) => {
      const scadentaLa = startLa - intrare.offsetHours * ORA;
      const moment = isoLocalDin(scadentaLa, c.tz);
      return {
        index,
        intrare,
        moment,
        cand: candScurt(moment),
        distanta: distantaRo(scadentaLa - acum),
        ...starea(intrare, scadentaLa, startLa, acum),
      };
    })
    .sort((a, b) => b.intrare.offsetHours - a.intrare.offsetHours);
};

/**
 * Rezumatul de deasupra listei: următorul reminder care chiar pleacă.
 *
 * `null` când nu mai pleacă niciunul — starea pe care organizatorul trebuie s-o
 * vadă fără să citească rând cu rând.
 */
export const urmatorulReminder = (
  programate: ReminderPlanificat[]
): ReminderPlanificat | null =>
  programate.find((r) => r.stare === 'programat' || r.stare === 'iminent') ?? null;
