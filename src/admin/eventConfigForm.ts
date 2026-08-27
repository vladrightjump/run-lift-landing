import {
  SECTION_KEYS,
  DEFAULT_LAYOUT,
  type EventConfig,
  type SectionKey,
  type SectionLayoutEntry,
} from '../content/eventConfig';

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

  const ascunse = c.layout.filter((s) => !s.visible).map((s) => s.key);
  if (ascunse.includes('participants')) {
    av.push({
      mesaj: 'Secțiunea „cine vine" e ascunsă — pagina nu mai arată cine s-a înscris.',
    });
  }

  return av;
};

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
