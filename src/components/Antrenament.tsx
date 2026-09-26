import { useEffect, useState } from 'react';
import { fetchWeeklyWorkouts, type WeeklyWorkout } from '../lib/supabase';
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
 * De la 20 septembrie 2026 e și un PROGRAM, nu doar săptămâna curentă. Cine
 * abia se apucă de alergat n-avea de unde porni: antrenamentul săptămânii 9
 * nu-i folosește dacă n-a făcut 1–8. Cardul rămâne al săptămânii curente —
 * linkul trimis în story duce tot la el — iar programul stă într-un selector
 * sub el.
 *
 * Nu primește contextul ediției: nimic de pe ea nu derivă din ediție, iar un
 * provider pus peste tot ar fi însemnat un fetch fără consumator. De asta
 * `main.tsx` o trece pe lângă `EventConfigProvider`.
 */

type Stare =
  | { fel: 'incarca' }
  | { fel: 'are'; program: WeeklyWorkout[]; ales: number }
  | { fel: 'nimic' }
  | { fel: 'eroare' };

/**
 * Săptămâna cerută prin fragment (`/antrenament#s1`), dacă e una reală.
 *
 * Fragmentul există ca să poți trimite pe cineva direct la Săptămâna 1 — exact
 * omul pentru care programul are rost. Unul care nu corespunde nimănui e
 * ignorat, nu tratat ca eroare: mutările și ștergerile renumerotează, deci un
 * `#s5` trimis luna trecută poate să nu mai însemne nimic, iar un link vechi
 * n-are voie să aterizeze pe un ecran stricat.
 */
const dinFragment = (hash: string, program: WeeklyWorkout[]): number | null => {
  const potrivire = /^#s(\d+)$/.exec(hash);
  if (!potrivire) return null;
  const numar = Number(potrivire[1]);
  return program.some((s) => s.numar === numar) ? numar : null;
};

/** Săptămâna curentă: cea mai mare dintre cele vizibile. Derivată, nu marcată. */
const curenta = (program: WeeklyWorkout[]): number =>
  program.reduce((max, s) => (s.numar > max ? s.numar : max), program[0].numar);

export const Antrenament = () => {
  const [stare, setStare] = useState<Stare>({ fel: 'incarca' });

  useEffect(() => {
    const control = new AbortController();
    fetchWeeklyWorkouts(control.signal)
      .then((program) => {
        if (program.length === 0) return setStare({ fel: 'nimic' });
        setStare({
          fel: 'are',
          program,
          ales: dinFragment(window.location.hash, program) ?? curenta(program),
        });
      })
      .catch((err: unknown) => {
        // Anularea la demontare nu e o eroare de arătat cuiva.
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setStare({ fel: 'eroare' });
      });
    return () => control.abort();
  }, []);

  const alege = (numar: number) => {
    setStare((s) => (s.fel === 'are' ? { ...s, ales: numar } : s));
    /**
     * `replaceState`, nu `pushState`: butonul „înapoi" trebuie să ducă înapoi
     * de unde a venit vizitatorul, nu să-l plimbe prin săptămânile pe care
     * le-a răsfoit.
     */
    window.history.replaceState(null, '', `#s${numar}`);
  };

  const saptamana =
    stare.fel === 'are' ? (stare.program.find((s) => s.numar === stare.ales) ?? null) : null;

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

        {saptamana && (
          <article className="an-card">
            <p className="an-eticheta">Săptămâna {saptamana.numar}</p>
            <h2 className="an-titlu">{saptamana.titlu}</h2>
            {/*
              `pre-wrap`, nu markdown: organizatorul scrie antrenamentul cum l-ar
              fi scris în story, iar rândurile lui sunt tot formatul de care are
              nevoie. React scapă textul, deci nimic din ce se tastează în
              backoffice nu poate deveni marcaj pe pagina publică.
            */}
            <p className="an-corp">{saptamana.corp}</p>
          </article>
        )}

        {/*
          Selectorul apare doar de la două săptămâni în sus — cu una singură ar
          fi un control cu o singură alegere.

          `<select>` nativ, nu meniu propriu: pe telefon deschide roata nativă,
          cea mai bună țintă de atins cu degetul, accesibilă și rezistentă la
          cincizeci de opțiuni, gratis. Un meniu scris de noi ar fi cerut capcană
          de focus, navigare cu tastatura și derulare, pentru zero câștig.
        */}
        {stare.fel === 'are' && stare.program.length > 1 && (
          <div className="an-selector">
            <label className="an-selector-eticheta" htmlFor="an-saptamana">
              Vrei să începi de la capăt? Alege o săptămână.
            </label>
            <select
              id="an-saptamana"
              className="an-selector-camp"
              value={stare.ales}
              onChange={(e) => alege(Number(e.target.value))}
            >
              {stare.program.map((s) => (
                <option key={s.numar} value={s.numar}>
                  Săptămâna {s.numar}
                  {s.titlu ? `: ${s.titlu}` : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        {/*
          Oprit, inexistent, sau doar versiuni vechi — pentru vizitator e
          aceeași situație, iar pagina răspunde în loc să dea 404: linkul
          trimis săptămâna trecută trebuie să rămână bun.
        */}
        {stare.fel === 'nimic' && (
          <p className="cs-sub">
            Nu e publicat niciun antrenament acum. Revino peste câteva zile sau vezi ce mai
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
