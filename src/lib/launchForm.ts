/**
 * Partea NEprezentațională, partajată, a formularului „anunță-mă la lansare".
 * Consumat de `ComingSoon` și `DespreNoi` (prin `useLaunchForm`), care înainte
 * duplicau identic tipurile + validarea.
 */
import { EMAIL_RE, PHONE_RE, normalizePhone } from './validation';

export type LaunchDraft = { nume: string; prenume: string; email: string; telefon: string };
export type LaunchFieldErrors = Partial<Record<keyof LaunchDraft, boolean>>;

export const EMPTY_LAUNCH_DRAFT: LaunchDraft = { nume: '', prenume: '', email: '', telefon: '' };

/** Câmpurile invalide (gol = totul valid). Aceleași reguli pentru ambele formulare. */
export const validateLaunchDraft = (d: LaunchDraft): LaunchFieldErrors => {
  const errors: LaunchFieldErrors = {};
  if (d.nume.trim().length < 2) errors.nume = true;
  if (d.prenume.trim().length < 2) errors.prenume = true;
  if (!EMAIL_RE.test(d.email.trim())) errors.email = true;
  if (!PHONE_RE.test(normalizePhone(d.telefon))) errors.telefon = true;
  return errors;
};

/** Mesajele de feedback — identice în ambele formulare (canalul diferă: toast/inline). */
export const LAUNCH_MESSAGES = {
  validation: 'Verifică câmpurile marcate cu roșu.',
  offline: 'Nu ai conexiune la internet. Reîncearcă când revii online.',
  timeout: 'Serverul răspunde greu. Încearcă din nou.',
  generic: 'Nu am putut trimite. Verifică conexiunea și încearcă din nou.',
} as const;
