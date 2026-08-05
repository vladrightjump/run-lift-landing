import { HERO_KICKER } from '../../content/format';

/** Hero: kicker + titlul „Hyrox / Trial." + rezumat + CTA. */
export const Hero = () => {
  return (
      <section
        style={{
          padding: 'clamp(48px, 9vw, 88px) clamp(20px, 5vw, 40px) clamp(48px, 7vw, 72px)',
          borderBottom: '1px solid var(--e3-border)',
          position: 'relative',
          overflow: 'hidden',
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
          <source src="/fpv.mp4" type="video/mp4" />
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
        <div style={{ maxWidth: 1200, margin: '0 auto', position: 'relative', zIndex: 2 }}>
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
            <span style={{ display: 'inline-block', animation: 'e3-fade-up 0.6s ease-out 0.1s both' }}>Hyrox</span>
            <br />
            <span style={{ display: 'inline-block', color: 'var(--e3-accent)', animation: 'e3-fade-up 0.6s ease-out 0.4s both' }}>Trial.</span>
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
            <a
              href="#inscriere"
              className="e3-cta-lg"
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
          </div>
        </div>
      </section>
  );
};
