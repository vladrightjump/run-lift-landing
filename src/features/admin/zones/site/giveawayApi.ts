import { rpc } from '../../../../shared/lib/rpc';

/**
 * Cererile ecranului Giveaway. Ca restul backoffice-ului, trec prin RPC-uri
 * care validează tokenul de sesiune.
 *
 * Acțiunile primesc giveaway-ul ca parametru: se aplică celui afișat, nu celui
 * care e curent în clipa apăsării. Altfel un giveaway nou început l-ar scoate
 * din admin pe cel neîncheiat.
 */

/**
 * Starea, dedusă pe server din câmpurile stocate. Pagina publică vede doar
 * primele trei; restul sunt pașii de după închiderea înscrierilor.
 */
export type StareGiveaway = 'programat' | 'deschis' | 'inchis' | 'extras' | 'confirmat' | 'incheiat';

export type ParticipareGiveaway = {
  id: string;
  nume: string;
  telefon: string;
  email: string;
  /** Fără „@", cu litere mici. */
  instagram: string;
  acord_contact: boolean;
  created_at: string;
  /** Extrasă acum = `extrasa_la` pus și `inlocuita_la` gol. */
  extrasa_la: string | null;
  inlocuita_la: string | null;
};

export type GiveawayAdmin = {
  id: string;
  slug: string;
  titlu: string;
  starts_at: string;
  ends_at: string;
  stare: StareGiveaway;
  /** Copia câștigătorului confirmat. Rămâne și după ce participarea lui e ștearsă. */
  castigator: { nume: string; instagram: string; extras_la: string; confirmat_la: string } | null;
  incheiat_la: string | null;
  /** Câte participări erau la încheiere, înainte de ștergerea celor fără acord. */
  total_participari: number | null;
};

export type DateGiveaway = {
  /** Toate giveaway-urile, cel mai nou primul — pentru selector. */
  giveaways: { id: string; slug: string; titlu: string; stare: StareGiveaway }[];
  /** Cel cerut sau, fără parametru, cel curent. `null` când nu există niciunul. */
  giveaway: GiveawayAdmin | null;
  participari: ParticipareGiveaway[];
};

export const loadGiveaway = (
  token: string,
  giveawayId: string | null,
  signal?: AbortSignal
): Promise<DateGiveaway> =>
  rpc<DateGiveaway>('admin_giveaway_date', { p_token: token, p_giveaway_id: giveawayId }, signal);

/** Ștergere definitivă: e și calea prin care o persoană e scoasă la cerere. */
export const stergeParticipare = (token: string, id: string): Promise<void> =>
  rpc<void>('admin_giveaway_sterge', { p_token: token, p_id: id });

/** Prima extragere și reextragerea. Alegerea se face pe server. */
export const extrageGiveaway = (token: string, giveawayId: string): Promise<string> =>
  rpc<string>('admin_giveaway_extrage', { p_token: token, p_giveaway_id: giveawayId });

export const confirmaGiveaway = (token: string, giveawayId: string): Promise<void> =>
  rpc<void>('admin_giveaway_confirma', { p_token: token, p_giveaway_id: giveawayId });

/** Ireversibil: șterge participările fără acord de contact. Întoarce câte a șters. */
export const incheieGiveaway = (token: string, giveawayId: string): Promise<number> =>
  rpc<number>('admin_giveaway_incheie', { p_token: token, p_giveaway_id: giveawayId });

/**
 * Refuzul serverului, în cuvintele organizatorului. Aproape toate înseamnă că
 * ecranul a rămas în urmă față de starea reală, deci ecranul se reîncarcă
 * oricum după un refuz.
 */
export const mesajRefuzGiveaway = (err: unknown): string => {
  const text = err instanceof Error ? err.message : String(err);
  if (text.includes('fara_participari')) return 'Nu mai e nicio participare de extras.';
  if (text.includes('giveaway_deschis')) return 'Extragerea se poate face abia după ce se închid înscrierile.';
  if (text.includes('giveaway_incheiat')) return 'Giveaway-ul e deja încheiat.';
  if (text.includes('fara_extras')) return 'Nu e nicio persoană extrasă de confirmat.';
  if (text.includes('deja_confirmat')) return 'Câștigătorul e deja confirmat.';
  if (text.includes('fara_castigator')) return 'Confirmă întâi câștigătorul.';
  if (text.includes('participare_inexistenta')) return 'Participarea nu mai există.';
  if (text.includes('giveaway_inexistent')) return 'Giveaway-ul nu mai există. Reîncarcă pagina.';
  return 'Nu a mers. Încearcă din nou.';
};
