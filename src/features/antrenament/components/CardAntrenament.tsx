import { useCallback, useState } from 'react';
import { useProgramAntrenament } from '../data/queries';
import styles from '../styles/CardAntrenament.module.css';

/**
 * „Până atunci" — antrenamentul săptămânii, pe ecranul de așteptare.
 *
 * Countdown-ul de deasupra ridică o întrebare pe care pagina n-o răspundea:
 * *ce fac în cele cinci zile?* Cardul ăsta e răspunsul, și de asta stă imediat
 * sub el, nu în meniu.
 *
 * Arată CONȚINUTUL, nu o etichetă. Un buton scris „Antrenamentul săptămânii"
 * cere un act de încredere înainte de clic; numărul săptămânii, titlul și
 * primele rânduri se citesc din mers, iar clicul devine continuarea a ceva
 * început, nu un pariu.
 *
 * Tace complet când n-are ce arăta — program gol, cerere picată, răspuns
 * stricat. E decor pe un ecran al cărui rost e formularul de notificare: o
 * bandă de eroare aici ar strica pagina pentru o piesă secundară. Aceeași
 * regulă ca la banda de clipuri, care nici ea nu se randează fără clipuri.
 */
export const CardAntrenament = ({
  className,
}: {
  /** Clasa locului în care stă cardul (sub secțiunea de probă pierde marginea de sus). */
  className?: string;
} = {}) => {
  const { data: program } = useProgramAntrenament();
  // Cea curentă: numărul cel mai mare vizibil, ca pe `/antrenament`. O eroare
  // lasă `program` nedefinit, deci cardul tace.
  const saptamana = program && program.length > 0 ? program[program.length - 1] : null;
  /**
   * Corpul chiar a fost tăiat de `max-height`?
   *
   * Se măsoară, nu se ghicește din numărul de rânduri din text: la 375px un
   * singur rând scris se poate rupe în trei, deci numărătoarea ar fi greșit
   * exact acolo unde contează. Fade-ul se aplică doar când răspunsul e da —
   * altfel un antrenament scurt ar fi stins degeaba, promițând un „mai e
   * dedesubt" inexistent.
   */
  const [taiat, setTaiat] = useState(false);

  /**
   * Callback ref, nu `useRef` + efect: măsurătoarea are nevoie de exact o
   * clipă — cea în care elementul intră în pagină — iar asta e chiar momentul
   * în care React cheamă funcția. Un efect ar fi cerut o listă de dependențe
   * care să descrie acel moment indirect.
   *
   * Identitatea e stabilă, deci re-randarea provocată de `setTaiat` nu o
   * recheamă.
   */
  const masoaraCorpul = useCallback((el: HTMLSpanElement | null) => {
    if (el === null) return;
    setTaiat(el.scrollHeight > el.clientHeight + 1);
  }, []);

  if (saptamana === null) return null;

  return (
    /**
     * Numele accesibil e pus explicit fiindcă întreg cardul e un singur link:
     * fără el, un cititor de ecran ar citi tot antrenamentul ca etichetă a
     * linkului, fără nicio cale de a-l survola.
     */
    <a
      className={className ? `${styles.antren} ${className}` : styles.antren}
      href="/antrenament"
      aria-label={`Antrenamentul săptămânii ${saptamana.numar}: ${saptamana.titlu}`}
    >
      <span className={styles.eticheta}>Până atunci</span>

      <span className={styles.cap}>
        <span className={styles.nr}>Săptămâna {saptamana.numar}</span>
        <span className={styles.titlu}>{saptamana.titlu}</span>
      </span>

      {/*
        Primele rânduri. `pre-wrap` ca pe pagina întreagă — rândurile scrise de
        organizator sunt formatul, și aici la fel.
      */}
      <span ref={masoaraCorpul} className={taiat ? `${styles.corp} ${styles.taiat}` : styles.corp}>
        {saptamana.corp}
      </span>

      <span className={styles.cta}>Vezi antrenamentul →</span>
    </a>
  );
};
