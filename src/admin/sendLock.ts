/**
 * Zăvorul pe trimiterea în masă din backoffice (tabul „Emailuri").
 *
 * Funcția edge are deja o primitivă atomică de idempotență — `broadcast_once`,
 * garantată printr-o constrângere de unicitate — dar până acum o folosea doar
 * reminderul programat. Difuzarea manuală pleca fără memorie, deci un singur
 * organizator, fără o a doua pereche de ochi, putea trimite de două ori același
 * email către oameni care se cunosc între ei.
 *
 * Logică pură, ca `emailAudience.ts` și `deliveryLog.ts` — componenta doar o
 * consumă. Vezi `tests/unit/sendLock.test.ts`.
 */
import type { AdminEmailLogEntry } from '../lib/adminApi';
import type { Audience } from './emailAudience';

export type AudientaLog = 'participanti' | 'asteptare';

/**
 * `email_log.audienta` cunoaște doar două valori, deci eticheta din jurnal NU
 * poate distinge lista de așteptare a evenimentului de lista „Anunță-mă la
 * lansare" — amândouă se scriu `asteptare`. Cheia de idempotență trebuie să
 * folosească audiența REALĂ, altfel o difuzare legitimă către a doua listă ar fi
 * refuzată ca dublură a primei.
 */
export const audienteAmbigue = (audienta: Audience): boolean =>
  audienta === 'eveniment' || audienta === 'lansare';

/**
 * Subiectul, adus la o formă canonică. Un spațiu în plus sau o majusculă nu fac
 * din retrimitere o difuzare nouă — altfel zăvorul s-ar deschide singur exact
 * când contează.
 */
const normalizeaza = (subiect: string): string =>
  subiect.trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * FNV-1a pe 32 de biți, în base36. Nu e criptografic și nu trebuie să fie: rolul
 * lui e doar să scurteze subiectul la ceva sigur de pus într-o cheie `app_config`,
 * fără diacritice și fără spații.
 */
const amprenta = (text: string): string => {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
};

/**
 * Cheia de idempotență a unei difuzări manuale.
 *
 * Granularitatea e alegerea grea, nu mecanismul: prea grosier și o retrimitere
 * legitimă (audiență corectată, subiect schimbat) e blocată din greșeală, iar
 * operatorul învață să treacă mereu pe lângă zăvor. De aceea intră toate trei —
 * ediția, audiența și subiectul: oricare se schimbă, e altă difuzare.
 *
 * `suprascriere` e jetonul emis când operatorul apasă „trimite oricum". Același
 * jeton dă aceeași cheie, deci un dublu-click rămâne o singură trimitere; o
 * suprascriere nouă, deliberată, primește jeton nou.
 */
export const cheieDifuzare = (
  editie: number,
  /** Audiența reală (patru valori), nu eticheta din jurnal (două). */
  audienta: Audience,
  subiect: string,
  suprascriere?: string
): string => {
  const baza = `difuzare:${editie}:${audienta}:${amprenta(normalizeaza(subiect))}`;
  return suprascriere ? `${baza}:o${amprenta(suprascriere)}` : baza;
};

export type DifuzareAnterioara = {
  /** ISO — momentul ultimei difuzări spre aceeași combinație. */
  cand: string;
  /** Câte adrese distincte a atins acea difuzare. */
  catreCati: number;
};

/** Difuzările plecate în aceeași minută sunt una singură (`logSends` le scrie împreună). */
const galeata = (iso: string): string => iso.slice(0, 16);

/**
 * Ultima difuzare manuală spre aceeași ediție + audiență + subiect.
 *
 * Doar `mod: 'admin'`: emailurile automate (confirmare, promovare, reminder) au
 * propriile lor căi și nu trebuie să blocheze o difuzare manuală. O trimitere
 * eșuată contează tot — altfel operatorul retrimite orbește peste cei cărora
 * mesajul chiar le-a ajuns.
 */
export const ultimaDifuzare = (
  intrari: AdminEmailLogEntry[],
  editie: number,
  audienta: AudientaLog,
  subiect: string
): DifuzareAnterioara | null => {
  const tinta = normalizeaza(subiect);
  const potrivite = intrari.filter(
    (e) =>
      e.mod === 'admin' &&
      e.editie === editie &&
      e.audienta === audienta &&
      normalizeaza(e.subiect) === tinta
  );
  if (potrivite.length === 0) return null;

  const ultima = potrivite.reduce((a, b) => (a.created_at >= b.created_at ? a : b));
  const lot = potrivite.filter((e) => galeata(e.created_at) === galeata(ultima.created_at));
  return {
    cand: ultima.created_at,
    catreCati: new Set(lot.map((e) => e.email.toLowerCase())).size,
  };
};
