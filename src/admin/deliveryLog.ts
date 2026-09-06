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
 * Dintre nelivrate, cele care se pot RETRIMITE în lot: doar modul `admin`.
 *
 * Retrimiterea în lot reia textul din jurnal, ceea ce e corect DOAR pentru
 * emailurile compuse manual în backoffice — acolo textul din jurnal chiar e
 * mesajul. Celelalte moduri se repară una câte una, prin `rejucabil` de mai jos,
 * care reconstruiește mesajul din șablon.
 */
export const emailuriRetrimisibile = (nelivrate: AdminEmailLogEntry[]): AdminEmailLogEntry[] =>
  nelivrate.filter((e) => e.mod === 'admin');

/**
 * De ce un eșec nu se poate rejuca — sau `null` dacă se poate.
 *
 * Verdictul final e al serverului (`admin_replay_lookup`): doar el știe dacă
 * destinatarul mai există, dacă s-a dezabonat între timp sau dacă înscrierea a
 * fost ștearsă. Aici stă doar ce se poate decide din rândul de jurnal, ca
 * ecranul să nu ofere un buton care va fi refuzat oricum — și, mai important, ca
 * rândul refuzat să spună DE CE în loc să dispară.
 */
export const motivNerejucabil = (e: AdminEmailLogEntry): string | null => {
  if (e.mod === 'admin') {
    return 'Trimis manual din backoffice — se retrimite din butonul de sus.';
  }
  if (e.mod === 'info') {
    // Cooldown-ul de 10 minute și `mark_confirmation_sent` fac din rejucare o
    // cerere nouă, nu o reparație. Ascuns, rândul ar părea rezolvat.
    return 'Confirmare de adresă (double opt-in) — o rejucare ar fi o cerere nouă, nu o reparație. Persoana o poate cere din nou de pe site.';
  }
  if (e.mod === 'broadcast' && !e.sablon) {
    // Orarul are DOUĂ șabloane pentru aceeași audiență; ghicitul ar retrimite
    // alt text decât cel eșuat.
    return 'Difuzare de dinainte ca jurnalul să rețină șablonul — nu se poate ști ce text a plecat.';
  }
  return null;
};

/** Eșecurile care se pot rejuca prin fluxul modului lor. */
export const emailuriRejucabile = (nelivrate: AdminEmailLogEntry[]): AdminEmailLogEntry[] =>
  nelivrate.filter((e) => motivNerejucabil(e) === null);

/* ---- Fișa de acoperire: cine n-a primit ce ---- */

/**
 * Comunicările pe care o ediție le DATOREAZĂ fiecărui participant.
 *
 * Recunoașterea se face după `mod` (+ `audienta`), nu după subiect: subiectul e
 * editabil din tabul „Șabloane", deci potrivirea pe text s-ar rupe tăcut prima
 * dată când organizatorul reformulează un email. `mod` e pus de funcția edge și
 * există deja pe cinci ediții de jurnal.
 *
 * Un tip nou de comunicare se adaugă AICI și nicăieri altundeva — matricea își
 * derivă coloanele din listă.
 */
export type TipComunicare = {
  cheie: string;
  eticheta: string;
  recunoaste: (e: AdminEmailLogEntry) => boolean;
};

export const COMUNICARI_EDITIE: TipComunicare[] = [
  {
    cheie: 'confirmare',
    eticheta: 'Confirmare',
    // `promoted` e tot o confirmare — doar că a venit pe calea promovării din
    // lista de așteptare. Pentru destinatar e același mesaj datorat.
    recunoaste: (e) => e.mod === 'confirm' || e.mod === 'promoted',
  },
  {
    cheie: 'reminder',
    eticheta: 'Reminder',
    recunoaste: (e) => e.mod === 'broadcast' && e.audienta === 'participanti',
  },
];

/** Starea unei celule din fișă. `lipsa` = nu s-a încercat niciodată. */
export type StareCelula = 'trimis' | 'esuat' | 'lipsa';

export type RandAcoperire = {
  participant: AdminRegistration;
  celule: Record<string, StareCelula>;
};

/**
 * Participanții ediției × comunicările datorate.
 *
 * Întrebarea operațională nu e „ce am trimis", ci „cui îi lipsește ceva" — de
 * aceea `lipsa` e o stare de sine stătătoare, nu absența unui rând.
 *
 * În interiorul unei comunicări contează ULTIMA încercare (`intrari` vine cele
 * mai noi primele), deci o retrimitere reușită repară un eșec. Între comunicări
 * NU se contaminează: un email reușit de un tip nu mai poate ascunde un eșec de
 * alt tip, cum se întâmpla cât timp insigna era cheiată doar pe adresă.
 */
export const acoperire = (
  participanti: AdminRegistration[],
  intrari: AdminEmailLogEntry[]
): RandAcoperire[] =>
  participanti.map((p) => {
    const aleLui = intrari.filter((e) => e.email.toLowerCase() === p.email.toLowerCase());
    const celule: Record<string, StareCelula> = {};
    for (const com of COMUNICARI_EDITIE) {
      const ultima = aleLui.find((e) => com.recunoaste(e));
      celule[com.cheie] = ultima ? ultima.status : 'lipsa';
    }
    return { participant: p, celule };
  });

/** Participanții care nu apar deloc în jurnal — n-au primit NICIUN email. */
export const participantiFaraEmail = (
  participanti: AdminRegistration[],
  intrari: AdminEmailLogEntry[]
): AdminRegistration[] => {
  const cuEmail = new Set(intrari.map((e) => e.email.toLowerCase()));
  return participanti.filter((p) => !cuEmail.has(p.email.toLowerCase()));
};
