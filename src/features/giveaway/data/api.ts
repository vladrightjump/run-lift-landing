import { rpcStrict } from '../../../shared/lib/rpc';
import { SubmitHttpError } from '../../../shared/lib/errors';
import { normalizePhone } from '../../../shared/lib/validation';
import { postForm, type AntiBot } from '../../inscriere';
import { normalizeInstagram, type GiveawayDraft } from '../lib/giveawayForm';

/**
 * Ce vede pagina publică dintr-un giveaway. Starea e calculată pe server: tot
 * ce urmează după sfârșit (extragere, confirmare, încheiere) apare `inchis`.
 */
type StareGiveaway = 'programat' | 'deschis' | 'inchis';

export type GiveawayPublic = {
  /** Cheia sub care stau textele în `content.ts`. */
  slug: string;
  starts_at: string;
  ends_at: string;
  stare: StareGiveaway;
};

/**
 * Giveaway-ul curent, sau `null` când nu există niciunul. `rpcStrict`, nu
 * `rpc`: un răspuns stricat trebuie să ajungă în starea de eroare, nu să arate
 * ca „niciun giveaway".
 */
export const loadPublicGiveaway = (signal?: AbortSignal): Promise<GiveawayPublic | null> =>
  rpcStrict<GiveawayPublic | null>('public_giveaway', {}, signal);

/**
 * INSERT în `giveaway_entries`, prin `submit-form`. O dublură (același telefon,
 * email sau cont de Instagram) întoarce HTTP 409.
 *
 * Giveaway-ul NU se trimite: îl atribuie triggerul din baza de date, ca la
 * `editie`.
 */
export const submitGiveawayEntry = async (
  draft: GiveawayDraft,
  antiBot: AntiBot,
  externalSignal?: AbortSignal
): Promise<void> => {
  await postForm(
    'giveaway',
    {
      nume: draft.nume.trim(),
      telefon: normalizePhone(draft.telefon),
      email: draft.email.trim(),
      instagram: normalizeInstagram(draft.instagram),
      acord_regulament: draft.acordRegulament,
      acord_contact: draft.acordContact,
    },
    antiBot,
    externalSignal
  );
};

/**
 * Serverul a refuzat fiindcă giveaway-ul nu primește înscrieri acum: s-a
 * închis între timp, n-a început sau nu mai există. Pagina era în urmă.
 */
export const isGiveawayClosedError = (err: unknown): boolean =>
  err instanceof SubmitHttpError && /giveaway_inchis|giveaway_neinceput|fara_giveaway/.test(err.message);
