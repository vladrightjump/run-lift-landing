import { useState } from 'react';
import { INSTAGRAM_HANDLE, INSTAGRAM_URL } from '../../lib/config';
import { useEventConfig } from '../../hooks/useEventConfig';
import type { ReelEntry } from '../../content/eventConfig';
import { sectionNum, sectionTitle } from './shared';

type Props = {
  /** Numărul afișat al secțiunii — se schimbă când ordinea secțiunilor se schimbă. */
  num?: string;
};

/** Adresa canonică a clipului — cea pe care o deschizi într-un tab nou. */
const linkCanonic = (r: ReelEntry): string =>
  `https://www.instagram.com/${r.kind}/${r.code}/`;

/**
 * Adresa de embed. Ruta contează: Instagram nu servește un reel pe `/p/`, deci
 * `kind` nu e decorativ, e ce face diferența dintre un clip și un iframe gol.
 */
const linkEmbed = (r: ReelEntry): string =>
  `https://www.instagram.com/${r.kind}/${r.code}/embed/`;

/**
 * Secțiunea „Instagram": bandă cu clipurile de pe `@we_run_and_lift`.
 *
 * Cardurile sunt FAÇADE, nu embed-uri. Până la un click, pagina nu cere nimic de
 * la Instagram — nici cod, nici cookie, nici imagine. Abia clicul montează
 * iframe-ul oficial, în locul cardului apăsat.
 *
 * De ce nu `embed.js` (scriptul oficial): ar cere `script-src
 * https://www.instagram.com` într-un CSP care azi e `script-src 'self'`, ar rula
 * cod terț pe pagină, și ar randa cardul alb al Instagramului — imposibil de
 * așezat în banda asta. Iframe-ul simplu are nevoie doar de `frame-src`.
 *
 * Un singur iframe montat odată: trei embed-uri Instagram simultan ar aduce
 * câțiva MB pe o pagină al cărei hero e deja un video.
 */
export const ReelsSection = ({ num = '05' }: Props) => {
  const { reels } = useEventConfig();
  // Codul clipului deschis. `null` = toate cardurile sunt încă façade.
  const [activ, setActiv] = useState<string | null>(null);

  // Apelantul filtrează deja lista goală (altfel numerotarea ar sări peste un
  // număr), dar componenta nu se bazează pe asta: randată direct, nu produce o
  // bandă goală.
  if (reels.items.length === 0) return null;

  return (
    <section className="e3-reels">
      {/* Cuvântul-fantomă. Decorativ integral, deci ascuns de cititoarele de
          ecran: handle-ul e deja anunțat de linkul din coloana de text. */}
      <span className="e3-reels-ghost" aria-hidden="true">
        {INSTAGRAM_HANDLE}
      </span>

      <div className="e3-reels-inner">
        {/* Șina primește `data-reveal` ÎNTREAGĂ, nu fiecare card.
            `useScrollReveal` pune `opacity: 0` pe fiecare element observat și îl
            readuce doar când IntersectionObserver îl vede — iar cardurile tăiate
            orizontal de `overflow-x` nu intersectează viewport-ul. Cu reveal pe
            card, al patrulea și următoarele ar rămâne invizibile exact când
            vizitatorul derulează șina ca să le vadă. */}
        <div className="e3-reels-rail" data-reveal>
          {reels.items.map((r, i) => (
            <figure key={r.code} className="e3-reels-item">
              {activ === r.code ? (
                <div className="e3-reel e3-reel--live">
                  <iframe
                    className="e3-reel-frame"
                    src={linkEmbed(r)}
                    title={r.caption || `Clip Instagram ${i + 1}`}
                    loading="lazy"
                    allowFullScreen
                    scrolling="no"
                  />
                </div>
              ) : (
                <button
                  type="button"
                  className="e3-card e3-reel"
                  onClick={() => setActiv(r.code)}
                  aria-label={
                    r.caption ? `Redă clipul: ${r.caption}` : `Redă clipul ${i + 1}`
                  }
                >
                  {r.poster ? (
                    <img
                      className="e3-reel-poster"
                      src={r.poster}
                      alt=""
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    // Fără poster, cardul nu devine o casetă goală: cade pe
                    // același limbaj de cifră-fantomă ca stațiile din „Formatul".
                    <span className="e3-reel-fallback" aria-hidden="true">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                  )}
                  <span className="e3-reel-play" aria-hidden="true">
                    ▶
                  </span>
                </button>
              )}

              {/* Caption SUB card, nu peste imagine: peste o fotografie
                  necontrolată nu se poate garanta contrastul. */}
              <figcaption className="e3-reel-caption">
                {r.caption && <span>{r.caption}</span>}
                {/* Plasa de siguranță: dacă iframe-ul e blocat (extensie, rețea
                    de firmă, clip șters), clipul rămâne accesibil. */}
                <a
                  className="e3-link e3-reel-out"
                  href={linkCanonic(r)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <span aria-hidden="true">↗</span> Deschide pe Instagram
                </a>
              </figcaption>
            </figure>
          ))}
        </div>

        <div className="e3-reels-text">
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 20, marginBottom: 24 }}>
            <span className="e3-title-num" style={sectionNum}>
              {num}
            </span>
            <h2 className="e3-title" style={sectionTitle}>
              {reels.headline}
            </h2>
          </div>
          {reels.body && <p className="e3-reels-body">{reels.body}</p>}
          <a
            className="e3-link e3-reels-cta"
            href={INSTAGRAM_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            <span aria-hidden="true">↗</span> {INSTAGRAM_HANDLE}
          </a>
        </div>
      </div>
    </section>
  );
};
