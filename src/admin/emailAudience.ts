/**
 * Logica de audiență pentru trimiterea în masă din backoffice (tab-ul „Emailuri").
 * Pură și testabilă — `AdminEmailTab` doar o consumă. Vezi `emailAudience.test.ts`.
 */
import type { AdminRegistration, AdminLaunchSignup, AdminWaitlistEntry } from '../lib/adminApi';
import { fillEventVars } from '../content/format';
import type { EventConfig } from '../content/eventConfig';

export type Audience = 'participanti' | 'eveniment' | 'lansare' | 'toti';

/** Destinatar normalizat — comun pentru toate sursele (participanți / așteptare / lansare). */
export type Recipient = {
  id: string;
  nume: string;
  prenume: string;
  email: string;
  telefon: string;
  created_at: string;
  /**
   * S-a dezabonat prin linkul din email. Trimiterea manuală din backoffice (mod
   * `admin`) NU aplică filtrul de server, deci îi excludem aici — altfel ar primi
   * exact ce au cerut să nu mai primească. `event_waitlist` nu are token de
   * dezabonare, deci acolo e mereu `false`.
   */
  dezabonat: boolean;
  /**
   * Tokenul cu care își poate elibera locul, pentru `{link_renunt}`.
   *
   * Numai PARTICIPANȚII au unul: cine e pe lista de așteptare sau pe cea de
   * lansare n-are încă un loc de eliberat. Gol → variabila nu se poate rezolva,
   * iar rândul pe care stă cade (vezi `fillTemplate`), ca să nu plece un
   * „{link_renunt}" literal.
   */
  tokenRenunt: string;
};

export const normalizeParticipant = (r: AdminRegistration): Recipient => ({
  id: r.id,
  nume: r.nume,
  prenume: r.nume.split(/\s+/)[0] ?? '',
  email: r.email,
  telefon: r.telefon,
  created_at: r.created_at,
  dezabonat: r.dezabonat_la !== null,
  tokenRenunt: r.token_renunt ?? '',
});

export const normalizeLaunch = (r: AdminLaunchSignup): Recipient => ({
  id: r.id,
  nume: `${r.prenume} ${r.nume}`.trim(),
  prenume: r.prenume,
  email: r.email,
  telefon: r.telefon,
  created_at: r.created_at,
  dezabonat: r.dezabonat_la !== null,
  // Lista de lansare nu ține locuri: n-are ce elibera.
  tokenRenunt: '',
});

// Lista de așteptare a EVENIMENTULUI (event_waitlist): nu are prenume separat și nu
// are token de dezabonare, deci nu poate fi „dezabonat".
export const normalizeWaitlist = (r: AdminWaitlistEntry): Recipient => ({
  id: r.id,
  nume: r.nume,
  prenume: r.nume.split(/\s+/)[0] ?? '',
  email: r.email,
  telefon: r.telefon,
  created_at: r.created_at,
  dezabonat: false,
  // Încă n-are loc — abia promovarea îi dă unul, iar emailul de promovare îi
  // duce linkul.
  tokenRenunt: '',
});

/** Elimină dublurile după email (case-insensitive), păstrând prima apariție. */
export const dedupeByEmail = (list: Recipient[]): Recipient[] => {
  const seen = new Set<string>();
  const out: Recipient[] = [];
  for (const r of list) {
    const key = r.email.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
};

export type AudienceSources = {
  participants: AdminRegistration[];
  eventWaitlist: AdminWaitlistEntry[];
  launch: AdminLaunchSignup[];
};

/**
 * Lista de destinatari pentru o audiență (înainte de selecția per-persoană).
 * „toti" = participanți + așteptare eveniment + lansare, fără dubluri de email.
 */
export const recipientsFor = (audience: Audience, src: AudienceSources): Recipient[] => {
  const participants = src.participants.map(normalizeParticipant);
  const eventWait = src.eventWaitlist.map(normalizeWaitlist);
  const launch = src.launch.map(normalizeLaunch);
  if (audience === 'participanti') return participants;
  if (audience === 'eveniment') return eventWait;
  if (audience === 'lansare') return launch;
  return dedupeByEmail([...participants, ...eventWait, ...launch]); // 'toti'
};

/**
 * Eticheta pentru jurnalul de livrare (`email_log.audienta` cunoaște doar aceste
 * două valori). „toti" e etichetat „participanti" (include participanții).
 */
export const audientaLog = (audience: Audience): 'participanti' | 'asteptare' =>
  audience === 'participanti' || audience === 'toti' ? 'participanti' : 'asteptare';

/**
 * Înlocuiește variabilele dintr-un șablon: întâi cele ale evenimentului (data,
 * ora, locul — din configul publicat), apoi cele ale destinatarului.
 * `dataInscrierii` vine deja formatată de caller (funcția rămâne pură, fără
 * dependență de fus/locale).
 *
 * `config` lipsă lasă variabilele de eveniment literale — vezi `fillEventVars`.
 * Nu inventăm o dată.
 */
export const fillTemplate = (
  text: string,
  r: Recipient,
  dataInscrierii: string,
  config: EventConfig | null = null
): string => {
  const cuEveniment = fillEventVars(text, config);
  const cuLink = r.tokenRenunt
    ? cuEveniment.replace(/\{link_renunt\}/g, linkRenunt(r.tokenRenunt))
    : faraLinkRenunt(cuEveniment);

  return cuLink
    .replace(/\{nume\}/g, r.nume)
    .replace(/\{prenume\}/g, r.prenume || r.nume.split(/\s+/)[0] || '')
    .replace(/\{email\}/g, r.email)
    .replace(/\{telefon\}/g, r.telefon)
    .replace(/\{data_inscrierii\}/g, dataInscrierii);
};

/**
 * Linkul de eliberare a locului. Aceeași formă ca în funcția edge `send-email`
 * — duplicată pentru că trimiterea manuală din backoffice compune textele în
 * client, iar cea automată pe server.
 */
export const linkRenunt = (token: string): string =>
  `https://parktraining.fit/renunt?token=${token}`;

/**
 * Textul fără paragraful care poartă `{link_renunt}`.
 *
 * `{link_renunt}` e singura variabilă care poate lipsi LEGITIM: cine e pe lista
 * de așteptare sau de lansare n-are un loc de eliberat. Cade PARAGRAFUL întreg,
 * nu doar variabila și nici doar rândul ei, pentru că în șabloanele reale
 * introducerea stă pe rândul de deasupra:
 *
 *     Dacă nu mai poți participa, eliberează-ți locul aici:
 *     {link_renunt}
 *
 * Șterge doar rândul cu variabila și rămâne o frază care trimite spre nimic —
 * mai rău decât dacă lipsea tot. Paragraful e unitatea corectă și pentru că e
 * exact cum împarte textul și randarea HTML a emailului (`split(/\n{2,}/)`).
 */
export const faraLinkRenunt = (text: string): string =>
  text
    .split(/\n{2,}/)
    .filter((p) => !p.includes('{link_renunt}'))
    .join('\n\n');
