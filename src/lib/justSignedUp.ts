/**
 * Flag „s-a înscris chiar acum", pus înainte de redirectul de pe /inscriere spre
 * landing și consumat o singură dată de `SignupBanner`. Pur cosmetic: dacă
 * sessionStorage nu e disponibil, redirectul funcționează, doar bannerul lipsește.
 */

const KEY = 'runlift_abia_inscris';

export type JustSignedUp = { prenume: string; loc: number | null; waitlist: boolean };

export const markJustSignedUp = (data: JustSignedUp): void => {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // private mode / storage blocat — ignorăm.
  }
};

/** Citește ȘI șterge flagul: bannerul apare o singură dată, nu la fiecare reload. */
export const consumeJustSignedUp = (): JustSignedUp | null => {
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
