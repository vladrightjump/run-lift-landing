/**
 * Partea neprezentațională a formularului de giveaway: tipurile, validarea și
 * mesajele. Regulile sunt aceleași cu `validateGiveawayRow` din funcția Edge
 * `submit-form` — clientul le aplică pentru UX, serverul pentru adevăr.
 */
import { EMAIL_RE, PHONE_RE, normalizePhone } from '../../../shared/lib/validation';

export type GiveawayDraft = {
  nume: string;
  telefon: string;
  email: string;
  instagram: string;
  acordRegulament: boolean;
  acordContact: boolean;
};

/** Câmpurile care pot fi greșite. Acordul de contact e opțional, deci lipsește. */
type GiveawayField = 'nume' | 'telefon' | 'email' | 'instagram' | 'acordRegulament';
export type GiveawayErrors = Partial<Record<GiveawayField, boolean>>;

export const EMPTY_GIVEAWAY_DRAFT: GiveawayDraft = {
  nume: '',
  telefon: '',
  email: '',
  instagram: '',
  acordRegulament: false,
  acordContact: false,
};

/** Un cont de Instagram: 1–30 de caractere din litere, cifre, punct și liniuță jos. */
const INSTAGRAM_RE = /^[a-z0-9._]{1,30}$/;
/** Primul segment al unui link Instagram care NU e un profil. */
const INSTAGRAM_NU_E_PROFIL = ['p', 'reel', 'reels', 'stories', 'explore', 'tv'];

/**
 * Contul de Instagram, oricum l-ar fi scris omul: cu „@", simplu sau ca link de
 * profil lipit din aplicație („Copiază linkul profilului").
 */
export const normalizeInstagram = (valoare: string): string => {
  const text = valoare.trim();
  const link = /instagram\.com\/([^/?#\s]+)/i.exec(text);
  // Linkul unei postări nu e un profil: rămâne neschimbat și pică validarea.
  if (link && INSTAGRAM_NU_E_PROFIL.includes(link[1].toLowerCase())) return text;
  return (link ? link[1] : text).replace(/^@/, '').toLowerCase();
};

/** Câmpurile invalide (gol = totul valid). */
export const validateGiveawayDraft = (d: GiveawayDraft): GiveawayErrors => {
  const errors: GiveawayErrors = {};
  const nume = d.nume.trim();
  if (nume.length < 3 || nume.length > 120) errors.nume = true;
  if (!PHONE_RE.test(normalizePhone(d.telefon))) errors.telefon = true;
  if (!EMAIL_RE.test(d.email.trim())) errors.email = true;
  if (!INSTAGRAM_RE.test(normalizeInstagram(d.instagram))) errors.instagram = true;
  if (!d.acordRegulament) errors.acordRegulament = true;
  return errors;
};

export const GIVEAWAY_MESSAGES = {
  validation: 'Verifică câmpurile marcate cu roșu.',
  regulament: 'Bifează că accepți regulamentul ca să participi.',
  timeout: 'Serverul răspunde greu. Încearcă din nou.',
  generic: 'Nu am putut trimite. Verifică conexiunea și încearcă din nou.',
  indisponibil: 'Înscrierile nu sunt deschise acum. Reîncarcă pagina.',
} as const;
