/**
 * Configurări eveniment — actualizează valorile de mai jos manual.
 */

export const OCCUPIED_SLOTS = 9;
export const TOTAL_SLOTS = 16;
export const EVENT_DATE = new Date(2026, 6, 11, 6, 30, 0); // 11 iulie 2026, 06:30

/**
 * Google Forms integration.
 *
 * Cum obții aceste valori:
 *  1. Creează un Google Form (forms.google.com) cu câmpurile:
 *     - Nume complet (short answer, required)
 *     - Telefon (short answer, required)
 *     - Email (short answer, required)
 *     - Nume echipă / partener (short answer, optional)
 *     - Acord medical (checkbox, o singură opțiune "Da", required)
 *  2. Click "Send" → tab "Link" → copiază URL-ul → extrage FORM_ID
 *     din: https://docs.google.com/forms/d/e/{FORM_ID}/viewform
 *  3. Click ⋮ → "Get pre-filled link" → completează cu valori de test →
 *     "Get link" → "Copy link". Din URL extrage entry.NNNN — acelea
 *     sunt ENTRY_ID-urile.
 *  4. Înlocuiește valorile de mai jos.
 */
export const GOOGLE_FORM = {
  formId: 'REPLACE_WITH_FORM_ID',
  entries: {
    nume: 'REPLACE_ENTRY_ID',
    telefon: 'REPLACE_ENTRY_ID',
    email: 'REPLACE_ENTRY_ID',
    echipa: 'REPLACE_ENTRY_ID',
    acord: 'REPLACE_ENTRY_ID',
  },
  acordValue: 'Da',
} as const;

export const isFormConfigured = (): boolean => {
  const isReal = (v: string) => v.length > 0 && !v.startsWith('REPLACE');
  const { formId, entries } = GOOGLE_FORM;
  return (
    isReal(formId) &&
    isReal(entries.nume) &&
    isReal(entries.telefon) &&
    isReal(entries.email) &&
    isReal(entries.acord)
  );
};
