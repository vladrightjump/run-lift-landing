import {
  SECTION_KEYS,
  DEFAULT_LAYOUT,
  MAX_REMINDERS,
  REMINDER_TEMPLATE_KEYS,
  type EventConfig,
  type ReminderEntry,
  type SectionKey,
  type SectionLayoutEntry,
} from '../content/eventConfig';
import { candScurt, durataRo, mutaReperele } from './reperele';

/**
 * Regulile formularului de ediție, ca modul pur.
 *
 * Separate de componentă din două motive: se pot testa fără randare, și trebuie
 * să spună ACELAȘI lucru ca `event_config_validate` din DB. Serverul rămâne
 * autoritatea — aici doar nu-l lăsăm pe organizator să apese „Publică" ca să
 * afle că a greșit o dată.
 */

export type CampInvalid = { camp: string; mesaj: string };

const LA = (local: string, tz: string): number => new Date(`${local}${tz}`).getTime();

/** „2026-08-22T07:00:00" — local, fără offset. */
const LOCAL_ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;
/** „06:30". */
const ORA_RE = /^\d{2}:\d{2}$/;
/** Punct exact, nu căutare text: „lat,lng". */
const MAP_QUERY_RE = /^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/;
const TZ_RE = /^[+-]\d{2}:\d{2}$/;

/**
 * Toate problemele documentului, nu doar prima — organizatorul le vede pe toate
 * odată, în loc să le descopere una câte una.
 */
export const validateEventConfig = (c: EventConfig): CampInvalid[] => {
  const probleme: CampInvalid[] = [];
  const cere = (cond: boolean, camp: string, mesaj: string) => {
    if (!cond) probleme.push({ camp, mesaj });
  };

  cere(Number.isInteger(c.number) && c.number > 0, 'number', 'Ediția trebuie să fie un număr pozitiv.');
  cere(
    Number.isInteger(c.launchNumber) && c.launchNumber > 0,
    'launchNumber',
    'Ediția de lansare trebuie să fie un număr pozitiv.'
  );
  cere(c.eventName.trim().length > 0, 'eventName', 'Numele evenimentului nu poate fi gol.');
  cere(c.concept.trim().length > 0, 'concept', 'Conceptul nu poate fi gol.');
  cere(TZ_RE.test(c.tz), 'tz', 'Fusul se scrie ca „+03:00".');
  cere(ORA_RE.test(c.checkinFrom), 'checkinFrom', 'Ora de check-in se scrie ca „06:30".');

  for (const camp of ['start', 'registrationDeadline', 'launchAt', 'nextEditionAt'] as const) {
    cere(LOCAL_ISO_RE.test(c[camp]), camp, 'Data se scrie ca „2026-08-22T07:00:00", fără fus.');
  }

  cere(c.durationHours > 0, 'durationHours', 'Durata trebuie să fie pozitivă.');
  cere(
    c.leaderboardLeadHours >= 0,
    'leaderboardLeadHours',
    'Avansul „cine vine" nu poate fi negativ.'
  );
  cere(Number.isInteger(c.slots.total) && c.slots.total > 0, 'slots.total', 'Capacitatea trebuie să fie pozitivă.');
  cere(Number.isInteger(c.slots.waitlist) && c.slots.waitlist >= 0, 'slots.waitlist', 'Lista de așteptare nu poate fi negativă.');
  // Serverul n-o validează — nu decide nimic acolo, e doar numărul pe care
  // pagina îl arată când statisticile tac. Dar un negativ ar desena o bară cu
  // segmente în minus, iar câmpul există de-acum în formular.
  cere(
    Number.isInteger(c.slots.occupiedFallback) && c.slots.occupiedFallback >= 0,
    'slots.occupiedFallback',
    'Valoarea de rezervă nu poate fi negativă.'
  );
  cere(c.venue.name.trim().length > 0, 'venue.name', 'Numele locului nu poate fi gol.');
  cere(c.venue.city.trim().length > 0, 'venue.city', 'Orașul nu poate fi gol.');
  cere(
    MAP_QUERY_RE.test(c.venue.mapQuery),
    'venue.mapQuery',
    'Coordonatele se scriu „lat,lng" (ex. 47.0182357,28.8213041) — nu text căutat pe hartă.'
  );
  cere(c.venue.zoom > 0, 'venue.zoom', 'Zoom-ul trebuie să fie pozitiv.');

  // Relațiile dintre repere — doar dacă formatele de mai sus sunt bune, altfel
  // `Date` produce NaN și mesajele ar deveni absurde.
  const formateOk = [c.start, c.registrationDeadline, c.nextEditionAt].every((v) =>
    LOCAL_ISO_RE.test(v)
  );
  if (formateOk && TZ_RE.test(c.tz) && c.durationHours > 0) {
    const start = LA(c.start, c.tz);
    const deadline = LA(c.registrationDeadline, c.tz);
    const next = LA(c.nextEditionAt, c.tz);
    const final = start + c.durationHours * 3_600_000;

    cere(
      deadline <= start,
      'registrationDeadline',
      'Deadline-ul de înscriere nu poate fi după startul cursei.'
    );
    cere(
      next > final,
      'nextEditionAt',
      'Următorul antrenament trebuie să fie după finalul cursei.'
    );
  }

  // Reminderele. Avansul se măsoară în ore înainte de start, deci un întreg
  // pozitiv; plafonul de 720 (30 de zile) nu e un capriciu, e granița dincolo de
  // care „reminder" nu mai descrie nimic — un email cu o lună înainte e un anunț.
  cere(
    c.reminders.length <= MAX_REMINDERS,
    'reminders',
    `Cel mult ${MAX_REMINDERS} remindere per ediție.`
  );
  c.reminders.forEach((r, i) => {
    cere(
      Number.isInteger(r.offsetHours) && r.offsetHours > 0 && r.offsetHours <= 720,
      `reminders.${i}.offsetHours`,
      'Avansul se scrie în ore întregi, între 1 și 720 (30 de zile).'
    );
    cere(
      REMINDER_TEMPLATE_KEYS.includes(r.template),
      `reminders.${i}.template`,
      'Șablonul reminderului nu există.'
    );
  });
  const avansuri = c.reminders.map((r) => r.offsetHours);
  cere(
    new Set(avansuri).size === avansuri.length,
    'reminders',
    'Două remindere au același avans — al doilea n-ar pleca niciodată.'
  );

  const chei = c.layout.map((s) => s.key);
  cere(
    chei.every((k) => SECTION_KEYS.includes(k)),
    'layout',
    'Layout-ul conține o secțiune necunoscută.'
  );
  cere(new Set(chei).size === chei.length, 'layout', 'O secțiune apare de două ori în layout.');

  return probleme;
};

/**
 * Avertismente — lucruri corecte, dar cu consecințe pe care organizatorul le-ar
 * descoperi altfel din reclamații. NU blochează publicarea.
 */
export type Avertisment = { mesaj: string };

export const avertismenteEventConfig = (c: EventConfig): Avertisment[] => {
  const av: Avertisment[] = [];

  // Bumparea ediției de lansare înaintea cursei rupe paginile deschise DIN EMAIL
  // de cei înscriși la ediția în curs: `/confirmare` și `/unsubscribe` afișează
  // ordinalul ediției de lansare.
  if (c.launchNumber > c.number) {
    av.push({
      mesaj:
        `Ediția de lansare (${c.launchNumber}) e înaintea ediției evenimentului (${c.number}). ` +
        '„/confirmare" și „/unsubscribe" sunt deschise din email de cei înscriși la ediția în ' +
        'curs și vor arăta ediția de lansare. Bumpeaz-o după cursă, nu înainte.',
    });
  }

  // Zero remindere active e o alegere validă (poate anunți altfel), dar e și
  // ușor de produs din greșeală bifând greșit — și se descoperă abia din
  // absențele de la start.
  if (c.reminders.every((r) => !r.enabled)) {
    av.push({
      mesaj:
        c.reminders.length === 0
          ? 'Nu e programat niciun reminder. Participanții nu primesc nimic înainte de cursă.'
          : 'Toate reminderele sunt oprite. Participanții nu primesc nimic înainte de cursă.',
    });
  }

  // NU avertizăm pentru „reminderul pleacă înainte de închiderea înscrierilor".
  // Înscrierile se închid cu o oră înainte de start, deci ORICE reminder util e
  // înaintea lor — avertismentul ar fi pornit aprins pe fiecare ediție, adică
  // n-ar mai fi fost citit niciunul. Că un întârziat nu primește reminderul e
  // inofensiv: tocmai s-a înscris, știe când e cursa.

  const ascunse = c.layout.filter((s) => !s.visible).map((s) => s.key);
  if (ascunse.includes('participants')) {
    av.push({
      mesaj: 'Secțiunea „cine vine" e ascunsă — pagina nu mai arată cine s-a înscris.',
    });
  }

  return av;
};

/**
 * Rândul pe care îl adaugă „+ Adaugă reminder".
 *
 * Avansul propus e primul din `AVANSURI_SUGERATE` care nu e deja folosit —
 * altfel butonul ar produce un duplicat, adică un rând invalid din start.
 * Când toate sunt luate, cade pe „cu o oră mai devreme decât cel mai devreme".
 */
const AVANSURI_SUGERATE = [24, 72, 3, 48, 12, 6, 1] as const;

export const adaugaReminder = (lista: ReminderEntry[]): ReminderEntry[] => {
  if (lista.length >= MAX_REMINDERS) return lista;
  const luate = new Set(lista.map((r) => r.offsetHours));
  const liber =
    AVANSURI_SUGERATE.find((h) => !luate.has(h)) ?? Math.max(...lista.map((r) => r.offsetHours)) + 1;
  return [
    ...lista,
    { offsetHours: liber, enabled: true, template: 'bulk_participant_reminder' as const },
  ];
};

export const stergeReminder = (lista: ReminderEntry[], i: number): ReminderEntry[] =>
  lista.filter((_, j) => j !== i);

export const seteazaReminder = <K extends keyof ReminderEntry>(
  lista: ReminderEntry[],
  i: number,
  camp: K,
  valoare: ReminderEntry[K]
): ReminderEntry[] => lista.map((r, j) => (j === i ? { ...r, [camp]: valoare } : r));

/**
 * Orarul în ordinea în care pleacă emailurile (avans mare → avans mic).
 *
 * Pentru REZUMAT, nu pentru rânduri: rândurile rămân în ordinea în care le-a
 * adăugat organizatorul, pentru că o listă care se resortează în timp ce tastezi
 * avansul mută rândul de sub cursor. Rezumatul („următorul pleacă …") are însă
 * nevoie de ordinea reală.
 */
export const remindereCronologic = (lista: ReminderEntry[]): ReminderEntry[] =>
  [...lista].sort((a, b) => b.offsetHours - a.offsetHours);

/** Mută o secțiune cu o poziție în sus sau în jos. */
export const mutaSectiune = (
  layout: SectionLayoutEntry[],
  key: SectionKey,
  directie: -1 | 1
): SectionLayoutEntry[] => {
  const i = layout.findIndex((s) => s.key === key);
  const j = i + directie;
  if (i < 0 || j < 0 || j >= layout.length) return layout;
  const copie = [...layout];
  [copie[i], copie[j]] = [copie[j], copie[i]];
  return copie;
};

export const comutaVizibilitatea = (
  layout: SectionLayoutEntry[],
  key: SectionKey
): SectionLayoutEntry[] =>
  layout.map((s) => (s.key === key ? { ...s, visible: !s.visible } : s));

/**
 * Completează layout-ul cu secțiunile care lipsesc din document.
 *
 * Un document salvat înainte ca o secțiune să existe în cod nu o conține; fără
 * completare, ea ar fi invizibilă și neconfigurabilă din admin. Cele lipsă se
 * adaugă la final, vizibile.
 */
export const layoutComplet = (layout: SectionLayoutEntry[]): SectionLayoutEntry[] => {
  const existente = new Set(layout.map((s) => s.key));
  const lipsa = DEFAULT_LAYOUT.filter((s) => !existente.has(s.key));
  return [...layout, ...lipsa];
};

/** Ciorna pentru ediția următoare, pornind de la cea publicată. */
export const cioarnaPentruEditiaUrmatoare = (publicat: EventConfig): EventConfig => ({
  ...publicat,
  number: publicat.number + 1,
  // `launchNumber` NU se bumpează automat — vezi avertismentul de mai sus.
  layout: layoutComplet(publicat.layout),
});

/**
 * Ciorna unei ediții noi din trei câmpuri: startul și numărul de locuri.
 *
 * Diferența față de `cioarnaPentruEditiaUrmatoare` e singurul lucru care
 * contează aici. Aceea COPIAZĂ momentele ediției publicate, inclusiv
 * `launchAt` — un moment deja consumat — iar consecința („homepage-ul nu mai
 * stă pe Coming Soon") se descoperă abia pe site. Asta le mută pe toate odată
 * cu startul, prin `mutaReperele`, deci momentul consumat nu mai are pe unde
 * să intre: nu e o verificare în plus, e o cale care nu-l mai poate produce.
 *
 * `launchNumber` rămâne în urmă și aici, deliberat — bumpul lui e o decizie
 * despre CE ediție se anunță, nu despre când, și are avertismentul lui.
 */
export const cioarnaEditieNoua = (
  publicat: EventConfig,
  startNou: string,
  locuriTotal: number
): EventConfig => ({
  ...mutaReperele(publicat, startNou),
  number: publicat.number + 1,
  layout: layoutComplet(publicat.layout),
  // `occupiedFallback` pornește de la zero, nu moștenit: e numărul pe care
  // pagina îl arată când statisticile tac, iar la o ediție la care nu s-a
  // înscris încă nimeni orice altă valoare e o afirmație falsă — și una care
  // se vede exact când backendul nu răspunde, adică atunci când nimeni n-o
  // poate verifica.
  slots: { ...publicat.slots, total: locuriTotal, occupiedFallback: 0 },
});

/** Un câmp al ciornei noi, așa cum îl citește organizatorul înainte să scrie. */
export type CampCiorna = {
  eticheta: string;
  valoare: string;
  /** Recalculat față de noul start — nu copiat din ediția publicată. */
  recalculat?: boolean;
};

/**
 * Ce duce mai departe ciorna nouă, câmp cu câmp.
 *
 * Fără rezumat, dialogul rapid n-ar face decât să mute capcana de la `launchAt`
 * la orice alt câmp: ai publica o locație sau o capacitate greșită cu MAI multă
 * încredere decât azi, fiindcă ai avut senzația că ai verificat. Momentele
 * recalculate se arată cu valoarea NOUĂ — „check-in 08:45", nu „s-a mutat" —
 * pentru că valoarea e chiar lucrul care se verifică dintr-o privire.
 *
 * Se compară cu ediția publicată, deci un câmp neschimbat de mutare (start
 * identic, oră identică) nu se raportează ca recalculat.
 */
export const rezumatCiornaNoua = (publicat: EventConfig, ciorna: EventConfig): CampCiorna[] => {
  const momente: [keyof EventConfig, string][] = [
    ['registrationDeadline', 'Se închid înscrierile'],
    ['launchAt', 'Se anunță ediția'],
    ['nextEditionAt', 'Următorul antrenament'],
  ];

  const recalculate: CampCiorna[] = [];
  if (ciorna.checkinFrom !== publicat.checkinFrom) {
    recalculate.push({
      eticheta: 'Check-in de la',
      valoare: ciorna.checkinFrom,
      recalculat: true,
    });
  }
  for (const [cheie, eticheta] of momente) {
    if (ciorna[cheie] === publicat[cheie]) continue;
    const moment = String(ciorna[cheie]);
    recalculate.push({ eticheta, valoare: candScurt(moment) || moment, recalculat: true });
  }

  const mostenite: CampCiorna[] = [
    { eticheta: 'Locația', valoare: `${publicat.venue.name}, ${publicat.venue.city}` },
    {
      eticheta: 'Capacitate',
      valoare:
        `${ciorna.slots.total} locuri` +
        (publicat.slots.waitlist > 0 ? ` · ${publicat.slots.waitlist} pe lista de așteptare` : ''),
    },
    { eticheta: 'Durata cursei', valoare: durataRo(publicat.durationHours * 3_600_000) },
    {
      eticheta: 'Remindere',
      valoare:
        publicat.reminders.length === 0
          ? 'niciunul'
          : `${publicat.reminders.filter((r) => r.enabled).length} active din ${publicat.reminders.length}`,
    },
    {
      eticheta: 'Secțiunile paginii',
      valoare: `${ciorna.layout.filter((s) => s.visible).length} vizibile din ${ciorna.layout.length}`,
    },
  ];

  // Ocuparea de rezervă NU se mai raportează aici: nu se mai moștenește deloc
  // (vezi `cioarnaEditieNoua`), deci n-are ce duce mai departe.

  return [...recalculate, ...mostenite];
};
