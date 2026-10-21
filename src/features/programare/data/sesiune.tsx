import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';

export type SesiuneProgramare = {
  token: string;
  onAuthError: (eroare: unknown) => boolean;
  showToast: (toast: { kind: 'error' | 'success'; msg: string }) => void;
};
const Context = createContext<SesiuneProgramare | null>(null);
export const FurnizorProgramare = ({ sesiune, children }: { sesiune: SesiuneProgramare; children: ReactNode }) =>
  <Context.Provider value={sesiune}>{children}</Context.Provider>;

export const useSesiuneProgramare = () => {
  const sesiune = useContext(Context);
  if (!sesiune) throw new Error('Programare cere o sesiune de admin.');
  return sesiune;
};
