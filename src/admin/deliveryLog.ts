/**
 * Logica jurnalului de livrare (tab-ul „Livrare"). Pură și testabilă — `AdminDeliveryTab`
 * doar o consumă. Vezi `tests/unit/deliveryLog.test.ts`.
 */
import type { AdminEmailLogEntry, AdminRegistration } from '../lib/adminApi';

/** Cheia unei „trimiteri": aceeași adresă (case-insensitive) + același subiect. */
export const cheieTrimitere = (e: AdminEmailLogEntry): string =>
  `${e.email.toLowerCase()}|${e.subiect}`;

/**
 * Motivul unui eșec, citit din corpul răspunsului providerului. Resend întoarce JSON
 * cu `message`; dacă nu-l putem parsa, arătăm corpul brut (sau codul HTTP).
 */
export const motivEsec = (e: AdminEmailLogEntry): string => {
  if (!e.eroare) return e.provider_status ? `HTTP ${e.provider_status}` : 'Motiv necunoscut';
  try {
    const parsed = JSON.parse(e.eroare) as { message?: string; name?: string };
    return parsed.message || parsed.name || e.eroare;
  } catch {
    return e.eroare;
  }
};

/**
 * Ultima încercare pentru fiecare (adresă + subiect). `intrari` vine cele mai noi
 * primele, deci prima apariție a unei chei e cea mai recentă. O retrimitere reușită
 * „repară" un eșec vechi — de-aia ne uităm doar la ultima stare.
 */
export const ultimaIncercarePerCheie = (
  intrari: AdminEmailLogEntry[]
): Map<string, AdminEmailLogEntry> => {
  const m = new Map<string, AdminEmailLogEntry>();
  for (const e of intrari) if (!m.has(cheieTrimitere(e))) m.set(cheieTrimitere(e), e);
  return m;
};

/** Emailuri a căror ULTIMĂ încercare (per adresă+subiect) e un eșec. */
export const emailuriNelivrate = (intrari: AdminEmailLogEntry[]): AdminEmailLogEntry[] =>
  [...ultimaIncercarePerCheie(intrari).values()].filter((e) => e.status === 'esuat');

/**
 * Dintre nelivrate, cele care se pot RETRIMITE din backoffice: doar modul `admin`.
 * Restul (confirm/promoted/info/broadcast) depind de contextul fluxului lor și se
 * reîncearcă de acolo, nu printr-o retrimitere oarbă.
 */
export const emailuriRetrimisibile = (nelivrate: AdminEmailLogEntry[]): AdminEmailLogEntry[] =>
  nelivrate.filter((e) => e.mod === 'admin');

/** Participanții care nu apar deloc în jurnal — n-au primit NICIUN email. */
export const participantiFaraEmail = (
  participanti: AdminRegistration[],
  intrari: AdminEmailLogEntry[]
): AdminRegistration[] => {
  const cuEmail = new Set(intrari.map((e) => e.email.toLowerCase()));
  return participanti.filter((p) => !cuEmail.has(p.email.toLowerCase()));
};
