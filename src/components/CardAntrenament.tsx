import { useEffect, useState } from 'react';
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
    <a className="cs-antren" href="/antrenament">
      <span className="cs-antren-eticheta">Până atunci</span>

      <span className="cs-antren-cap">
        <span className="cs-antren-nr">Săptămâna {saptamana.numar}</span>
        <span className="cs-antren-titlu">{saptamana.titlu}</span>
      </span>

      {/*
        Primele rânduri, tăiate cu fade. `pre-wrap` ca pe pagina întreagă —
        rândurile scrise de organizator sunt formatul, și aici la fel.
      */}
      <span className="cs-antren-corp">{saptamana.corp}</span>

      <span className="cs-antren-cta">Vezi antrenamentul →</span>
    </a>
  );
};
