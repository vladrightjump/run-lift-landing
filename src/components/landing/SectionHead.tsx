import type { ReactNode } from 'react';

type Props = {
  /** Numărul afișat (01, 02…), derivat din poziția secțiunii pe pagină. */
  num: string;
  children: ReactNode;
};

/**
 * Antetul de secțiune al landing-ului: numărul, o linie până la margine și
 * titlul la scară de afiș. Clasele `.e3-title-num` și `.e3-title` poartă și
 * dezvăluirea legată de scroll din `edition3.css`.
 */
export const SectionHead = ({ num, children }: Props) => (
  <div className="e3-sec-head">
    <span className="e3-title-num">{num}</span>
    <h2 className="e3-title">{children}</h2>
  </div>
);
