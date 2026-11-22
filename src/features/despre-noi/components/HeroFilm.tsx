import { useEffect, useRef, useState } from 'react';
import { PauseIcon } from '@phosphor-icons/react/Pause';
import { PlayIcon } from '@phosphor-icons/react/Play';
import { HERO_POSTER, heroVideoSrc } from '../../../shared/lib/media';
import layout from '../../../shared/ui/PublicLayout.module.css';
import styles from './HeroFilm.module.css';

export function HeroFilm() {
  const video = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(preference.matches);
    preference.addEventListener('change', update);
    return () => preference.removeEventListener('change', update);
  }, []);
  return (
    <>
      <img className={styles.poster} src={HERO_POSTER} alt="" />
      {!reduced && !failed && (
        <>
          <video ref={video} className={styles.film + ' ' + layout['e3-hero-video']} data-css="dn-hero-video e3-hero-video"
            autoPlay muted loop playsInline preload="metadata" poster={HERO_POSTER} aria-hidden="true"
            onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onError={() => setFailed(true)}
            src={heroVideoSrc()} />
          <button type="button" className={styles.control}
            aria-label={playing ? 'Pune filmarea pe pauză' : 'Pornește filmarea'}
            onClick={() => {
              const player = video.current;
              if (!player) return;
              if (!player.paused) player.pause();
              else void player.play().catch(() => setPlaying(false));
            }}>
            {playing ? <PauseIcon size={18} weight="fill" aria-hidden="true" /> : <PlayIcon size={18} weight="fill" aria-hidden="true" />}
          </button>
        </>
      )}
    </>
  );
}
