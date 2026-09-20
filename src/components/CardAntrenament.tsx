import { useCallback, useEffect, useState } from 'react';
import { fetchWeeklyWorkouts, type WeeklyWorkout } from '../lib/supabase';

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
export const CardAntrenament = () => {
  const [saptamana, setSaptamana] = useState<WeeklyWorkout | null>(null);
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

  useEffect(() => {
    const control = new AbortController();
    fetchWeeklyWorkouts(control.signal)
      .then((program) => {
        if (program.length === 0) return;
        // Cea curentă: numărul cel mai mare vizibil, ca pe `/antrenament`.
        setSaptamana(program[program.length - 1]);
      })
      // Tăcere intenționată, inclusiv pe AbortError: n-avem ce spune aici.
      .catch(() => {});
    return () => control.abort();
  }, []);

  if (saptamana === null) return null;

  return (
    /**
     * Numele accesibil e pus explicit fiindcă întreg cardul e un singur link:
     * fără el, un cititor de ecran ar citi tot antrenamentul ca etichetă a
     * linkului, fără nicio cale de a-l survola.
     */
    <a
      className="cs-antren"
      href="/antrenament"
      aria-label={`Antrenamentul săptămânii ${saptamana.numar}: ${saptamana.titlu}`}
    >
      <span className="cs-antren-eticheta">Până atunci</span>

      <span className="cs-antren-cap">
        <span className="cs-antren-nr">Săptămâna {saptamana.numar}</span>
        <span className="cs-antren-titlu">{saptamana.titlu}</span>
      </span>

      {/*
        Primele rânduri. `pre-wrap` ca pe pagina întreagă — rândurile scrise de
        organizator sunt formatul, și aici la fel.
      */}
      <span ref={masoaraCorpul} className={`cs-antren-corp${taiat ? ' taiat' : ''}`}>
        {saptamana.corp}
      </span>

      <span className="cs-antren-cta">Vezi antrenamentul →</span>
    </a>
  );
};
