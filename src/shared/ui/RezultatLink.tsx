import cadruStyles from './CadruScurt.module.css';
import { TitluScurt } from './CadruScurt';
import styles from './RezultatLink.module.css';

/** Ce spune o pagină din linkul de email după ce serverul a răspuns. */
export type Rezultat = { titlu: string; text: string; ok: boolean };

/**
 * Rezultatul unui link din email: iconița, titlul, explicația și drumul înapoi
 * spre pagina principală. Același pe confirmare, dezabonare și renunțare.
 */
export const RezultatLink = ({ titlu, text, ok }: Rezultat) => (
  <>
    <div className={ok ? styles.icon : `${styles.icon} ${styles.eroare}`} aria-hidden="true">
      {ok ? '✓' : '✕'}
    </div>
    <TitluScurt>{titlu}</TitluScurt>
    <p className={cadruStyles['cs-sub']} data-css="cs-sub">{text}</p>
    <a className={cadruStyles['cs-cta']} data-css="cs-cta" href="/">
      Înapoi la pagina principală
    </a>
  </>
);
