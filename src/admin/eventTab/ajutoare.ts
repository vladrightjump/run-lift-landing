import { durataRo } from '../reperele';
import type { ReminderTemplateKey } from '../../content/eventConfig';

/**
 * Ajutoarele pure ale tabului „Eveniment": listele de opțiuni și derivările de
 * timp pe care le folosesc grupurile de câmpuri.
 *
 * Erau în capul unui fișier de 1841 de linii, între importuri și componentă.
 * Sunt funcții fără stare și fără DOM, deci se testează direct — vezi
 * `tests/unit/eventTabAjutoare.test.ts`.
 */

export const DURATE = [1, 1.5, 2, 2.5, 3, 4, 5, 6] as const;

/** Cu cât înainte de start se deschide check-inul. Minute. */
export const AVANSURI_CHECKIN = [0, 10, 15, 20, 30, 45, 60, 90] as const;

/** Cu câte ore înainte de start homepage-ul trece pe „cine vine". */
export const AVANSURI_LEADERBOARD = [0, 1, 2, 3, 6, 12, 24] as const;

/**
 * Orele de check-in, derivate din startul cursei.
 *
 * Lista era fixă, sferturi de oră între 05:00 și 12:00 — adică presupunea că
 * orice cursă începe dimineața, și nu spunea niciodată CU CÂT înainte e ora
 * aleasă. Amândouă erau greșeli: o cursă de seară n-avea ce alege, iar „06:45"
 * lângă un start la 09:00 arată perfect rezonabil până citești ambele câmpuri
 * odată. Decizia reală nu e „la ce oră", e „cu cât înainte".
 *
 * Startul stricat (câmp golit, document vechi) cade înapoi pe lista fixă:
 * fără o oră de referință, un avans n-are din ce fi calculat.
 */
export const oreCheckin = (start: string): { valoare: string; eticheta: string }[] => {
  const m = /T(\d{2}):(\d{2})/.exec(start);
  if (!m) {
    return Array.from({ length: (12 - 5) * 4 + 1 }, (_, i) => {
      const t = 5 * 60 + i * 15;
      const v = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
      return { valoare: v, eticheta: v };
    });
  }
  const minuteStart = Number(m[1]) * 60 + Number(m[2]);
  return AVANSURI_CHECKIN.filter((avans) => minuteStart - avans >= 0).map((avans) => {
    const t = minuteStart - avans;
    const valoare = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
    return {
      valoare,
      eticheta: avans === 0 ? `${valoare} · odată cu startul` : `${valoare} · cu ${durataRo(avans * 60_000)} înainte`,
    };
  });
};

/**
 * Locurile în care s-a mai alergat.
 *
 * Coordonatele se iau altfel din Google Maps: click dreapta pe punct, prima
 * linie din meniu. E o operație pe telefon, în alt tab, care produce un șir de
 * cifre pe care nu-l poți verifica citindu-l. Iar cursele se întorc în aceleași
 * două-trei parcuri. Lista nu înlocuiește câmpurile — le completează, și rămân
 * editabile după.
 */
export const LOCURI_SALVATE: { name: string; city: string; mapQuery: string }[] = [
  { name: 'Terenul de Basketball', city: 'Parcul La Izvor', mapQuery: '47.0465504,28.7854741' },
  { name: 'Teren Sportiv', city: 'Parcul Râșcani', mapQuery: '47.0411377,28.8714638' },
  { name: 'Scările de Granit', city: 'Valea Morilor, Chișinău', mapQuery: '47.0182357,28.8213041' },
];

/** Momentul local, ca ISO fără fus — forma pe care o cere documentul. */
export const caIsoLocal = (d: Date): string => {
  const p = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` +
    `T${p(d.getHours())}:${p(d.getMinutes())}:00`
  );
};

/**
 * Presetările pentru startul cursei: următoarele două sâmbete, la ora curentă
 * a cursei.
 *
 * Cursele cad sâmbăta dimineața, iar ciorna ediției următoare pornește cu
 * startul ediției TRECUTE — deci prima operație de fiecare dată e „mută-l cu o
 * săptămână, două". Făcut din calendar, asta cere să numeri zilele și să nu
 * greșești ziua săptămânii, singura greșeală pe care cifrele n-o arată.
 *
 * Ora se păstrează din start, nu se inventează: dacă ediția asta e la 08:00, o
 * presetare care o mută înapoi la 07:00 ar strica exact ce n-a fost cerut.
 */
export const sambeteleUrmatoare = (acum: number, start: string): { eticheta: string; moment: string }[] => {
  const ora = /T(\d{2}):(\d{2})/.exec(start);
  if (!ora) return [];
  const baza = new Date(acum);
  baza.setHours(Number(ora[1]), Number(ora[2]), 0, 0);
  // 6 = sâmbătă. „Azi e sâmbătă" înseamnă sâmbăta VIITOARE: o cursă pusă azi
  // n-are când fi anunțată.
  const pana = ((6 - baza.getDay() + 7) % 7) || 7;
  return [0, 1].map((i) => {
    const d = new Date(baza);
    d.setDate(d.getDate() + pana + i * 7);
    return {
      eticheta: i === 0 ? `Sâmbăta viitoare, ${ora[1]}:${ora[2]}` : `Peste două sâmbete`,
      moment: caIsoLocal(d),
    };
  });
};

/** Doar fusurile Moldovei; restul n-au ce căuta într-o cursă din Chișinău. */
export const FUSURI: [string, string][] = [
  ['+03:00', '+03:00 · Chișinău vara (EEST)'],
  ['+02:00', '+02:00 · Chișinău iarna (EET)'],
];

/**
 * Cât ține o publicare, formularul e inert.
 *
 * `publicaCiorna` închide dialogul pe prima linie, iar cele două apeluri await
 * țin documentul pe care l-au capturat. Un câmp rămas viu ar însemna că poți
 * tasta în timpul dus-întorsului: s-ar publica instantaneul vechi ȘI s-ar
 * anunța succesul — exact divergența dintre ecran și site pe care tabul o
 * închide.
 *
 * Context, nu prop: `Camp` e un component separat, iar altfel fiecare dintre
 * cele optsprezece câmpuri ar căra aceeași valoare de mână.
 */

/**
 * Numele omenești ale șabloanelor de reminder.
 *
 * Cheia din DB (`bulk_participant_reminder_final`) e ce se trimite, dar nu e ce
 * trebuie citit dintr-o listă derulantă — organizatorul alege un TON, nu un rând
 * dintr-un tabel.
 */
export const ETICHETE_SABLOANE: Record<ReminderTemplateKey, string> = {
  bulk_participant_reminder: 'Reminder („mâine alergăm")',
  bulk_participant_reminder_final: 'Reminder final („azi alergăm")',
};

/**
 * Motivul recunoscut al serverului — sau `null` când nu-l știm traduce.
 *
 * Separat pentru că doar ASTA e motivul. `null` nu înseamnă doar „mesaj
 * necunoscut": înseamnă că serverul n-a răspuns în termeni pe care-i știm, deci
 * de regulă că n-a răspuns deloc. Cine compune mesajul are nevoie de diferență.
 */
const motivRefuz = (err: unknown): string | null => {
  const text = err instanceof Error ? err.message : String(err);
  if (text.includes('registration_hidden_while_open')) {
    return 'Nu poți ascunde secțiunea de înscriere cât timp înscrierile sunt deschise. Mută deadline-ul sau lasă secțiunea vizibilă.';
  }
  if (text.includes('no_draft')) return 'Nu există nicio ciornă de publicat.';
  if (text.includes('config_invalid')) {
    const m = /config_invalid: ([^"\\}]+)/.exec(text);
    return `Serverul a respins configul: ${m?.[1]?.trim() ?? 'document invalid'}.`;
  }
  return null;
};

/** Care dintre scrierile tabului a picat. */
export type Pas = 'salvare' | 'publicare' | 'revenire';

const NUMELE_PASULUI: Record<Pas, string> = {
  salvare: 'Salvarea',
  publicare: 'Publicarea',
  revenire: 'Revenirea la versiunea aleasă',
};

/**
 * Refuzul, spunând CARE scriere a picat.
 *
 * Pasul nu poate veni din motivul serverului: acela ramifică pe codul de
 * eroare, nu pe apelul care l-a primit. O funcție care alege singură o
 * propoziție de rezervă ar spune „Nu am putut salva" și pentru o publicare
 * picată — organizatorul ar citi că nu s-a salvat exact când salvarea trecuse.
 *
 * A doua distincție, la fel de importantă: cu motiv de la server ȘTIM că
 * scrierea a fost refuzată. Fără el — o cădere de rețea — nu știm dacă a ajuns
 * sau nu, iar „a fost refuzată" ar fi o afirmație pe care n-o putem susține.
 * Un `admin_save_event_config_draft` care a apucat să scrie și și-a pierdut
 * răspunsul arată identic cu unul care n-a plecat niciodată.
 */
export const refuzCuPas = (pas: Pas, err: unknown): string => {
  const motiv = motivRefuz(err);
  return motiv
    ? `${NUMELE_PASULUI[pas]} a fost refuzată: ${motiv}`
    : `${NUMELE_PASULUI[pas]} n-a primit răspuns — nu știm dacă a ajuns pe server. Reîncarcă pagina și verifică înainte să reîncerci.`;
};

/**
 * Are grupul vreo eroare pe cheile lui?
 *
 * Două grupuri — „Remindere" și „Instagram" — nu-și pot enumera câmpurile:
 * validarea le scrie erorile pe chei INDEXATE (`reminders.0.offsetHours`,
 * `reels.2.code`), câte una per rând, plus una plată pentru regulile care
 * privesc lista întreagă (`reminders` la avansuri duplicate).
 *
 * `areEroare` din tab compară exact, deci nu vede rândurile. Confuzia dintre
 * cele două a scăpat o dată deja: la împărțirea tabului pe grupuri, „Remindere"
 * a trecut pe potrivire exactă și un avans invalid a rămas nesemnalat, cu grupul
 * pliat peste el. Aici e numită o singură dată, ca să nu se mai repete.
 *
 * Prefixul se compară pe segment (`reminders.`), nu pe text: altfel o cheie
 * viitoare gen `remindersLegacy` ar fi marcat grupul greșit.
 */
export const areEroareIndexata = (erori: Map<string, string>, prefix: string): boolean =>
  [...erori.keys()].some((cheie) => cheie === prefix || cheie.startsWith(`${prefix}.`));
