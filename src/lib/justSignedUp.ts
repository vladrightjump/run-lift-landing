/**
 * Flag „s-a înscris chiar acum", pus înainte de redirectul de pe /inscriere spre
 * landing și consumat o singură dată de `SignupBanner`. Pur cosmetic: dacă
 * sessionStorage nu e disponibil, redirectul funcționează, doar bannerul lipsește.
 */

const KEY = 'runlift_abia_inscris';

export type JustSignedUp = { prenume: string; loc: number | null; waitlist: boolean };

export const markJustSignedUp = (data: JustSignedUp): void => {
  citit = undefined; // un flag nou trebuie să poată fi citit, chiar și fără reload
  try {
    sessionStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // private mode / storage blocat — ignorăm.
  }
};

/**
 * Rezultatul primei citiri din încărcarea CURENTĂ a paginii.
 *
 * `undefined` = încă nu s-a citit. Cache-ul există pentru `<StrictMode>`, care
 * în dev montează componenta de două ori: fără el, prima montare consuma flagul
 * din sessionStorage, iar a doua primea `null` — deci bannerul nu apărea
 * niciodată în dev, dar apărea în producție. Un reload golește modulul, iar
 * sessionStorage e deja șters, deci „o singură dată" rămâne adevărat.
 */
let citit: JustSignedUp | null | undefined;

/** Citește ȘI șterge flagul: bannerul apare o singură dată, nu la fiecare reload. */
export const consumeJustSignedUp = (): JustSignedUp | null => {
  if (citit !== undefined) return citit;
  citit = citesteSiSterge();
  return citit;
};

const citesteSiSterge = (): JustSignedUp | null => {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    sessionStorage.removeItem(KEY);
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const o = parsed as Record<string, unknown>;
    return {
      prenume: typeof o.prenume === 'string' ? o.prenume : 'atlet',
      loc: typeof o.loc === 'number' ? o.loc : null,
      waitlist: o.waitlist === true,
    };
  } catch {
    return null;
  }
};
