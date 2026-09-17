import { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';

/**
 * Sesiunea de backoffice: tokenul, ce se întâmplă când el nu mai e valid, și
 * cum se anunță organizatorul.
 *
 * Erau trei prop-uri pe care fiecare tab le declara și le primea de la
 * `AdminDashboard`, doar ca să le dea mai departe. Nu sunt date de tab, sunt
 * date de sesiune: identice pentru toate, schimbate în același moment, și
 * niciun tab nu le modifică.
 *
 * Ediția RĂMÂNE prop: chiar diferă de la un tab la altul (tabul „Eveniment"
 * lucrează pe ciornă, cel de livrare pe ediția selectată) și e exact genul de
 * dependență care trebuie să se vadă în semnătură.
 */

type ToastAdmin = { kind: 'error' | 'success'; msg: string };

export type SesiuneAdmin = {
  token: string;
  /**
   * `true` dacă eroarea era una de sesiune și a fost tratată (întoarcere la
   * login). Apelantul se oprește; nu mai are ce afișa.
   */
  onAuthError: (err: unknown) => boolean;
  showToast: (toast: ToastAdmin) => void;
};

const ContextSesiune = createContext<SesiuneAdmin | null>(null);

export const FurnizorSesiuneAdmin = ({
  token,
  onAuthError,
  showToast,
  children,
}: SesiuneAdmin & { children: ReactNode }) => {
  const valoare = useMemo(
    () => ({ token, onAuthError, showToast }),
    [token, onAuthError, showToast]
  );
  return <ContextSesiune.Provider value={valoare}>{children}</ContextSesiune.Provider>;
};

/**
 * Sesiunea curentă.
 *
 * Aruncă dacă nu există furnizor, în loc să întoarcă `undefined`: un tab montat
 * pe dinafară ar fi cerut date cu un token gol și ar fi primit un 401 pe care
 * l-ar fi raportat ca eroare de rețea. Mai bine pică la randare, unde se vede.
 */
export const useSesiuneAdmin = (): SesiuneAdmin => {
  const sesiune = useContext(ContextSesiune);
  if (!sesiune) {
    throw new Error('useSesiuneAdmin cere un <FurnizorSesiuneAdmin> deasupra.');
  }
  return sesiune;
};
