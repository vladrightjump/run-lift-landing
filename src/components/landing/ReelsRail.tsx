import { useCallback, useEffect, useRef, useState } from 'react';
import '../../edition3.css';
import { INSTAGRAM_HANDLE, INSTAGRAM_URL } from '../../lib/config';
import type { Reel } from '../../lib/supabase';
import { posterClip, posterClipRezerva, sursaIncorporare } from '../../lib/youtube';
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

const doiDigiti = (n: number): string => String(n).padStart(2, '0');

/**
 * Posterul cardului. Încearcă întâi miniatura verticală, apoi rezerva 4:3; dacă
 * pică amândouă, dispare și rămâne marcajul desenat de dedesubt.
 */
const Poster = ({ id }: { id: string }) => {
  const [pas, setPas] = useState<0 | 1 | 2>(0);
  if (pas === 2) return null;
  return (
    <img
      className="e3-reel-poster"
      src={pas === 0 ? posterClip(id) : posterClipRezerva(id)}
      // Decorativ: legenda de sub card spune deja ce e clipul.
      alt=""
      // Leneș: posterele pleacă spre gazdă abia când banda se apropie de ecran,
      // aceeași graniță pe care o ține și playerul.
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setPas((p) => (p === 0 ? 1 : 2))}
    />
  );
};

type CardProps = {
  reel: Reel;
  index: number;
  /** Cardul ăsta e cel care redă? */
  redă: boolean;
  /** Cardul ăsta e cel din centrul șinei? Dă doar accentul vizual. */
  centrat: boolean;
  miscareRedusa: boolean;
  alege: () => void;
};

const ReelCard = ({ reel, index, redă, centrat, miscareRedusa, alege }: CardProps) => (
  <figure className="e3-reels-item" data-centrat={centrat || undefined}>
    <div className="e3-card e3-reel">
      {/* Marcajul desenat stă cel mai jos: se vede doar dacă posterul nu vine. */}
      <span className="e3-reel-fallback" aria-hidden="true">
        {doiDigiti(index + 1)}
      </span>

      <Poster id={reel.youtube} />

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
          // Playerul intră transparent și apare abia încărcat: până atunci se
          // vede posterul de dedesubt, nu o casetă neagră. Atribut pus direct
          // pe nod — React nu-l gestionează, deci nu-l calcă la o re-randare.
          onLoad={(e) => e.currentTarget.setAttribute('data-gata', '')}
        />
      )}

      {/* Un card care nu redă e în întregime un buton: apăsat, vine în centru
          și pornește. Peste un player nu se pune nimic — acolo controalele sunt
          ale gazdei. */}
      {!redă && (
        <button
          type="button"
          className="e3-reel-select"
          onClick={alege}
          aria-label={`Redă clipul: ${reel.caption}`}
        >
          <span className="e3-reel-play" aria-hidden="true">
            ▶
          </span>
        </button>
      )}

      {/* La mișcare redusă nimic nu pornește singur, deci un clip pornit manual
          trebuie să aibă și o cale de oprire — altfel ar rula în buclă exact
          pentru cineva care a cerut mai puțină mișcare. */}
      {redă && miscareRedusa && (
        <button
          type="button"
          className="e3-reel-play e3-reel-stop"
          onClick={alege}
          aria-label={`Oprește clipul: ${reel.caption}`}
        >
          <span aria-hidden="true">❚❚</span>
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
 * simultan coboară pagina la ~37 fps. Celelalte arată posterul clipului și sunt
 * butoane: apăsat, un card vine în centru și îi ia locul celui care reda.
 *
 * Nimic nu redă înainte ca șina să se apropie de ecran: playerul se montează
 * din `IntersectionObserver`, nu la randare.
 */
export const ReelsRail = ({ reels, num, headline, body }: Props) => {
  // Citit o dată, la montare: o schimbare de preferință în timpul vizitei e un
  // caz pe care nu-l servim, iar un listener ar porni un clip sub degetul
  // cuiva care tocmai a cerut mai puțină mișcare.
  const [miscareRedusa] = useState(preferaMiscareRedusa);
  /** Cardul care redă. */
  const [activ, setActiv] = useState(NICIUNUL);
  /** Cardul din centrul șinei — contorul și accentul vizual. */
  const [centru, setCentru] = useState(0);
  const sinaRef = useRef<HTMLDivElement>(null);
  /** Șina e pe ecran? Doar atunci poate porni ceva singur. */
  const vizibilRef = useRef(false);
  /** Poziția de pornire s-a aplicat deja? O singură dată, la sosirea clipurilor. */
  const pornitRef = useRef(false);

  /** Indicele cardului al cărui centru e cel mai aproape de centrul șinei. */
  const indiceCentru = useCallback((): number => {
    const sina = sinaRef.current;
    if (!sina) return 0;
    const r = sina.getBoundingClientRect();
    const mijloc = r.left + r.width / 2;
    let celMaiBun = 0;
    let distanta = Infinity;
    Array.from(sina.children).forEach((card, i) => {
      const b = card.getBoundingClientRect();
      const d = Math.abs(b.left + b.width / 2 - mijloc);
      if (d < distanta) {
        distanta = d;
        celMaiBun = i;
      }
    });
    return celMaiBun;
  }, []);

  /** Derulează șina până când cardul `i` stă în centru. */
  const aduInCentru = useCallback(
    (i: number, instant = false) => {
      const sina = sinaRef.current;
      const card = sina?.children[i] as HTMLElement | undefined;
      if (!sina || !card) return;
      // jsdom n-are `scrollTo` pe elemente; în browser există peste tot.
      sina.scrollTo?.({
        left: card.offsetLeft - (sina.clientWidth - card.offsetWidth) / 2,
        behavior: instant || miscareRedusa ? 'auto' : 'smooth',
      });
    },
    [miscareRedusa]
  );

  /**
   * Mută caruselul pe cardul `i`: săgeți, segmente, apăsarea unui card. Fără
   * mișcare redusă, cardul ales și pornește; cu ea, doar vine în centru.
   */
  const mergiLa = useCallback(
    (i: number) => {
      const tinta = Math.max(0, Math.min(reels.length - 1, i));
      setCentru(tinta);
      if (!miscareRedusa) setActiv(tinta);
      aduInCentru(tinta);
    },
    [reels.length, miscareRedusa, aduInCentru]
  );

  useEffect(() => {
    // Fără clipuri componenta întoarce `null`, deci n-are șină de observat.
    // Condiția e scrisă pe `reels.length`, nu pe `sinaRef`, tocmai ca lista să
    // fie o dependență adevărată a efectului — vezi nota de la dependențe.
    if (reels.length === 0) return;
    const sina = sinaRef.current;
    if (!sina) return;

    // Caruselul pornește pe clipul din mijlocul listei, nu pe primul: cu trei
    // clipuri se văd toate trei, cu centrul accentuat. Pe primul, jumătatea
    // din stânga a șinei ar fi goală la prima vedere.
    if (!pornitRef.current) {
      pornitRef.current = true;
      const mijloc = Math.floor((reels.length - 1) / 2);
      setCentru(mijloc);
      aduInCentru(mijloc, true);
    }

    const actualizeaza = () => {
      const i = indiceCentru();
      setCentru(i);
      // Derularea mută playerul doar când pornirea e automată. La mișcare
      // redusă, un clip pornit de mână rămâne pornit până îl oprește omul.
      if (!miscareRedusa && vizibilRef.current) setActiv(i);
    };

    let observator: IntersectionObserver | undefined;
    // La mișcare redusă nu se montează niciun observator: nimic nu pornește
    // singur, iar butonul de pe card e singura cale.
    if (!miscareRedusa && typeof IntersectionObserver !== 'undefined') {
      observator = new IntersectionObserver(
        (intrari) => {
          for (const intrare of intrari) {
            vizibilRef.current = intrare.isIntersecting;
            if (intrare.isIntersecting) actualizeaza();
            // Șina a plecat de pe ecran: se demontează tot, altfel un player ar
            // continua să ruleze și să coste în spatele vizitatorului.
            else setActiv(NICIUNUL);
          }
        },
        // Un sfert din șină vizibil înseamnă „se vede", nu „a atins marginea".
        { threshold: 0.25 }
      );
      observator.observe(sina);
    }

    // Derularea laterală e cealaltă cale prin care se schimbă centrul. Se
    // așteaptă să se oprească: un card pe care șina doar a trecut n-are de ce
    // să-și monteze playerul.
    let asteapta: ReturnType<typeof setTimeout>;
    const laDerulare = () => {
      clearTimeout(asteapta);
      asteapta = setTimeout(actualizeaza, 140);
    };
    sina.addEventListener('scroll', laDerulare, { passive: true });

    return () => {
      observator?.disconnect();
      clearTimeout(asteapta);
      sina.removeEventListener('scroll', laDerulare);
    };
    // `reels.length` E o dependență: cu lista goală componenta întoarce `null`,
    // deci efectul iese fără să observe nimic. Clipurile sosesc după prima
    // randare (RPC), iar fără reluarea asta observatorul nu s-ar mai atașa
    // niciodată — carduri cu numărul desenat și niciun player, la nesfârșit.
    // Pe landing nu se vedea: acolo apelantul montează banda abia când are
    // clipuri, deci primul efect prindea deja șina.
  }, [miscareRedusa, indiceCentru, aduInCentru, reels.length]);

  // Apelantul filtrează deja lista goală (altfel numerotarea ar sări peste un
  // număr), dar componenta nu se bazează pe asta.
  if (reels.length === 0) return null;

  const total = reels.length;

  return (
    <section className="e3-reels">
      {/* Cuvântul-fantomă. Decorativ integral, deci ascuns de cititoarele de
          ecran: handle-ul e deja anunțat de linkul din coloana de text. */}
      <span className="e3-reels-ghost" aria-hidden="true">
        {INSTAGRAM_HANDLE}
      </span>

      <div className="e3-reels-inner">
        <div className="e3-reels-media">
          {/* `data-reveal` pe ȘINĂ, nu pe fiecare card. `useScrollReveal` pune
              `opacity: 0` pe fiecare element observat și îl readuce doar când
              IntersectionObserver îl vede — iar cardurile tăiate orizontal de
              `overflow-x` nu intersectează viewport-ul. Cu reveal pe card,
              cele de la capete ar rămâne invizibile exact când vizitatorul
              derulează șina ca să le vadă. */}
          <div
            className="e3-reels-rail"
            data-reveal
            ref={sinaRef}
            role="region"
            aria-roledescription="carusel"
            aria-label={headline}
          >
            {reels.map((reel, i) => (
              <ReelCard
                key={reel.youtube}
                reel={reel}
                index={i}
                redă={activ === i}
                centrat={centru === i}
                miscareRedusa={miscareRedusa}
                alege={() => {
                  if (miscareRedusa) {
                    // Aici apăsarea e și pornire, și oprire.
                    setActiv((curent) => (curent === i ? NICIUNUL : i));
                    setCentru(i);
                    aduInCentru(i);
                  } else {
                    mergiLa(i);
                  }
                }}
              />
            ))}
          </div>

          {/* Navigarea. Un singur clip n-are unde naviga. Contor și segmente,
              nu buline: numărul spune și „unde sunt", și „câte mai sunt". */}
          {total > 1 && (
            <div className="e3-reels-nav">
              <button
                type="button"
                className="e3-reels-arrow"
                onClick={() => mergiLa(centru - 1)}
                disabled={centru === 0}
                aria-label="Clipul anterior"
              >
                <span aria-hidden="true">←</span>
              </button>
              <button
                type="button"
                className="e3-reels-arrow"
                onClick={() => mergiLa(centru + 1)}
                disabled={centru === total - 1}
                aria-label="Clipul următor"
              >
                <span aria-hidden="true">→</span>
              </button>

              <p className="e3-reels-count" aria-live="polite">
                <span className="e3-reels-count-now">{doiDigiti(centru + 1)}</span>
                <span className="e3-reels-count-sep" aria-hidden="true">
                  /
                </span>
                <span className="e3-reels-count-total">{doiDigiti(total)}</span>
                <span className="e3-sr">
                  {' '}
                  — {reels[centru]?.caption}
                </span>
              </p>

              <div className="e3-reels-segments">
                {reels.map((reel, i) => (
                  <button
                    key={reel.youtube}
                    type="button"
                    className="e3-reels-segment"
                    onClick={() => mergiLa(i)}
                    aria-label={`Clipul ${i + 1}: ${reel.caption}`}
                    aria-current={centru === i || undefined}
                  />
                ))}
              </div>
            </div>
          )}
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
