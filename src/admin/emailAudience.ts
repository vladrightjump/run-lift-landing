/**
 * Logica de audiență pentru trimiterea în masă din backoffice (tab-ul „Emailuri").
 * Pură și testabilă — `AdminEmailTab` doar o consumă. Vezi `emailAudience.test.ts`.
 */
import type { AdminRegistration, AdminLaunchSignup, AdminWaitlistEntry } from '../lib/adminApi';

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
};

export const normalizeParticipant = (r: AdminRegistration): Recipient => ({
  id: r.id,
  nume: r.nume,
  prenume: r.nume.split(/\s+/)[0] ?? '',
  email: r.email,
  telefon: r.telefon,
  created_at: r.created_at,
  dezabonat: r.dezabonat_la !== null,
});

export const normalizeLaunch = (r: AdminLaunchSignup): Recipient => ({
  id: r.id,
  nume: `${r.prenume} ${r.nume}`.trim(),
  prenume: r.prenume,
  email: r.email,
  telefon: r.telefon,
  created_at: r.created_at,
  dezabonat: r.dezabonat_la !== null,
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
 * Înlocuiește variabilele dintr-un șablon cu datele destinatarului. `dataInscrierii`
 * vine deja formatată de caller (funcția rămâne pură, fără dependență de fus/locale).
 */
export const fillTemplate = (text: string, r: Recipient, dataInscrierii: string): string =>
  text
    .replace(/\{nume\}/g, r.nume)
    .replace(/\{prenume\}/g, r.prenume || r.nume.split(/\s+/)[0] || '')
    .replace(/\{email\}/g, r.email)
    .replace(/\{telefon\}/g, r.telefon)
    .replace(/\{data_inscrierii\}/g, dataInscrierii);
