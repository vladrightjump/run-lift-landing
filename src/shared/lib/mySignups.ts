/**
 * Înscrierile făcute de pe acest dispozitiv — doar pentru badge-ul „Nou"
 * din lista de participanți. Pur cosmetic: dacă localStorage nu e
 * disponibil, lista funcționează normal, fără badge.
 */

const KEY = 'runlift_registrari';

/** Oglinda client a mascării din RPC-ul `public_stats`: „Vlad Filip" → „Vlad F.". */
export const maskName = (full: string): string => {
  const parts = full.trim().split(/\s+/);
  if (!parts[0]) return '';
  const last = parts.length > 1 ? ` ${parts[parts.length - 1][0].toUpperCase()}.` : '';
  return parts[0] + last;
};

export const getMySignups = (): string[] => {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
};

export const rememberMySignup = (numeComplet: string): void => {
  try {
    localStorage.setItem(KEY, JSON.stringify([...getMySignups(), maskName(numeComplet)]));
  } catch {
    // localStorage indisponibil (ex: private mode) — ignorăm.
  }
};
