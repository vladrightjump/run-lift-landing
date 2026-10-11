import { INSTAGRAM_URL, INSTAGRAM_HANDLE } from '../lib/config';
import { TRAINING_ORAR } from '../content/format';
import { useStareProba } from '../hooks/usePublicTrial';
import type { ToastKind } from '../hooks/useToast';
import { TrialTraining } from './TrialTraining';
import { CardAntrenament } from './CardAntrenament';
import { AnuntaMa } from './AnuntaMa';

type Props = {
  showToast: (kind: ToastKind, msg: string) => void;
};

/**
 * Homepage-ul dintre ediții: de la finalul cursei până când ediția următoare
 * devine activă (teaser sau înscrieri). Vezi `usePagePhase` și `App.tsx`.
 *
 * Fără o ediție programată, singurul lucru pe care un om nou îl poate face cu
 * noi e să vină la un antrenament. De asta proba e primul bloc, iar ediția
 * următoare e doar o bandă la final, fără countdown și fără dată: o țintă fără
 * ediție în spate ar face pagina să pară abandonată.
 *
 * Cadrul (`cs-root`, antetul, footer-ul) e împrumutat de la Coming Soon, ca
 * pagina să arate ca restul site-ului între ediții.
 */
export const IntreEditii = ({ showToast }: Props) => {
  const proba = useStareProba();

  return (
    <div className="cs-root ie-root">
      <div className="cs-bg" aria-hidden="true" />

      <header className="cs-topbar">
        <span className="cs-logo">
          R<span className="cs-accent">+</span>L
        </span>
        <nav className="cs-nav">
          <span className="cs-brand-meta">Run + Lift · Chișinău</span>
          <a className="cs-tab" href="/despre-noi">Despre noi</a>
        </nav>
      </header>

      <main className="ie-main">
        <TrialTraining varianta="prim" stare={proba} />

        {/* Tace complet când n-are ce arăta; vezi `CardAntrenament`. */}
        <div className="ie-antren">
          <CardAntrenament />
        </div>

        <section className="ie-orar" aria-labelledby="ie-orar-titlu">
          <h2 id="ie-orar-titlu" className="ie-eticheta">Unde și când ne antrenăm</h2>
          <dl className="ie-orar-randuri">
            {TRAINING_ORAR.map((rand) => (
              <div key={rand.k} className="ie-orar-rand">
                <dt>{rand.k}</dt>
                <dd className={rand.accent ? 'cs-accent' : undefined}>{rand.v}</dd>
              </div>
            ))}
          </dl>
          <a className="ie-orar-link" href="/despre-noi">Despre noi și harta locului →</a>
        </section>

        <section className="ie-banda" aria-label="Ediția următoare">
          <p>
            Următoarea ediție Hyrox Trial: <strong>anunțăm curând</strong>.
          </p>
          <AnuntaMa showToast={showToast} label="Anunță-mă" className="cs-cta-secondary ie-banda-cta" />
        </section>
      </main>

      <footer className="cs-footer">
        <span>Run + Lift · Chișinău</span>
        <a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer">
          Instagram {INSTAGRAM_HANDLE}
        </a>
      </footer>
    </div>
  );
};
