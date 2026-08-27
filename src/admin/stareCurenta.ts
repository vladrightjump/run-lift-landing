import type { EventConfig } from '../content/eventConfig';
import type { EditionDates } from '../lib/config';

/**
 * Ce se întâmplă ACUM și ce urmează — răspunsul pe care backoffice-ul nu-l dădea.
 *
 * Dashboardul se deschidea direct pe tabele. Ca să afli ce vede un vizitator în
 * clipa asta trebuia să deschizi site-ul într-un alt tab; ca să afli ce urmează,
 * să compari în cap patru date scrise ca „2026-08-22T07:00:00". Modulul ăsta
 * derivă amândouă din configul PUBLICAT — aceleași reguli pe care le aplică
 * `App.tsx` și `usePagePhase`, ținute într-un singur loc testabil.
 */

export type FazaSite = 'coming-soon' | 'landing' | 'cine-vine' | 'dupa-cursa';

/** Tabul spre care duce un semnal de atenție. Ține de UI, nu de logică. */
export type TabAdmin =
  | 'participanti'
  | 'email'
  | 'livrare'
  | 'lansare'
  | 'sabloane'
  | 'eveniment'
  | 'coming-soon';

export type Reper = {
  eticheta: string;
  moment: Date;
};

export type Atentie = {
  /** Cheie stabilă — pentru `key` la randare și pentru aserțiuni în teste. */
  cheie: string;
  text: string;
  /** Unde se rezolvă. Fără ea, semnalul e doar informativ. */
  tab?: TabAdmin;
  /** `true` → ceva chiar nu funcționează; `false` → doar de știut. */
  urgent: boolean;
};

export type StareCurenta = {
  faza: FazaSite;
  /** Ce vede un vizitator acum, într-o propoziție. */
  ceVede: string;
  /** Primul reper care n-a trecut încă. `null` după ultimul. */
  urmatorul: Reper | null;
  atentie: Atentie[];
};

/**
 * Aceeași fază, în două-trei cuvinte — pentru antetul lipit, unde propoziția
 * întreagă n-ar încăpea.
 *
 * De ce în antet: „ce vede vizitatorul acum" era scris o singură dată, în
 * panoul din capul paginii, care dispare la primul scroll. Întrebarea asta nu
 * se pune o dată la deschidere; se pune de fiecare dată când te pregătești să
 * schimbi ceva.
 */
export const ETICHETA_FAZA: Record<FazaSite, string> = {
  'coming-soon': 'Coming Soon',
  landing: 'Landing cu înscrieri',
  'cine-vine': 'Cine vine',
  'dupa-cursa': 'Countdown după cursă',
};

const CE_VEDE: Record<FazaSite, string> = {
  'coming-soon': 'Coming Soon — numărătoare inversă spre anunț, fără formular',
  landing: 'Landing-ul complet, cu înscrieri deschise',
  'cine-vine': 'Landing fără formular, cu lista „cine vine” mutată sub hero',
  'dupa-cursa': 'Numărătoare inversă spre următorul antrenament',
};

/**
 * Faza homepage-ului, după aceleași reguli ca pagina publică.
 *
 * Ordinea e cea din `App.tsx`: poarta de lansare e prima (cât timp ediția nu e
 * anunțată, nimic din ziua cursei n-are ce căuta pe ecran), fazele zilei după ea.
 */
export const fazaSite = (config: EventConfig, dates: EditionDates, acum: number): FazaSite => {
  if (config.showComingSoon && acum < dates.LAUNCH_DATE.getTime()) return 'coming-soon';
  if (acum >= dates.EVENT_END_DATE.getTime()) return 'dupa-cursa';
  if (acum >= dates.LEADERBOARD_DATE.getTime()) return 'cine-vine';
  return 'landing';
};

/**
 * Reperele ediției, în ordine cronologică. Numele sunt scrise ca efect pe
 * pagină („se închid înscrierile"), nu ca nume de câmp („registrationDeadline") —
 * organizatorul se gândește în efecte.
 */
export const repere = (config: EventConfig, dates: EditionDates): Reper[] => {
  const toate: Reper[] = [
    ...(config.showComingSoon ? [{ eticheta: 'se anunță ediția', moment: dates.LAUNCH_DATE }] : []),
    { eticheta: 'se închid înscrierile', moment: dates.REGISTRATION_DEADLINE },
    { eticheta: 'pagina trece pe „cine vine”', moment: dates.LEADERBOARD_DATE },
    { eticheta: 'startul cursei', moment: dates.EVENT_DATE },
    { eticheta: 'finalul cursei', moment: dates.EVENT_END_DATE },
    { eticheta: 'următorul antrenament', moment: dates.NEXT_EDITION_DATE },
  ];
  return toate.sort((a, b) => a.moment.getTime() - b.moment.getTime());
};

export type SemnaleAdmin = {
  nelivrate: number;
  asteptare: number;
  /** Există o ciornă salvată care încă n-a fost publicată. */
  ciornaNepublicata: boolean;
  /** Share preview-ul (meta din build) a rămas în urma configului publicat. */
  metaInUrma: boolean;
  /** Ediția deschisă în backoffice e o arhivă, nu cea curentă. */
  arhiva: boolean;
};

/**
 * Ce cere atenție, în ordinea în care merită privit: întâi ce e stricat, apoi ce
 * e doar de știut. Lista goală e un rezultat bun și se spune ca atare la randare
 * — un panou care nu zice nimic se citește ca „n-am apucat să încarc".
 */
export const semnaleDeAtentie = (s: SemnaleAdmin, faza: FazaSite): Atentie[] => {
  const out: Atentie[] = [];

  if (s.nelivrate > 0) {
    out.push({
      cheie: 'nelivrate',
      text: `${s.nelivrate} ${s.nelivrate === 1 ? 'email n-a ajuns' : 'emailuri n-au ajuns'} la destinatar`,
      tab: 'livrare',
      urgent: true,
    });
  }

  if (s.arhiva) {
    out.push({
      cheie: 'arhiva',
      text: 'Te uiți la o ediție încheiată — nu se poate modifica nimic aici',
      urgent: false,
    });
  }

  if (s.ciornaNepublicata) {
    out.push({
      cheie: 'ciorna',
      text: 'Ai o ciornă salvată care n-a ajuns încă pe site',
      tab: 'eveniment',
      urgent: false,
    });
  }

  if (s.metaInUrma) {
    out.push({
      cheie: 'meta',
      text: 'Share preview-ul (WhatsApp/Facebook) e în urma configului publicat — cere un deploy',
      tab: 'eveniment',
      urgent: false,
    });
  }

  // Lista de așteptare contează cât timp mai poate fi promovat cineva. După
  // cursă e doar istorie, iar un semnal permanent care nu cere nimic ajunge
  // zgomot pe care organizatorul învață să-l ignore — inclusiv când chiar
  // apare ceva important lângă el.
  if (s.asteptare > 0 && faza !== 'dupa-cursa') {
    out.push({
      cheie: 'asteptare',
      text: `${s.asteptare} ${s.asteptare === 1 ? 'persoană așteaptă' : 'persoane așteaptă'} un loc liber`,
      tab: 'participanti',
      urgent: false,
    });
  }

  return out;
};

export const stareCurenta = (
  config: EventConfig,
  dates: EditionDates,
  acum: number,
  semnale: SemnaleAdmin
): StareCurenta => {
  const faza = fazaSite(config, dates, acum);
  return {
    faza,
    ceVede: CE_VEDE[faza],
    urmatorul: repere(config, dates).find((r) => r.moment.getTime() > acum) ?? null,
    atentie: semnaleDeAtentie(semnale, faza),
  };
};
