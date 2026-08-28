import type { CSSProperties } from 'react';
import { useEditionStrings } from '../../hooks/useEventConfig';
import { HERO_POSTER, heroVideoSrc } from '../../lib/media';

type Props = {
  /** Deschide formularul ca overlay. Fără el, CTA-ul navighează la /inscriere. */
  onInscrie?: () => void;
  /** `false` ascunde CTA-ul „Rezervă-ți locul" (fereastra din ziua cursei). */
  showCta?: boolean;
};

/** Hero: kicker + titlul „Hyrox / Trial." + rezumat + CTA. */
export const Hero = ({ onInscrie, showCta = true }: Props) => {
  const { HERO_KICKER } = useEditionStrings();

  return (
      <section
        style={{
          padding: 'clamp(48px, 9vw, 88px) clamp(20px, 5vw, 40px) clamp(48px, 7vw, 72px)',
          borderBottom: '1px solid var(--e3-border)',
          position: 'relative',
          // `clip`, nu `hidden`: taie la fel clipul video, dar NU creează un
          // container de scroll. Cu `hidden`, `view(block)` din `.e3-hero-copy`
          // se lega de secțiune — un scroller fără overflow — și parallaxul nu
          // pornea niciodată.
          overflow: 'clip',
          background: 'var(--e3-bg)',
        }}
      >
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
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            zIndex: 0,
            pointerEvents: 'none',
          }}
        >
          <source src={heroVideoSrc()} type="video/mp4" />
        </video>
        {/* Overlay întunecat (mai dens spre stânga, unde e textul) pentru lizibilitate. */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 1,
            background:
              'linear-gradient(90deg, rgba(18,20,16,0.94) 0%, rgba(18,20,16,0.8) 42%, rgba(18,20,16,0.5) 100%)',
          }}
        />
        <div className="e3-hero-copy" style={{ maxWidth: 1200, margin: '0 auto', position: 'relative', zIndex: 2 }}>
          <p
            style={{
              margin: '0 0 24px',
              fontSize: 15,
              fontWeight: 600,
              letterSpacing: 2.5,
              textTransform: 'uppercase',
              color: 'var(--e3-muted)',
              animation: 'e3-fade-up 0.6s ease-out both',
            }}
          >
            {HERO_KICKER}
          </p>
          <h1
            style={{
              margin: 0,
              fontFamily: 'Anton, sans-serif',
              fontWeight: 400,
              fontSize: 'clamp(60px, 13vw, 136px)',
              lineHeight: 0.95,
              letterSpacing: 0.5,
              textTransform: 'uppercase',
              textWrap: 'balance',
            }}
          >
            {/* Cuvintele cresc din linia de bază prin mască (`.e3-word`), nu se
                estompează — același gest cu titlurile de secțiune, care intră
                la fel pe scroll. `--d` e decalajul dintre ele. */}
            <span className="e3-word" style={{ '--d': '0.12s' } as CSSProperties}>Hyrox</span>
            <br />
            <span
              className="e3-word"
              style={{ color: 'var(--e3-accent)', '--d': '0.28s' } as CSSProperties}
            >
              Trial.
            </span>
          </h1>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'flex-end',
              justifyContent: 'space-between',
              gap: 32,
              marginTop: 40,
            }}
          >
            <p
              style={{
                margin: 0,
                maxWidth: 480,
                fontSize: 18,
                lineHeight: 1.55,
                color: 'var(--e3-muted-strong)',
                textWrap: 'pretty',
                animation: 'e3-fade-up 0.6s ease-out 0.55s both',
              }}
            >
              Cursă în stil HYROX în aer liber: alergare combinată cu stații funcționale — contra
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
                className="e3-cta-lg e3-shine e3-mag"
                style={{
                  display: 'inline-block',
                  background: 'var(--e3-accent)',
                  color: 'var(--e3-bg)',
                  fontFamily: 'Anton, sans-serif',
                  fontSize: 20,
                  letterSpacing: 1.5,
                  textTransform: 'uppercase',
                  padding: '18px 36px',
                  textDecoration: 'none',
                }}
              >
                Rezervă-ți locul
              </a>
            )}
          </div>
        </div>
      </section>
  );
};
