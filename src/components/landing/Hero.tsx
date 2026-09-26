import type { CSSProperties } from 'react';
import { useEditionStrings } from '../../hooks/useEventConfig';
import { HERO_POSTER, heroVideoSrc } from '../../lib/media';

type Props = {
  /** Deschide formularul ca overlay. Fără el, CTA-ul navighează la /inscriere. */
  onInscrie?: () => void;
  /** `false` ascunde CTA-ul „Rezervă-ți locul" (fereastra din ziua cursei). */
  showCta?: boolean;
};

/**
 * Hero-ul ca afiș: kicker-ul pe o linie, titlul „Hyrox / Trial." pe toată
 * lățimea, apoi o bază despărțită de o linie, cu rezumatul și CTA-ul.
 * Aspectul stă în `.e3-hero*` (public.css); aici rămâne doar structura.
 */
export const Hero = ({ onInscrie, showCta = true }: Props) => {
  const { HERO_KICKER } = useEditionStrings();

  return (
    <section className="e3-hero">
      {/* Fundal video FPV — mut, în buclă, autoplay (inclusiv iOS via playsInline). */}
      <video
        className="e3-hero-video"
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        poster={HERO_POSTER}
        aria-hidden="true"
      >
        <source src={heroVideoSrc()} type="video/mp4" />
      </video>
      <div className="e3-hero-shade" aria-hidden="true" />
      <div className="e3-hero-copy e3-wrap">
        <p className="e3-hero-kicker">{HERO_KICKER}</p>
        <h1 className="e3-hero-title">
          {/* Cuvintele cresc din linia de bază prin mască (`.e3-word`), nu se
              estompează: titlul e vizibil ca formă din primul cadru, deci nu
              întârzie prima afișare. `--d` e decalajul dintre ele. */}
          <span className="e3-word" style={{ '--d': '0.04s' } as CSSProperties}>
            Hyrox
          </span>
          <span className="e3-word e3-hero-accent" style={{ '--d': '0.12s' } as CSSProperties}>
            Trial.
          </span>
        </h1>
        <div className="e3-hero-foot">
          <p className="e3-lead e3-hero-lead">
            Cursă în stil HYROX în aer liber: alergare combinată cu stații funcționale, contra
            cronometru, în ritmul tău. Stațiile și greutățile se adaptează nivelului tău.
          </p>
          {showCta && (
            <a
              href="/inscriere"
              onClick={(e) => {
                if (onInscrie) {
                  e.preventDefault();
                  onInscrie();
                }
              }}
              className="e3-btn e3-cta-lg e3-shine e3-mag e3-hero-cta"
            >
              Rezervă-ți locul
            </a>
          )}
        </div>
      </div>
    </section>
  );
};
