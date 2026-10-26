import shared2 from './PublicLayout.module.css';
import styles from './SectionHead.module.css';
import type { ReactNode } from 'react';

type Props = {
  /** Numărul afișat (01, 02…), derivat din poziția secțiunii pe pagină. */
  num: string;
  children: ReactNode;
};

/**
 * Antetul de secțiune al paginilor publice: numărul, o linie până la margine și
 * titlul la scară de afiș. Clasele `.e3-title-num` și `.e3-title` poartă și
 * dezvăluirea legată de scroll din `PublicLayout.module.css`.
 */
export const SectionHead = ({ num, children }: Props) => (
  <div className={styles['e3-sec-head']} data-css={"e3-sec-head"}>
    <span className={shared2['e3-title-num']} data-css={"e3-title-num"}>{num}</span>
    <h2 className={shared2['e3-title']} data-css={"e3-title"}>{children}</h2>
  </div>
);
