import { EVENT_DATE } from '../lib/config';
import { useCountdown } from '../hooks/useCountdown';

export const TopBar = () => {
  const cd = useCountdown(EVENT_DATE);

  return (
    <header className="topbar">
      <div className="brand">
        <div className="brand-mark">RL</div>
        <span className="brand-name">Run + Lift</span>
      </div>

      <div
        className="countdown"
        aria-label={cd.done ? 'Evenimentul a început' : 'Timp până la start'}
      >
        <span className="countdown-dot" aria-hidden="true"></span>
        {cd.done ? (
          <span className="countdown-label">Evenimentul a început</span>
        ) : (
          <>
            <span className="countdown-label">Start în</span>
            <div className="countdown-values">
              <span id="cd-zile" className="countdown-num accent">{cd.zile}</span>
              <span className="countdown-unit">z</span>
              <span id="cd-ore" className="countdown-num">{cd.ore}</span>
              <span className="countdown-unit">h</span>
              <span id="cd-minute" className="countdown-num">{cd.minute}</span>
              <span className="countdown-unit">m</span>
              <span id="cd-secunde" className="countdown-num">{cd.secunde}</span>
              <span className="countdown-unit">s</span>
            </div>
          </>
        )}
      </div>

      <div className="topbar-meta">
        <span className="topbar-info">18 iulie 2026 · Parcul Râșcani</span>
        <a href="#inscriere" className="btn-primary">Înscrie-te</a>
      </div>
    </header>
  );
};
