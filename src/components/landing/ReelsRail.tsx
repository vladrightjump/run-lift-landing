import { useCallback, useEffect, useRef, useState } from 'react';
import '../../edition3.css';
import { INSTAGRAM_HANDLE, INSTAGRAM_URL } from '../../lib/config';
import type { Reel } from '../../lib/supabase';
import { sursaIncorporare } from '../../lib/youtube';
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

/** „Niciun card nu redă". Starea de pornire și cea de după ieșirea de pe ecran. */
const NICIUNUL = -1;

type CardProps = {
  reel: Reel;
  index: number;
  /** Cardul ăsta e cel care redă? */
  redă: boolean;
  miscareRedusa: boolean;
  comuta: () => void;
};

const ReelCard = ({ reel, index, redă, miscareRedusa, comuta }: CardProps) => (
  <figure className="e3-reels-item">
    <div className="e3-card e3-reel">
      {/* Marcajul desenat stă DEDESUBT, permanent: gazda nu oferă un poster
          vertical utilizabil (miniatura e 16:9, deci ar veni cu bare sau
          tăiată), iar un card care nu redă n-are voie să fie o casetă goală. */}
      <span className="e3-reel-fallback" aria-hidden="true">
        {String(index + 1).padStart(2, '0')}
      </span>

      {/* Montat DOAR cât timp cardul redă. Demontarea e ce ține numărul de
          playere la unu: un player ascuns ar continua să coste. */}
      {redă && (
        <iframe
          className="e3-reel-player"
          src={sursaIncorporare(reel.youtube)}
          title={reel.caption}
          allow="autoplay; encrypted-media; picture-in-picture"
          /* Ce NU e în listă contează mai mult decât ce e: fără
             `allow-top-navigation`, playerul nu poate duce vizitatorul de pe
             pagina noastră, iar fără `allow-forms` și `allow-downloads` n-are
             ce trimite sau coborî.

             Regula de lint cere să scoatem `allow-scripts` sau
             `allow-same-origin`, fiindcă împreună lasă un cadru să-și șteargă
             singur sandbox-ul. Aia e adevărat pentru un cadru de pe ACEEAȘI
             origine; ăsta e pe `youtube-nocookie.com`, deci `allow-same-origin`
             îi dă originea LUI, nu pe a noastră. Fără el gazda nu-și poate citi
             storage-ul și playerul refuză să pornească; fără `allow-scripts`
             n-are player deloc. */
          // eslint-disable-next-line react/iframe-missing-sandbox
          sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox"
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
        />
      )}

      {/* La mișcare redusă, singura cale de pornire ȘI de oprire. Fără el, un
          clip pornit manual ar rula în buclă fără nicio cale de a-l opri —
          exact pentru cineva care tocmai a cerut mai puțină mișcare. */}
      {miscareRedusa && (
        <button
          type="button"
          className="e3-reel-play"
          onClick={comuta}
          aria-label={redă ? `Oprește clipul: ${reel.caption}` : `Redă clipul: ${reel.caption}`}
        >
          <span aria-hidden="true">{redă ? '❚❚' : '▶'}</span>
        </button>
      )}
    </div>

    {/* Legenda SUB card, nu peste imagine: peste o filmare necontrolată nu se
        poate garanta contrastul. */}
    <figcaption className="e3-reel-caption">
      <span>{reel.caption}</span>
      <a className="e3-link e3-reel-out" href={reel.url} target="_blank" rel="noopener noreferrer">
        <span aria-hidden="true">↗</span> Deschide pe Instagram
      </a>
    </figcaption>
  </figure>
);

/**
 * Caruselul cu clipurile de antrenament.
 *
 * O componentă, două pagini: primește lista și textele ca props și nu știe de
 * unde vin. Pe landing textele vin din documentul de configurare, pe
 * „Despre noi" sunt constante ale paginii — dar clipurile sunt aceeași listă,
 * din `public_training_reels()`.
 *
 * Redă UN SINGUR card, cel din centrul șinei. Motivul e măsurat, nu estetic:
 * un player YouTube costă în jurul unui megaoctet, iar patru carduri care redau
 * simultan coboară pagina la ~37 fps. Cardurile care nu redau n-au niciun
 * `iframe` în DOM — sunt demontate, nu ascunse.
 *
 * Nimic nu pleacă spre gazdă înainte ca șina să se apropie de ecran: playerul
 * se montează din `IntersectionObserver`, nu la randare.
 */
export const ReelsRail = ({ reels, num, headline, body }: Props) => {
  // Citit o dată, la montare: o schimbare de preferință în timpul vizitei e un
  // caz pe care nu-l servim, iar un listener ar porni un clip sub degetul
  // cuiva care tocmai a cerut mai puțină mișcare.
  const [miscareRedusa] = useState(preferaMiscareRedusa);
  const [activ, setActiv] = useState(NICIUNUL);
  const sinaRef = useRef<HTMLDivElement>(null);

  /** Cardul al cărui centru e cel mai aproape de centrul șinei. */
  const alegeCentrul = useCallback(() => {
    const sina = sinaRef.current;
    if (!sina) return;
    const r = sina.getBoundingClientRect();
    const mijloc = r.left + r.width / 2;
    const carduri = Array.from(sina.children);
    let celMaiBun = 0;
    let distanta = Infinity;
    carduri.forEach((card, i) => {
      const b = card.getBoundingClientRect();
      const d = Math.abs(b.left + b.width / 2 - mijloc);
      if (d < distanta) {
        distanta = d;
        celMaiBun = i;
      }
    });
    setActiv(celMaiBun);
  }, []);

  useEffect(() => {
    // La mișcare redusă nu se montează niciun observator: nimic nu pornește
    // singur, iar butonul de pe card e singura cale.
    if (miscareRedusa) return;
    // Fără clipuri componenta întoarce `null`, deci n-are șină de observat.
    // Condiția e scrisă pe `reels.length`, nu pe `sinaRef`, tocmai ca lista să
    // fie o dependență adevărată a efectului — vezi nota de la dependențe.
    if (reels.length === 0) return;
    const sina = sinaRef.current;
    if (!sina || typeof IntersectionObserver === 'undefined') return;

    const observator = new IntersectionObserver(
      (intrari) => {
        for (const intrare of intrari) {
          if (intrare.isIntersecting) alegeCentrul();
          // Șina a plecat de pe ecran: se demontează tot, altfel un player ar
          // continua să ruleze și să coste în spatele vizitatorului.
          else setActiv(NICIUNUL);
        }
      },
      // Un sfert din șină vizibil înseamnă „se vede", nu „a atins marginea".
      { threshold: 0.25 }
    );
    observator.observe(sina);

    // Derularea laterală e cealaltă cale prin care se schimbă centrul. Se
    // așteaptă să se oprească: un card pe care șina doar a trecut n-are de ce
    // să-și monteze playerul.
    let asteapta: ReturnType<typeof setTimeout>;
    const laDerulare = () => {
      clearTimeout(asteapta);
      asteapta = setTimeout(alegeCentrul, 140);
    };
    sina.addEventListener('scroll', laDerulare, { passive: true });

    return () => {
      observator.disconnect();
      clearTimeout(asteapta);
      sina.removeEventListener('scroll', laDerulare);
    };
    // `reels.length` E o dependență: cu lista goală componenta întoarce `null`,
    // deci efectul iese fără să observe nimic. Clipurile sosesc după prima
    // randare (RPC), iar fără reluarea asta observatorul nu s-ar mai atașa
    // niciodată — carduri cu numărul desenat și niciun player, la nesfârșit.
    // Pe landing nu se vedea: acolo apelantul montează banda abia când are
    // clipuri, deci primul efect prindea deja șina.
  }, [miscareRedusa, alegeCentrul, reels.length]);

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
        <div className="e3-reels-rail" data-reveal ref={sinaRef}>
          {reels.map((reel, i) => (
            <ReelCard
              key={reel.youtube}
              reel={reel}
              index={i}
              redă={activ === i}
              miscareRedusa={miscareRedusa}
              comuta={() => setActiv((curent) => (curent === i ? NICIUNUL : i))}
            />
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
