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

/** Formatul produs de selectoarele zi/lună/an din formular. */
const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Data calendaristică a evenimentului în fusul Chișinăului, ca [an, lună, zi].
 *
 * `EVENT_DATE.getDate()` ar citi în fusul browserului: pentru un vizitator din
 * Honolulu, startul de 25 iulie 07:00 (ora Chișinăului) cade pe 24 iulie local,
 * iar pragul de vârstă s-ar muta cu o zi. Regula „minim 14 ani la data
 * evenimentului" trebuie să dea același rezultat pe orice dispozitiv.
 */
const EVENT_YMD: [number, number, number] = (() => {
  const iso = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Chisinau',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(EVENT_DATE);
  const [y, m, d] = iso.split('-').map(Number);
  return [y, m, d];
})();

/**
 * Vârsta (ani întregi) pe care o are cineva la data evenimentului.
 * `null` dacă data lipsește, e malformată sau nu există în calendar.
 *
 * Parsăm componentele manual (nu prin `new Date(iso)`) din două motive:
 *  1. `new Date('2012-02-30')` NU dă eroare — rostogolește în 1 martie, deci
 *     o dată imposibilă (selectabilă din formular: ziua 30 + luna februarie)
 *     ar trece validarea și ar ajunge stricată în baza de date.
 *  2. `new Date('yyyy-mm-dd')` se interpretează ca miezul nopții UTC, dar
 *     `getFullYear/getMonth/getDate` citesc în fusul local — într-un fus cu
 *     offset negativ data „aluneca" cu o zi și schimba vârsta la limită.
 */
export const ageAtEvent = (isoBirth: string): number | null => {
  const parts = ISO_DATE_RE.exec(isoBirth);
  if (!parts) return null;
  const year = Number(parts[1]);
  const month = Number(parts[2]);
  const day = Number(parts[3]);

  // Data trebuie să existe în calendar: dacă Date a rostogolit-o, componentele
  // nu se mai potrivesc cu ce am cerut (ex. 30 feb → 1/2 martie).
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }

  const [eventYear, eventMonth, eventDay] = EVENT_YMD;
  let age = eventYear - year;
  const m = eventMonth - month;
  if (m < 0 || (m === 0 && eventDay < day)) age--;
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
