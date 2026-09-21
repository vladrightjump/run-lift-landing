import { useEffect, useRef, useState } from 'react';
import '../../edition3.css';
import { INSTAGRAM_HANDLE, INSTAGRAM_URL } from '../../lib/config';
import type { Reel } from '../../lib/supabase';
import { sectionNum, sectionTitle } from './shared';

type Props = {
  /** Clipurile de randat. Lista goală nu randează nimic. */
  reels: readonly Reel[];
  /** Numărul afișat al secțiunii — se schimbă când ordinea secțiunilor se schimbă. */
  num: string;
  headline: string;
  body?: string;
};

/** Mișcarea redusă se citește o singură dată, la montare. */
const preferaMiscareRedusa = (): boolean =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * `play()` întoarce o promisiune care se respinge zgomotos când browserul
 * refuză pornirea (economie de energie pe iOS, politici de autoplay). Refuzul e
 * o stare normală aici, nu o eroare: poster-ul rămâne pe ecran și butonul de
 * pornire e acolo pentru cine vrea clipul.
 */
const porneste = (el: HTMLVideoElement): void => {
  const p = el.play?.();
  if (p && typeof p.catch === 'function') p.catch(() => {});
};

type CardProps = {
  reel: Reel;
  index: number;
  miscareRedusa: boolean;
};

const ReelCard = ({ reel, index, miscareRedusa }: CardProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  // Odată ce clipul a redat un cadru, poster-ul nu mai are ce să acopere.
  const [aRedat, setARedat] = useState(false);
  // Doar la mișcare redusă: butonul rămâne pe card și comută. Fără el, un clip
  // pornit manual ar rula în buclă la nesfârșit, fără nicio cale de oprire —
  // exact pentru cineva care tocmai a cerut mai puțină mișcare.
  const [ruleaza, setRuleaza] = useState(false);

  useEffect(() => {
    // La mișcare redusă nu se montează niciun observator: nimic nu pornește
    // singur, iar butonul de pornire e singura cale.
    if (miscareRedusa) return;
    const el = videoRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;

    const observator = new IntersectionObserver(
      (intrari) => {
        for (const intrare of intrari) {
          if (intrare.isIntersecting) porneste(el);
          else el.pause?.();
        }
      },
      // Un sfert din card vizibil înseamnă „se vede", nu „a atins marginea".
      { threshold: 0.25 }
    );
    observator.observe(el);
    return () => observator.disconnect();
  }, [miscareRedusa]);

  return (
    <figure className="e3-reels-item">
      <div className="e3-card e3-reel">
        {/* `aria-hidden`: un clip mut, în buclă, fără sunet, n-are ce să
            anunțe unui cititor de ecran. Legenda de dedesubt e conținutul. */}
        <video
          ref={videoRef}
          className="e3-reel-video"
          src={reel.video}
          muted
          loop
          playsInline
          preload="none"
          aria-hidden="true"
          onPlaying={() => {
            setARedat(true);
            setRuleaza(true);
          }}
          onPause={() => setRuleaza(false)}
        />
        {/* Poster ca `<img loading="lazy">`, NU ca atributul `poster`:
            atributul n-are echivalent de încărcare leneșă, deci le-ar cere pe
            toate la randare. `preload="none"` oprește doar octeții clipului. */}
        {reel.poster && !aRedat && (
          <img
            className="e3-reel-poster"
            src={reel.poster}
            alt=""
            loading="lazy"
            decoding="async"
          />
        )}
        {/* Fără poster, cardul rămâne desenat, nu gol. */}
        {!reel.poster && !aRedat && (
          <span className="e3-reel-fallback" aria-hidden="true">
            {String(index + 1).padStart(2, '0')}
          </span>
        )}
        {/* La mișcare redusă, singura cale de pornire ȘI de oprire. R5 cere o
            acțiune a vizitatorului, iar un `<video>` fără controale n-ar oferi
            niciuna — nici ca să pornească, nici ca să se oprească din buclă. */}
        {miscareRedusa && (
          <button
            type="button"
            className="e3-reel-play"
            onClick={() => {
              const el = videoRef.current;
              if (!el) return;
              if (ruleaza) el.pause?.();
              else porneste(el);
            }}
            aria-label={
              ruleaza ? `Oprește clipul: ${reel.caption}` : `Redă clipul: ${reel.caption}`
            }
          >
            <span aria-hidden="true">{ruleaza ? '❚❚' : '▶'}</span>
          </button>
        )}
      </div>

      {/* Legenda SUB card, nu peste imagine: peste o fotografie necontrolată
          nu se poate garanta contrastul. */}
      <figcaption className="e3-reel-caption">
        <span>{reel.caption}</span>
        <a
          className="e3-link e3-reel-out"
          href={reel.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          <span aria-hidden="true">↗</span> Deschide pe Instagram
        </a>
      </figcaption>
    </figure>
  );
};

/**
 * Banda cu clipurile de antrenament.
 *
 * O componentă, două pagini: primește lista și textele ca props și nu știe de
 * unde vin. Pe landing textele vin din documentul de configurare, pe
 * „Despre noi" sunt constante ale paginii — dar clipurile sunt aceeași listă,
 * din `public_training_reels()`.
 *
 * Clipurile sunt fișiere proprii, servite de pe aceeași origine. Pagina nu cere
 * NIMIC de la `instagram.com` la încărcare: nici script, nici imagine, nici
 * cookie. Singurul lucru care duce acolo e linkul de sub fiecare card.
 *
 * Nimic nu se descarcă înainte ca un card să se apropie de ecran: `preload="none"`
 * pe clip, `loading="lazy"` pe poster, iar redarea pornește dintr-un
 * `IntersectionObserver`, nu din atributul `autoplay` — care ar porni și
 * cardurile aflate în afara ecranului.
 */
export const ReelsRail = ({ reels, num, headline, body }: Props) => {
  // Citit o dată, la montare: o schimbare de preferință în timpul vizitei e un
  // caz pe care nu-l servim, iar un listener ar porni clipuri sub degetul
  // cuiva care tocmai a cerut mai puțină mișcare.
  const [miscareRedusa] = useState(preferaMiscareRedusa);

  // Apelantul filtrează deja lista goală (altfel numerotarea ar sări peste un
  // număr), dar componenta nu se bazează pe asta.
  if (reels.length === 0) return null;

  return (
    <section className="e3-reels">
      {/* Cuvântul-fantomă. Decorativ integral, deci ascuns de cititoarele de
          ecran: handle-ul e deja anunțat de linkul din coloana de text. */}
      <span className="e3-reels-ghost" aria-hidden="true">
        {INSTAGRAM_HANDLE}
      </span>

      <div className="e3-reels-inner">
        {/* `data-reveal` pe ȘINĂ, nu pe fiecare card. `useScrollReveal` pune
            `opacity: 0` pe fiecare element observat și îl readuce doar când
            IntersectionObserver îl vede — iar cardurile tăiate orizontal de
            `overflow-x` nu intersectează viewport-ul. Cu reveal pe card, al
            patrulea și următoarele ar rămâne invizibile exact când vizitatorul
            derulează șina ca să le vadă. */}
        <div className="e3-reels-rail" data-reveal>
          {reels.map((reel, i) => (
            <ReelCard key={reel.video} reel={reel} index={i} miscareRedusa={miscareRedusa} />
          ))}
        </div>

        <div className="e3-reels-text">
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 20, marginBottom: 24 }}>
            <span className="e3-title-num" style={sectionNum}>
              {num}
            </span>
            <h2 className="e3-title" style={sectionTitle}>
              {headline}
            </h2>
          </div>
          {body && <p className="e3-reels-body">{body}</p>}
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
