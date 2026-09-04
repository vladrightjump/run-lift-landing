import { dayMonth, timeOf, weekdayRo } from '../content/format';
import type { EventConfig } from '../content/eventConfig';

/**
 * Reperele unei ediții, ca linie de timp — și mutarea lor în bloc.
 *
 * De ce modul separat, și de ce pur: grupul „Când" cerea ȘASE momente scrise
 * separat, fără să spună vreodată în ce relație stau. Patru dintre ele nu sunt
 * însă decisions independente — sunt DERIVATE din startul cursei: înscrierile
 * se închid cu o oră înainte, check-inul cu un sfert, anunțul cu câteva zile,
 * următorul antrenament peste o săptămână. Organizatorul le ținea sincronizate
 * din cap, iar formularul verifica doar două dintre relații.
 *
 * Ce scăpa: `launchAt` rămas în urmă. Ciorna ediției următoare pornește de la
 * cea publicată (`cioarnaPentruEditiaUrmatoare`), deci moștenește momentul de
 * anunț al ediției TRECUTE — un moment deja consumat. Nimic nu-l semnala:
 * validarea nu-l leagă de nimic, iar consecința („homepage-ul nu mai stă pe
 * Coming Soon, oricât ai apăsa comutatorul") se descoperă abia pe site.
 *
 * Aici sunt două lucruri: `reperele` — cele șase momente în ordine, cu ce
 * înseamnă fiecare față de start — și `mutaReperele`, care duce tot grupul
 * odată cu startul. Funcții pure: `acum` e parametru, nu `Date.now()`.
 */

/** Un moment din desfășurarea ediției. `final` e calculat, nu stocat. */
export type CheieReper =
  | 'launchAt'
  | 'registrationDeadline'
  | 'checkin'
  | 'start'
  | 'final'
  | 'nextEditionAt';

export type Reper = {
  cheie: CheieReper;
  eticheta: string;
  /** Momentul local ISO, `YYYY-MM-DDTHH:mm:ss`. */
  moment: string;
  /** Momentul absolut, pentru ordonare și comparații. */
  la: number;
  /** „sâmbătă, 5 septembrie · 07:00" — forma citibilă. */
  cand: string;
  /** „cu 1 oră înainte de start" / „la 1 oră după start" / '' pentru start. */
  fataDeStart: string;
  /** Momentul a trecut deja. */
  trecut: boolean;
  /**
   * Flagul scurt, pentru linia de timp: „anunțul a trecut".
   *
   * Linia de timp e stratul de PARCURGERE — se citește dintr-o privire, iar o
   * propoziție întreagă pe un rând o transformă într-un paragraf. Explicația
   * completă stă pe câmp, adică exact unde se repară.
   */
  semnal?: string;
  /** Consecința, pe larg — pentru câmpul care produce reperul. */
  problema?: string;
};

/** „2026-08-22T07:00:00" — local, fără offset. */
const LOCAL_ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;
const ORA_RE = /^(\d{2}):(\d{2})$/;

const MINUT = 60_000;
const ORA = 3_600_000;
const ZI = 86_400_000;

const la = (localIso: string, tz: string): number => new Date(`${localIso}${tz}`).getTime();

/**
 * O durată scrisă cu cuvinte: „45 min", „1 oră", „2 zile".
 *
 * Rotunjim la unitatea cea mai mare care încape întreagă. Un „cu 172800000 ms
 * înainte" nu spune nimic; „cu 2 zile înainte" e chiar decizia luată.
 */
export const durataRo = (ms: number): string => {
  const abs = Math.abs(ms);
  if (abs < MINUT) return 'câteva secunde';
  if (abs < ORA) {
    const m = Math.round(abs / MINUT);
    return `${m} min`;
  }
  if (abs < ZI) {
    const h = Math.round((abs / ORA) * 2) / 2;
    if (h === 1) return 'o oră';
    return `${String(h).replace('.', ',')} ore`;
  }
  const z = Math.round(abs / ZI);
  if (z === 1) return 'o zi';
  if (z < 14) return `${z} zile`;
  const s = Math.round(z / 7);
  return s === 1 ? 'o săptămână' : `${s} săptămâni`;
};

/** „cu 1 oră înainte de start" / „la 2 ore după start". */
const fataDeStart = (delta: number): string => {
  if (delta === 0) return '';
  return delta < 0
    ? `cu ${durataRo(delta)} înainte de start`
    : `la ${durataRo(delta)} după start`;
};

/** „sâmbătă, 5 septembrie · 07:00". */
export const candScurt = (localIso: string): string =>
  LOCAL_ISO_RE.test(localIso)
    ? `${weekdayRo(localIso)}, ${dayMonth(localIso)} · ${timeOf(localIso)}`
    : '';

/** Minutele de la miezul nopții pentru „06:45"; `null` dacă nu recunoaștem ora. */
const minuteleOrei = (ora: string): number | null => {
  const m = ORA_RE.exec(ora);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
};

/** „06:45" din minutele de la miezul nopții, tăiat la marginile zilei. */
const oraDinMinute = (minute: number): string => {
  const m = Math.max(0, Math.min(24 * 60 - 1, Math.round(minute)));
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

/**
 * Check-inul, ca moment complet: ora lui, în ziua cursei.
 *
 * Documentul îl ține ca oră seacă („06:45"), fără zi. Singurul lucru care-l
 * face verificabil e ziua startului — altfel „06:45" e la fel de plauzibil
 * pentru o cursă de la 07:00 ca pentru una de la 18:00.
 */
export const momentulCheckinului = (c: EventConfig): string => {
  if (!LOCAL_ISO_RE.test(c.start) || !ORA_RE.test(c.checkinFrom)) return '';
  return `${c.start.slice(0, 10)}T${c.checkinFrom}:00`;
};

/**
 * Cele șase repere, în ordinea în care se întâmplă, cu ce înseamnă fiecare.
 *
 * Un document cu formate stricate întoarce listă goală: linia de timp n-are ce
 * arăta, iar validarea spune deja care câmp e de reparat. Mai bine lipsește
 * decât să deseneze o ordine calculată din `NaN`.
 */
export const reperele = (c: EventConfig, acum: number): Reper[] => {
  const momenteBrute: [CheieReper, string, string][] = [
    ['launchAt', 'Se anunță ediția', c.launchAt],
    ['registrationDeadline', 'Se închid înscrierile', c.registrationDeadline],
    ['checkin', 'Check-in de la', momentulCheckinului(c)],
    ['start', 'Startul cursei', c.start],
    [
      'final',
      'Se termină cursa',
      // Derivat, nu stocat: `start + durată`. Îl arătăm pentru că e reperul
      // care comută homepage-ul pe countdown — invizibil în formular altfel.
      LOCAL_ISO_RE.test(c.start) && c.durationHours > 0
        ? isoLocalDin(la(c.start, c.tz) + c.durationHours * ORA, c.tz)
        : '',
    ],
    ['nextEditionAt', 'Următorul antrenament', c.nextEditionAt],
  ];

  if (momenteBrute.some(([, , m]) => !LOCAL_ISO_RE.test(m))) return [];

  const startLa = la(c.start, c.tz);
  const finalLa = startLa + c.durationHours * ORA;

  const repere = momenteBrute.map(([cheie, eticheta, moment]) => {
    const momentLa = la(moment, c.tz);
    return {
      cheie,
      eticheta,
      moment,
      la: momentLa,
      cand: candScurt(moment),
      fataDeStart: cheie === 'start' ? '' : fataDeStart(momentLa - startLa),
      trecut: momentLa < acum,
      ...problemaReperului(cheie, momentLa, startLa, finalLa, acum),
    };
  });

  return repere.sort((a, b) => a.la - b.la);
};

/**
 * De ce un reper e la locul greșit — în termeni de consecință, nu de regulă.
 *
 * „Anunțul e după deadline" nu spune nimic organizatorului; „nimeni n-apucă să
 * se înscrie" spune exact ce urmează. Astea NU blochează publicarea (alea trec
 * prin `validateEventConfig`); sunt lucruri corecte formal cu urmări pe care
 * altfel le-ar afla din reclamații.
 */
const problemaReperului = (
  cheie: CheieReper,
  momentLa: number,
  startLa: number,
  finalLa: number,
  acum: number
): { semnal?: string; problema?: string } => {
  if (cheie === 'launchAt') {
    if (momentLa < acum && startLa > acum) {
      return {
        semnal: 'anunțul a trecut deja',
        problema:
          'Momentul anunțului a trecut deja — homepage-ul nu va sta pe Coming Soon, oricât ai apăsa comutatorul.',
      };
    }
    if (momentLa > startLa) {
      return { semnal: 'după start', problema: 'Anunțul vine după startul cursei.' };
    }
  }
  if (cheie === 'checkin') {
    if (momentLa > startLa) {
      return { semnal: 'după start', problema: 'Check-inul începe după startul cursei.' };
    }
    if (startLa - momentLa > 3 * ORA) {
      return {
        semnal: 'foarte devreme',
        problema: 'Check-inul începe cu mai mult de trei ore înainte de start — verifică ora.',
      };
    }
  }
  if (cheie === 'start' && momentLa < acum) {
    return { semnal: 'în trecut', problema: 'Startul cursei e în trecut.' };
  }
  if (cheie === 'nextEditionAt' && momentLa <= finalLa) {
    return {
      semnal: 'înainte de finalul cursei',
      problema: 'Următorul antrenament cade înainte de finalul cursei.',
    };
  }
  return {};
};

/** Momentul absolut → ISO local în fusul dat. Reciproca lui `la()`. */
export const isoLocalDin = (ms: number, tz: string): string => {
  const m = /^([+-])(\d{2}):(\d{2})$/.exec(tz);
  if (!m) return '';
  const semn = m[1] === '-' ? -1 : 1;
  const offset = semn * (Number(m[2]) * 60 + Number(m[3])) * MINUT;
  const d = new Date(ms + offset);
  const p = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}` +
    `T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`
  );
};

/**
 * Startul mutat, cu tot cu reperele care atârnă de el.
 *
 * Datele calendaristice se deplasează cu ACELAȘI decalaj ca startul, deci
 * distanțele dintre ele rămân cele alese („anunțul cu două zile înainte",
 * „antrenamentul peste o săptămână"). Check-inul păstrează avansul față de
 * start, nu ora: o cursă mutată de la 07:00 la 09:00 are check-in la 08:45,
 * nu la 06:45.
 *
 * Deliberat NEapelată la fiecare tastare în câmpul de start: mutarea se oferă,
 * nu se aplică singură. Un formular care rescrie patru câmpuri pe care nu
 * le-ai atins e un formular în care nu mai știi ce ai setat tu.
 */
export const mutaReperele = (c: EventConfig, startNou: string): EventConfig => {
  if (!LOCAL_ISO_RE.test(startNou) || !LOCAL_ISO_RE.test(c.start)) {
    return { ...c, start: startNou };
  }
  const delta = la(startNou, c.tz) - la(c.start, c.tz);
  if (delta === 0) return c;

  const mutat = (moment: string): string =>
    LOCAL_ISO_RE.test(moment) ? isoLocalDin(la(moment, c.tz) + delta, c.tz) || moment : moment;

  const minuteStartVechi = minuteleOrei(timeOf(c.start));
  const minuteStartNou = minuteleOrei(timeOf(startNou));
  const minuteCheckin = minuteleOrei(c.checkinFrom);
  const checkinFrom =
    minuteStartVechi !== null && minuteStartNou !== null && minuteCheckin !== null
      ? oraDinMinute(minuteStartNou - (minuteStartVechi - minuteCheckin))
      : c.checkinFrom;

  return {
    ...c,
    start: startNou,
    registrationDeadline: mutat(c.registrationDeadline),
    launchAt: mutat(c.launchAt),
    nextEditionAt: mutat(c.nextEditionAt),
    checkinFrom,
  };
};

/**
 * Ce s-ar schimba dacă startul s-ar muta — folosit ca să NU oferim mutarea
 * când n-ar face nimic (start identic, sau repere pe care deplasarea le lasă
 * la fel). Butonul care nu schimbă nimic e mai rău decât butonul lipsă.
 */
export const reperiiCareSeMuta = (c: EventConfig, startNou: string): string[] => {
  const dupa = mutaReperele(c, startNou);
  const nume: [keyof EventConfig | 'checkinFrom', string][] = [
    ['registrationDeadline', 'închiderea înscrierilor'],
    ['launchAt', 'anunțul ediției'],
    ['nextEditionAt', 'următorul antrenament'],
    ['checkinFrom', 'ora de check-in'],
  ];
  return nume
    .filter(([camp]) => dupa[camp as keyof EventConfig] !== c[camp as keyof EventConfig])
    .map(([, eticheta]) => eticheta);
};
