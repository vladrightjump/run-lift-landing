import shared5 from '../../../shared/ui/PublicControls.module.css';
import shared4 from './LandingStyles.module.css';
import shared3 from '../../../shared/ui/PublicMotion.module.css';
import shared2 from '../../../shared/ui/PublicLayout.module.css';
import styles from './Hero.module.css';
import { useEditionStrings } from '../../../shared/lib/useEventConfig';
import { HERO_POSTER, heroVideoSrc } from '../../../shared/lib/media';

type Props = {
  trialHref?: string | null;
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
export const Hero = ({ onInscrie, showCta = true, trialHref }: Props) => {
  const { HERO_KICKER } = useEditionStrings();

  return (
    <section className={styles['e3-hero']} data-css={"e3-hero"}>
      {/* Fundal video FPV — mut, în buclă, autoplay (inclusiv iOS via playsInline). */}
      <video
        className={shared2['e3-hero-video']} data-css={"e3-hero-video"}
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
      <div className={styles['e3-hero-shade']} data-css={"e3-hero-shade"} aria-hidden="true" />
      <div className={shared2['e3-hero-copy'] + ' ' + shared2['e3-wrap']} data-css={"e3-hero-copy e3-wrap"}>
        <p className={styles['e3-hero-kicker']} data-css={"e3-hero-kicker"}>{HERO_KICKER}</p>
        <h1 className={styles['e3-hero-title']} data-css={"e3-hero-title"}>
          {/* Cuvintele cresc din linia de bază prin mască (`.e3-word`), nu se
              estompează: titlul e vizibil ca formă din primul cadru, deci nu
              întârzie prima afișare. `--d` e decalajul dintre ele. */}
          <span className={shared3['e3-word'] + ' ' + styles.text1} data-css={"e3-word"} >
            Hyrox
          </span>
          <span className={shared3['e3-word'] + ' ' + styles['e3-hero-accent'] + ' ' + styles.text2} data-css={"e3-word e3-hero-accent"} >
            Trial.
          </span>
        </h1>
        <div className={styles['e3-hero-foot']} data-css={"e3-hero-foot"}>
          <p className={shared2['e3-lead'] + ' ' + styles['e3-hero-lead']} data-css={"e3-lead e3-hero-lead"}>
            Cursă în stil HYROX în aer liber: alergare combinată cu stații funcționale, contra
            cronometru, în ritmul tău. Stațiile și greutățile se adaptează nivelului tău.
          </p>
          <div className={styles['trial-hero-actions']} data-css={"trial-hero-actions"}>
          {showCta && (
            <a
              href="/inscriere"
              onClick={(e) => {
                if (onInscrie) {
                  e.preventDefault();
                  onInscrie();
                }
              }}
              className={shared4['e3-btn'] + ' ' + styles['e3-cta-lg'] + ' ' + shared5['e3-shine'] + ' ' + shared5['e3-mag'] + ' ' + styles['e3-hero-cta']} data-css={"e3-btn e3-cta-lg e3-shine e3-mag e3-hero-cta"}
            >
              {trialHref ? 'Înscrie-te la eveniment' : 'Rezervă-ți locul'}
            </a>
          )}
          {trialHref && <a className={styles['trial-hero-link']} data-css={"trial-hero-link"} href={trialHref}>Vreau la un antrenament</a>}
          </div>
        </div>
      </div>
    </section>
  );
};
