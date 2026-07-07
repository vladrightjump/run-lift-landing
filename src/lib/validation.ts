export type FormData = {
  nume: string;
  telefon: string;
  email: string;
  echipa: string;
  acord: boolean;
};

export type FieldName = 'nume' | 'telefon' | 'email' | 'acord';
export type FieldErrors = Partial<Record<FieldName, boolean>>;

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// Se aplică pe numărul normalizat (fără spații, paranteze, liniuțe, puncte).
export const PHONE_RE = /^\+?\d{8,15}$/;

export const normalizePhone = (value: string): string => value.replace(/[\s().-]/g, '');

export const validate = (data: FormData): FieldErrors => {
  const errors: FieldErrors = {};
  if (data.nume.length < 3) errors.nume = true;
  if (!PHONE_RE.test(normalizePhone(data.telefon))) errors.telefon = true;
  if (!EMAIL_RE.test(data.email)) errors.email = true;
  if (!data.acord) errors.acord = true;
  return errors;
};

export const firstErrorField = (errors: FieldErrors): FieldName | undefined => {
  return (['nume', 'telefon', 'email'] as const).find((n) => errors[n]);
};

export const errorMessage = (errors: FieldErrors): string => {
  const count = Object.keys(errors).length;
  if (errors.acord && count === 1) {
    return 'Trebuie să accepți regulamentul ca să te poți înscrie.';
  }
  return 'Verifică câmpurile marcate cu roșu.';
};
