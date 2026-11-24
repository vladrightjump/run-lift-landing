import { useEffect, useRef, useState } from 'react';
import { useEditionStrings } from '../../../shared/lib/useEventConfig';
import controls from '../../../shared/ui/PublicControls.module.css';
import layout from '../../../shared/ui/PublicLayout.module.css';
import motion from '../../../shared/ui/PublicMotion.module.css';
import landing from './LandingStyles.module.css';
import styles from './Hero.module.css';
import { GiveawayLink } from './GiveawayLink';

type Props = {
  trialHref: string;
  /** Deschide formularul ca overlay. Fără el, CTA-ul navighează la /inscriere. */
  onInscrie?: () => void;
  showCta?: boolean;
  showGiveaway?: boolean;
};

const POSTER = '/landing/hero.webp';

export const Hero = ({ onInscrie, showCta = true, trialHref, showGiveaway = false }: Props) => {
  const { HERO_KICKER } = useEditionStrings();

  return (
    <section className={styles.hero} data-css="e3-hero">
      <div className={`${layout['e3-wrap']} ${styles.composition}`} data-css="e3-hero-copy e3-wrap">
        <div className={styles.headline} data-enter>
          <p className={styles.kicker} data-css="e3-hero-kicker">{HERO_KICKER}</p>
          <h1 className={styles.title} data-css="e3-hero-title">
            <span className={motion['e3-word']} data-css="e3-word">Hyrox</span>
            <span className={motion['e3-word']} data-css="e3-word e3-hero-accent">Trial.</span>
          </h1>
        </div>

        <HeroMedia />

        <div className={styles.details} data-css="e3-hero-foot">
          <p className={layout['e3-lead']} data-css="e3-lead e3-hero-lead">
            Cursă în stil HYROX în aer liber: alergare combinată cu stații funcționale, contra
            cronometru, în ritmul tău. Stațiile și greutățile se adaptează nivelului tău.
          </p>
          <div className={styles.actions} data-css="trial-hero-actions">
            {showCta && (
              <a
                href="/inscriere"
                onClick={(event) => {
                  if (onInscrie) {
                    event.preventDefault();
                    onInscrie();
                  }
                }}
                className={`${landing['e3-btn']} ${controls['e3-shine']} ${controls['e3-mag']} ${styles.cta}`}
                data-css="e3-btn e3-cta-lg e3-shine e3-mag e3-hero-cta"
              >
                Înscrie-te la eveniment
                <span aria-hidden="true">↗</span>
              </a>
            )}
            <a className={styles.trialLink} data-css="trial-hero-link" href={trialHref}>
              Vin prima dată
            </a>
            {showGiveaway && <GiveawayLink />}
          </div>
        </div>
      </div>
    </section>
  );
};

const HeroMedia = () => {
  const frameRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const pausedByVisitor = useRef(false);
  const [motionAllowed, setMotionAllowed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [started, setStarted] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => {
      setMotionAllowed(!preference.matches);
      if (preference.matches) {
        if (videoRef.current?.paused === false) videoRef.current.pause();
        setPlaying(false);
        setStarted(false);
      }
    };
    update();
    preference.addEventListener('change', update);
    return () => preference.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    const frame = frameRef.current;
    if (!motionAllowed || failed || !video || !frame || !('IntersectionObserver' in window)) return;

    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) {
        if (!video.paused) video.pause();
      } else if (!pausedByVisitor.current) {
        void video.play().catch(() => {});
      }
    });
    observer.observe(frame);

    return () => {
      observer.disconnect();
      if (!video.paused) video.pause();
    };
  }, [motionAllowed, failed]);

  const togglePlayback = () => {
    const video = videoRef.current;
    if (!video) return;

    pausedByVisitor.current = !video.paused;
    if (pausedByVisitor.current) {
      video.pause();
    } else {
      void video.play().catch(() => {});
    }
  };

  return (
    <div className={styles.media} ref={frameRef} data-enter>
      <div className={styles.viewport}>
        <div className={styles.footage} data-css="hero-footage">
          <img
            className={styles.poster}
            src={POSTER}
            alt=""
            width={1280}
            height={720}
            fetchPriority="high"
            data-css="hero-poster"
          />
          {motionAllowed && !failed && (
            <video
              ref={videoRef}
              className={styles.video}
              data-css="e3-hero-video"
              data-started={started}
              src="/landing/hero.mp4"
              poster={POSTER}
              preload="none"
              loop
              muted
              playsInline
              aria-hidden="true"
              onPlaying={() => {
                setPlaying(true);
                setStarted(true);
              }}
              onPause={() => setPlaying(false)}
              onError={() => setFailed(true)}
            />
          )}
        </div>
      </div>
      {motionAllowed && !failed && (
        <button
          type="button"
          className={styles.playback}
          data-playing={playing}
          onClick={togglePlayback}
          aria-label={playing ? 'Pauză videoclip' : 'Redă videoclipul'}
        >
          <span aria-hidden="true" className={styles.playbackIcon} />
          {playing ? 'Pauză' : 'Redă'}
        </button>
      )}
    </div>
  );
};
