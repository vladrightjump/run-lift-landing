import shared1 from './EvenimenteStyles.module.css';
import adminStyles from '../../components/AdminStyles.module.css';
import styles from './AdminSkeleton.module.css';
type Props = {
  /** Câte coloane are tabelul-gazdă (grila vine din `.admin-row`). */
  cols: number;
  /** Câte rânduri fantomă. Implicit 5 — cât să pară listă, nu o singură bară. */
  rows?: number;
};

/**
 * Rânduri fantomă pentru tabelele din backoffice, cât se încarcă datele.
 * Stau în `.admin-row`, deci preiau grila tabelului în care sunt puse și se
 * aliniază la coloanele lui fără să știe nimic despre ele.
 */
export const AdminFeedSkeleton = ({ rows = 3 }: { rows?: number }) => (
  <div role="status" aria-busy="true">
    <span className={styles['admin-sr']} data-css="admin-sr">Se încarcă…</span>
    {Array.from({ length: rows }, (_, r) => (
      <div key={r} className={shared1['admin-activity-item']} data-css="admin-activity-item" aria-hidden="true">
        <span className={shared1['admin-activity-dot'] + ' ' + styles.dot} data-css="admin-activity-dot" />
        <span className={styles['admin-skel'] + ' ' + styles.feed} data-css="admin-skel" style={{ maxWidth: `${46 + r * 12}%` }} />
      </div>
    ))}
  </div>
);

export const AdminSkeleton = ({ cols, rows = 5 }: Props) => (
  <div role="status" aria-busy="true">
    <span className={styles['admin-sr']} data-css="admin-sr">Se încarcă…</span>
    {Array.from({ length: rows }, (_, r) => (
      <div key={r} className={adminStyles['admin-row']} data-css="admin-row" aria-hidden="true">
        {Array.from({ length: cols }, (_column, c) => (
          // Lățimi inegale, altfel șirul de bare arată a grilă, nu a date.
          <span key={c} className={styles['admin-skel']} data-css="admin-skel" style={{ width: `${52 + ((r + c) % 4) * 14}%` }} />
        ))}
      </div>
    ))}
  </div>
);
