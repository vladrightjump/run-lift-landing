import styles from './TrialTraining.module.css';
import { trialLink, type PublicTrialConfig } from '../data/api';
import { useNow } from '../../../shared/lib/useNow';
import { momentComplet } from '../../../shared/lib/formatare';
import { INSTAGRAM_URL } from '../../../shared/lib/config';

export function TrialTraining({ config, embedded = false }: { config: PublicTrialConfig | null; embedded?: boolean }) {
  const Heading = embedded ? 'h3' : 'h2';
  const now = useNow(60_000);
  const href = config?.enabled ? trialLink(config.bot_username) : null;
  if (!href || !config) return null;
  const session = config.next_session;
  const upcoming = session && Date.parse(session.starts_at) > now ? session : null;
  const legacy = config.next_session === undefined;
  const canChoose = upcoming !== null || legacy;
  return (
    <section id="prima-proba" className={embedded ? styles['trial-training'] + ' ' + styles.embedded : styles['trial-training']} data-css={"trial-training"} aria-labelledby="trial-title">
      <div className={styles['trial-training-copy']} data-css={"trial-training-copy"}>
        {!embedded && <p className={styles['trial-training-label']} data-css="trial-training-label">Antrenamente în comunitate</p>}
        <Heading id="trial-title">{embedded ? 'Program și rezervare' : 'Primul tău antrenament cu noi.'}</Heading>
        {upcoming ? (
          <>
            <p><strong>Următoarea probă</strong> · <time dateTime={upcoming.starts_at}>{momentComplet(upcoming.starts_at)}</time> (ora Chișinăului)</p>
            {upcoming.location && <p>Ne întâlnim la <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(upcoming.location)}`}>{upcoming.location}</a>.</p>}
          </>
        ) : <p>{legacy ? 'Verifică în Telegram zilele disponibile pentru proba ta.' : 'Momentan nu este programată nicio probă. Revino pentru următoarea dată.'}</p>}
        <dl className={styles.detalii}>
          {config.bring_text && <div><dt>Ce să aduci</dt><dd>{config.bring_text}</dd></div>}
          {config.trial_price && <div><dt>Costul probei</dt><dd>{config.trial_price}</dd></div>}
        </dl>
      </div>
      <div className={styles['trial-training-actions']} data-css="trial-training-actions">
        {canChoose && <>
          <a className={styles['trial-training-button']} data-css="trial-training-button" href={href}>Aleg ziua în Telegram <span aria-hidden="true">↗</span></a>
          <p>Apasă Start în conversația cu botul și alege sesiunea.</p>
        </>}
        <p>{canChoose ? 'Nu ai Telegram?' : 'Ai o întrebare?'} <a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer">Scrie-ne pe Instagram</a>.</p>
      </div>
    </section>
  );
}
