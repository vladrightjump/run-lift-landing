import { useEffect, useState } from 'react';
import { fetchWeeklyWorkout, type WeeklyWorkout } from '../lib/supabase';
import { INSTAGRAM_URL, INSTAGRAM_HANDLE } from '../lib/config';

/**
 * „Antrenamentul săptămânii" — pagina care există ca să ai ce link trimite.
 *
 * Antrenamentul se publica în story pe Instagram și în grupul de Telegram.
 * Amândouă sunt închise sau trecătoare: story-ul moare în 24 de ore, grupul
 * ajunge doar la cine e deja înăuntru. Când cineva întreabă „ce antrenament e
 * săptămâna asta?", nu exista nimic de trimis. Pagina asta e răspunsul, la un
 * URL care nu se schimbă de la o săptămână la alta.
 *
 * Nu e o arhivă. Arată UN antrenament — cel curent — și n-are navigare spre
 * săptămânile trecute, pentru că valoarea cerută a fost linkul, nu istoricul.
 *
 * Nu primește contextul ediției: nimic de pe ea nu derivă din ediție, iar un
 * provider pus peste tot ar fi însemnat un fetch fără consumator. De asta
 * `main.tsx` o trece pe lângă `EventConfigProvider`.
 */

type Stare =
  | { fel: 'incarca' }
  | { fel: 'are'; antrenament: WeeklyWorkout }
  | { fel: 'nimic' }
  | { fel: 'eroare' };

export const Antrenament = () => {
  const [stare, setStare] = useState<Stare>({ fel: 'incarca' });

  useEffect(() => {
    const control = new AbortController();
    fetchWeeklyWorkout(control.signal)
      .then((a) => setStare(a === null ? { fel: 'nimic' } : { fel: 'are', antrenament: a }))
      .catch((err: unknown) => {
        // Anularea la demontare nu e o eroare de arătat cuiva.
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setStare({ fel: 'eroare' });
      });
    return () => control.abort();
  }, []);

  return (
    <div className="cs-root">
      <div className="cs-bg" aria-hidden="true" />

      <header className="cs-topbar">
        <a className="cs-logo" href="/">
          R<span className="cs-accent">+</span>L
        </a>
        <span className="cs-brand-meta">Run + Lift</span>
      </header>

      <main className="cs-main">
        <h1 className="cf-title">Antrenamentul săptămânii</h1>

        {stare.fel === 'incarca' && (
          <p className="cs-sub" role="status">
            Se încarcă…
          </p>
        )}

        {stare.fel === 'are' && (
          <article className="an-card">
            <h2 className="an-titlu">{stare.antrenament.titlu}</h2>
            {/*
              `pre-wrap`, nu markdown: organizatorul scrie antrenamentul cum l-ar
              fi scris în story, iar rândurile lui sunt tot formatul de care are
              nevoie. React scapă textul, deci nimic din ce se tastează în
              backoffice nu poate deveni marcaj pe pagina publică.
            */}
            <p className="an-corp">{stare.antrenament.corp}</p>
          </article>
        )}

        {/*
          Oprit, inexistent, sau doar versiuni vechi — pentru vizitator e
          aceeași situație, iar pagina răspunde în loc să dea 404: linkul
          trimis săptămâna trecută trebuie să rămână bun.
        */}
        {stare.fel === 'nimic' && (
          <p className="cs-sub">
            Nu e publicat niciun antrenament acum. Revino peste câteva zile — sau vezi ce mai
            facem pe{' '}
            <a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer">
              {INSTAGRAM_HANDLE}
            </a>
            .
          </p>
        )}

        {stare.fel === 'eroare' && (
          <p className="cs-sub" role="alert">
            Nu am putut încărca antrenamentul. Reîncarcă pagina în câteva momente.
          </p>
        )}
      </main>
    </div>
  );
};
