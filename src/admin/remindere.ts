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
 *  • `trimis`    — jurnalul are o livrare reușită în fereastra lui.
 *  • `esuat`     — s-a încercat și a picat; fereastra s-a închis peste eșec.
 *  • `ratat`     — scadența + grația au trecut, dar cursa n-a început. NU mai
 *                  pleacă, și ăsta e cazul care merită spus cu voce tare.
 *  • `neplecat`  — ca `ratat`, dar jurnalul confirmă că n-a existat nicio
 *                  încercare. Vezi `LivrareReminder` pentru de ce e altă stare.
 *  • `trecut`    — startul e în urmă; întreaga ediție s-a consumat.
 */
export type StareReminder =
  | 'oprit'
  | 'programat'
  | 'iminent'
  | 'trimis'
  | 'esuat'
  | 'ratat'
  | 'neplecat'
  | 'trecut';

/**
 * O livrare din `email_log`, redusă la ce decide starea unui rând de orar.
 *
 * Tip îngust, nu `AdminEmailLogEntry` întreg: funcția rămâne pură și nu
 * moștenește forma jurnalului. `la` e `created_at` ca epoch ms, din același
 * motiv pentru care `acum` e număr — comparațiile nu trebuie să treacă prin
 * parsare de dată la fiecare randare.
 */
export type LivrareReminder = {
  /** Cheia șablonului cu care s-a randat mesajul. `null` pe rândurile vechi. */
  sablon: string | null;
  status: 'trimis' | 'esuat';
  la: number;
};

const TERMINALE = new Set<StareReminder>([
  'trimis',
  'esuat',
  'ratat',
  'neplecat',
  'trecut',
]);

/**
 * Din starea asta nu mai pleacă nimic — fie a plecat deja, fie nu mai are cum.
 *
 * Rezumatul grupului o folosește ca să nu numere drept „activ" un rând care
 * n-are cum să plece: exact afirmația falsă pe care o repară unitatea.
 */
export const nuMaiPleaca = (stare: StareReminder): boolean => TERMINALE.has(stare);

const NEREUSITE = new Set<StareReminder>(['esuat', 'ratat', 'neplecat']);

/**
 * Terminal și fără livrare — adică rândurile care merită semn de eroare.
 *
 * Separat de `nuMaiPleaca` fiindcă `trimis` și `trecut` sunt și ele terminale,
 * dar niciunul nu e o problemă de reparat.
 */
export const esteNereusit = (stare: StareReminder): boolean => NEREUSITE.has(stare);

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

/**
 * Livrările care pot aparține acestui rând de orar.
 *
 * Potrivirea e pe CHEIA șablonului, nu pe subiect: subiectul e editabil din
 * tabul „Șabloane", deci o potrivire pe text s-ar rupe tăcut la prima
 * reformulare — același raționament ca în `deliveryLog.ts`. Fereastra de timp
 * rămâne necesară doar ca departajare, când două rânduri folosesc același
 * șablon la avansuri diferite.
 *
 * `null` intră și iese ca `null`: „nu știm" nu e „nu există" (vezi `starea`).
 */
const livrariPotrivite = (
  livrari: LivrareReminder[] | null,
  intrare: ReminderEntry,
  scadentaLa: number
): LivrareReminder[] | null =>
  livrari === null
    ? null
    : livrari.filter(
        (l) =>
          l.sablon === intrare.template &&
          l.la >= scadentaLa &&
          l.la <= scadentaLa + REMINDER_GRACE_HOURS * ORA
      );

const starea = (
  intrare: ReminderEntry,
  scadentaLa: number,
  startLa: number,
  acum: number,
  potrivite: LivrareReminder[] | null
): { stare: StareReminder; nota?: string } => {
  if (!intrare.enabled) {
    return { stare: 'oprit', nota: 'Oprit — nu pleacă. Șterge rândul dacă nu-l mai vrei deloc.' };
  }
  if (acum >= startLa) {
    return { stare: 'trecut', nota: 'Cursa a început deja.' };
  }
  if (acum < scadentaLa) {
    // Înainte de scadență nicio livrare n-ar avea ce să însemne: fereastra de
    // potrivire nici măcar nu s-a deschis.
    return { stare: 'programat' };
  }
  // O livrare reușită bate ceasul. Fără verificarea asta, un reminder care A
  // plecat ar continua să spună „pleacă la următoarea verificare" cât timp e
  // în grație — aceeași clasă de minciună pe care o repară restul funcției.
  if (potrivite?.some((l) => l.status === 'trimis')) {
    return { stare: 'trimis', nota: 'A plecat — confirmat din jurnalul de livrare.' };
  }
  if (acum <= scadentaLa + REMINDER_GRACE_HOURS * ORA) {
    return { stare: 'iminent', nota: 'Pleacă la următoarea verificare (în cel mult 15 minute).' };
  }
  if (potrivite === null) {
    // Jurnalul n-a putut fi citit. Fără el nu se afirmă nimic despre livrare:
    // „neplecat" pe un jurnal indisponibil ar fi la fel de fals ca „trimis".
    return {
      stare: 'ratat',
      nota:
        'Scadența a trecut cu mai mult de ' +
        `${REMINDER_GRACE_HOURS} ore, deci NU mai pleacă. Un reminder „de mâine" primit în ` +
        'drum spre cursă e mai rău decât niciunul. Micșorează avansul dacă vrei să mai plece unul.',
    };
  }
  if (potrivite.length > 0) {
    return {
      stare: 'esuat',
      nota:
        'S-a încercat și a eșuat, iar fereastra s-a închis peste eșec — nu mai pleacă singur. ' +
        'Motivul concret e în tabul „Livrare".',
    };
  }
  return {
    stare: 'neplecat',
    nota:
      'Scadența a trecut, dar jurnalul de livrare n-are nicio urmă: nu s-a încercat niciodată. ' +
      'Verifică dacă jobul `runlift_reminder` e armat în baza de date.',
  };
};

/**
 * Orarul tradus în momente concrete, în ordinea în care pleacă emailurile.
 *
 * Listă goală dacă startul sau fusul sunt nevalide: n-avem față de ce calcula,
 * iar validarea semnalează deja câmpul stricat. Mai bine lipsește decât să
 * arate ore derivate din `NaN`.
 *
 * `livrari` e opțional și implicit `null` — adică exact comportamentul de
 * dinainte de jurnal. Cine nu-l dă primește stările derivate doar din orar.
 */
export const remindereleProgramate = (
  c: EventConfig,
  acum: number,
  livrari: LivrareReminder[] | null = null
): ReminderPlanificat[] => {
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
        ...starea(
          intrare,
          scadentaLa,
          startLa,
          acum,
          livrariPotrivite(livrari, intrare, scadentaLa)
        ),
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
