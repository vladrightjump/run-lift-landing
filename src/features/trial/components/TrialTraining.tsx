import styles from './TrialTraining.module.css';
import { trialLink, type PublicTrialConfig } from '../data/api';
import { INSTAGRAM_URL } from '../../../shared/lib/config';

export function TrialTraining({ config }: { config: PublicTrialConfig | null }) {
  const href = config?.enabled ? trialLink(config.bot_username) : null;
  if (!href) return null;
  return (
    <section className={styles['trial-training']} data-css={"trial-training"} aria-labelledby="trial-title">
      <div className={styles['trial-training-copy']} data-css={"trial-training-copy"}>
        <p className={styles['trial-training-label']} data-css={"trial-training-label"}>Antrenamente în comunitate</p>
        <h2 id="trial-title">Primul tău antrenament cu noi.</h2>
        <p>Vino să ne cunoști la un antrenament de probă. În Telegram alegi ziua potrivită și primești programul, locația și condițiile de participare.</p>
        <ol className={styles['trial-training-steps']} data-css={"trial-training-steps"}>
          <li><span>01</span> Alegi ziua</li>
          <li><span>02</span> Vii la antrenament</li>
          <li><span>03</span> Decizi dacă vrei să continui</li>
        </ol>
      </div>
      <div className={styles['trial-training-actions']} data-css={"trial-training-actions"}>
        <a className={styles['trial-training-button']} data-css={"trial-training-button"} href={href}>Vreau la un antrenament <span aria-hidden="true">↗</span></a>
        <p>Se deschide Telegram. Apasă Start pentru a începe.</p>
        <p>Nu ai Telegram? <a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer">Scrie-ne pe Instagram</a>.</p>
      </div>
    </section>
  );
}
