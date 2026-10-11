import { trialLink, type PublicTrialConfig } from '../lib/trialPublic';
import { INSTAGRAM_URL } from '../lib/config';
import type { StareProba } from '../hooks/usePublicTrial';
import './trial-training.css';

type Props =
  /** Secțiunea din landing și din teaser: apare doar când botul e pornit. */
  | { varianta?: 'sectiune'; config: PublicTrialConfig | null }
  /** Primul bloc al ecranului dintre ediții: rămâne și cu botul oprit, cu Instagram. */
  | { varianta: 'prim'; stare: StareProba };

const PASI = (
  <ol className="trial-training-steps">
    <li><span>01</span> Alegi ziua</li>
    <li><span>02</span> Vii la antrenament</li>
    <li><span>03</span> Decizi dacă vrei să continui</li>
  </ol>
);

export function TrialTraining(props: Props) {
  if (props.varianta === 'prim') return <ProbaPrimBloc stare={props.stare} />;
  const href = props.config?.enabled ? trialLink(props.config.bot_username) : null;
  if (!href) return null;
  return (
    <section className="trial-training" aria-labelledby="trial-title">
      <div className="trial-training-copy">
        <p className="trial-training-label">Antrenamente în comunitate</p>
        <h2 id="trial-title">Primul tău antrenament cu noi.</h2>
        <p>Vino să ne cunoști la un antrenament de probă. În Telegram alegi ziua potrivită și primești programul, locația și condițiile de participare.</p>
        {PASI}
      </div>
      <div className="trial-training-actions">
        <a className="trial-training-button" href={href}>Vreau la un antrenament <span aria-hidden="true">↗</span></a>
        <p>Se deschide Telegram. Apasă Start pentru a începe.</p>
        <p>Nu ai Telegram? <a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer">Scrie-ne pe Instagram</a>.</p>
      </div>
    </section>
  );
}

/**
 * Între ediții proba e mesajul paginii, deci nu dispare când botul e oprit:
 * se schimbă doar canalul. Butonul stă imediat sub titlu, ca amândouă să încapă
 * în primul ecran al unui telefon; textul și pașii vin după.
 */
function ProbaPrimBloc({ stare }: { stare: StareProba }) {
  const href = stare.fel === 'pornit' ? trialLink(stare.config.bot_username) : null;
  // Un username invalid se poartă ca botul oprit: nu publicăm un link stricat.
  const canal = stare.fel === 'incarca' ? 'incarca' : href ? 'telegram' : 'instagram';
  return (
    <section className="trial-training trial-prim" aria-labelledby="trial-title">
      <p className="trial-training-label">Antrenamente în comunitate</p>
      <h1 id="trial-title">Primul tău antrenament cu noi.</h1>
      {/* Înălțimea e rezervată și la încărcare, ca restul paginii să nu sară. */}
      <div className="trial-prim-actiune" aria-busy={canal === 'incarca'}>
        {canal === 'telegram' && href && (
          <>
            <a className="trial-training-button" href={href}>Vreau la un antrenament <span aria-hidden="true">↗</span></a>
            <p>Se deschide Telegram. Apasă Start pentru a începe.</p>
          </>
        )}
        {canal === 'instagram' && (
          <>
            <a className="trial-training-button" href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer">Scrie-ne pe Instagram <span aria-hidden="true">↗</span></a>
            <p>Se deschide Instagram, într-o filă nouă.</p>
          </>
        )}
      </div>
      {/* Neutru față de canal: textul nu se schimbă când se rezolvă starea botului. */}
      <p className="trial-prim-text">Vino să ne cunoști la un antrenament de probă. Alegi ziua potrivită și primești programul, locația și condițiile de participare.</p>
      {PASI}
      {canal === 'telegram' && (
        <p className="trial-prim-alt">Nu ai Telegram? <a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer">Scrie-ne pe Instagram</a>.</p>
      )}
    </section>
  );
}
