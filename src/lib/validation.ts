import { EVENT_DATE } from './config';

export type FormData = {
  nume: string;
  telefon: string;
  email: string;
  dataNasterii: string; // ISO yyyy-mm-dd din <input type="date">
  acord: boolean;
};

export type FieldName = 'nume' | 'telefon' | 'email' | 'dataNasterii' | 'acord';
export type FieldErrors = Partial<Record<FieldName, boolean>>;

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// Se aplică pe numărul normalizat (fără spații, paranteze, liniuțe, puncte).
export const PHONE_RE = /^\+?\d{8,15}$/;

export const normalizePhone = (value: string): string => value.replace(/[\s().-]/g, '');

// Vârsta minimă de participare, calculată la data evenimentului.
export const MIN_AGE = 14;

/** Vârsta (ani întregi) pe care o are cineva la data evenimentului. */
export const ageAtEvent = (isoBirth: string): number | null => {
  const d = new Date(isoBirth);
  if (Number.isNaN(d.getTime())) return null;
  let age = EVENT_DATE.getFullYear() - d.getFullYear();
  const m = EVENT_DATE.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && EVENT_DATE.getDate() < d.getDate())) age--;
  return age;
};

// Mesaj de eroare pentru câmpul „data nașterii" — depinde de motiv.
export const dataNasteriiError = (isoBirth: string): string | null => {
  if (!isoBirth) return 'Introdu data nașterii.';
  const age = ageAtEvent(isoBirth);
  if (age === null) return 'Data nașterii nu e validă.';
  if (age < MIN_AGE) return `Trebuie să ai minim ${MIN_AGE} ani la data evenimentului.`;
  if (age > 100) return 'Data nașterii nu e validă.';
  return null;
};

export const validate = (data: FormData): FieldErrors => {
  const errors: FieldErrors = {};
  if (data.nume.length < 3) errors.nume = true;
  if (!PHONE_RE.test(normalizePhone(data.telefon))) errors.telefon = true;
  if (!EMAIL_RE.test(data.email)) errors.email = true;
  if (dataNasteriiError(data.dataNasterii) !== null) errors.dataNasterii = true;
  if (!data.acord) errors.acord = true;
  return errors;
};

export const firstErrorField = (errors: FieldErrors): FieldName | undefined => {
  return (['nume', 'telefon', 'email', 'dataNasterii'] as const).find((n) => errors[n]);
};

export const errorMessage = (errors: FieldErrors): string => {
  const count = Object.keys(errors).length;
  if (errors.acord && count === 1) {
    return 'Trebuie să accepți regulamentul ca să te poți înscrie.';
  }
  return 'Verifică câmpurile marcate cu roșu.';
};
