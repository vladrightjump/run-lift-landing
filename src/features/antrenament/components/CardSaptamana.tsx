import styles from '../styles/CardSaptamana.module.css';

/**
 * O săptămână din program, așa cum o vede vizitatorul.
 *
 * Aceeași componentă randează pagina `/antrenament` și previzualizarea din
 * editorul adminului, deci ce vede organizatorul înainte de „Publică" e chiar
 * cardul public. Doar nivelul titlului diferă: în editor cardul stă sub
 * titlul ecranului, deci e `h3`. Locul care îl găzduiește îl ajustează prin
 * `className`, nu prin selectori pe marcajul lui.
 */
export const CardSaptamana = ({
  numar,
  titlu,
  corp,
  nivelTitlu = 'h2',
  className,
}: {
  numar: number | string;
  titlu: string;
  corp: string;
  nivelTitlu?: 'h2' | 'h3';
  /** Clasa locului în care stă cardul (editorul adminului îi schimbă lățimea). */
  className?: string;
}) => {
  const Titlu = nivelTitlu;
  return (
    <article className={className ? `${styles.card} ${className}` : styles.card}>
      <p className={styles.eticheta}>Săptămâna {numar}</p>
      <Titlu className={styles.titlu}>{titlu}</Titlu>
      {/*
        `pre-wrap`, nu markdown: organizatorul scrie antrenamentul cum l-ar
        fi scris în story, iar rândurile lui sunt tot formatul de care are
        nevoie. React scapă textul, deci nimic din ce se tastează în
        backoffice nu poate deveni marcaj pe pagina publică.
      */}
      <p className={styles.corp}>{corp}</p>
    </article>
  );
};
