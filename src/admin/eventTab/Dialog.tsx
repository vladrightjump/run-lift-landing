import type { ReactNode } from 'react';
import { Suprapunere } from '../controale/Suprapunere';

/**
 * Un dialog modal cu tastatură: confirmări (publicarea, ștergerea) și
 * formulare scurte (ediția nouă, prezența).
 *
 * E prezentarea „dialog" a suprapunerii comune (`controale/Suprapunere`): același
 * focus la deschidere, aceeași capcană de Tab, același Escape și aceeași
 * întoarcere a focusului ca popoverele și foile. Clasele `.admin-confirm*` rămân
 * pe marcaj, ca variantele de culoare existente (`admin-confirm--neutru`) să
 * meargă mai departe.
 */
export const Dialog = ({
  titlu,
  rol = 'dialog',
  clasa,
  onInchide,
  children,
}: {
  /** Titlul vizibil — devine și numele accesibil al dialogului. */
  titlu: string;
  /**
   * `alertdialog` pentru cele care cer o decizie despre ceva ireversibil
   * (publicarea); `dialog` pentru restul. Cititoarele de ecran anunță altfel.
   */
  rol?: 'dialog' | 'alertdialog';
  /** Clasă suplimentară pe cutie, pentru variantele de culoare existente. */
  clasa?: string;
  onInchide: () => void;
  children: ReactNode;
}) => (
  <Suprapunere tip="dialog" titlu={titlu} rol={rol} clasa={clasa} onInchide={onInchide}>
    {children}
  </Suprapunere>
);
