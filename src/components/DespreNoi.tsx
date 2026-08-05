import { useState } from 'react';
import { useLaunchForm } from '../hooks/useLaunchForm';
import type { LaunchDraft } from '../lib/launchForm';
import { INSTAGRAM_URL, INSTAGRAM_HANDLE } from '../lib/config';

const VALORI = [
  {
    titlu: 'ÎMPREUNĂ',
    text: 'Nimeni nu termină singur. Ultimul care trece linia e aplaudat cel mai tare.',
  },
  {
    titlu: 'ÎN AER LIBER',
    text: 'Parcul e sala noastră. Soare, ploaie sau frig — ne vedem afară.',
  },
];

const STATISTICI = [
  { valoare: 'O comunitate', eticheta: 'În continuă creștere', accent: true },
  { valoare: 'Antrenamente', eticheta: 'În fiecare săptămână', accent: false },
  { valoare: 'Evenimente', eticheta: 'Deschise oricui', accent: false },
  { valoare: '100%', eticheta: 'În aer liber', accent: false },
];

export const DespreNoi = () => {
  const { draft, setField: setFieldBase, errors, state, submit } = useLaunchForm('despre-noi');
  const [eroare, setEroare] = useState('');
  const [emailTrimis, setEmailTrimis] = useState('');

  // La editarea unui câmp ștergem și eroarea inline (pe lângă marcajul de câmp).
  const setField = (name: keyof LaunchDraft, value: string) => {
    setFieldBase(name, value);
    setEroare('');
  };

  const handleSubmit = async () => {
    const outcome = await submit();
    switch (outcome.kind) {
      case 'success':
        setEmailTrimis(outcome.email);
        break;
      case 'invalid':
      case 'offline':
      case 'error':
        setEroare(outcome.message);
        break;
      // 'busy' → fără feedback
    }
  };

  return (
    <div className="dn-root">
      <header className="dn-topbar">
        <a className="dn-logo" href="/">
          Run <span className="dn-accent">+</span> Lift
        </a>
        <a className="dn-topbar-cta" href="#informatii">
          Vreau info
        </a>
      </header>

      <section className="dn-hero">
        <div className="dn-hero-stripes" aria-hidden="true" />
        <div className="dn-hero-fade" aria-hidden="true" />
        <div className="dn-hero-inner">
          <p className="dn-kicker">Cine suntem</p>
          <h1 className="dn-hero-title">
            Mai mult decât
            <br />
            <span className="dn-accent">un antrenament.</span>
          </h1>
          <p className="dn-hero-sub">
            Alergare, forță și oameni faini — asta e Run <span className="dn-accent">+</span> Lift.
            Vino așa cum ești, restul vine de la sine.
          </p>
        </div>
      </section>

      <section className="dn-section">
        <div className="dn-container">
          <div className="dn-section-head">
            <span className="dn-section-num">01</span>
            <h2>Povestea noastră</h2>
          </div>
          <div className="dn-story">
            <p className="dn-story-text">
              Run <span className="dn-accent">+</span> Lift a pornit de la un antrenament în parc și
              dorința de a crea o comunitate.
            </p>
            <div className="dn-values">
              {VALORI.map((v) => (
                <div key={v.titlu} className="dn-value-card">
                  <div className="dn-value-title">{v.titlu}</div>
                  <p>{v.text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="dn-section">
        <div className="dn-container">
          <div className="dn-section-head">
            <span className="dn-section-num">02</span>
            <h2>Comunitatea</h2>
          </div>
          <div className="dn-stats">
            {STATISTICI.map((s) => (
              <div key={s.eticheta} className="dn-stat">
                <div className={`dn-stat-value${s.accent ? ' accent' : ''}`}>{s.valoare}</div>
                <div className="dn-stat-label">{s.eticheta}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="dn-section dn-section-form" id="informatii">
        <div className="dn-form-grid">
          <div>
            <div className="dn-section-head">
              <span className="dn-section-num">03</span>
              <h2>Vrei mai multe informații?</h2>
            </div>
            <p className="dn-form-intro">
              Lasă-ne datele tale și îți scriem când urmează un antrenament deschis sau un eveniment
              nou. Fără spam — doar ce contează.
            </p>
            <div className="dn-badge">
              <span className="dn-badge-dot" />
              <span>Răspundem de obicei în 24h</span>
            </div>
          </div>

          {state === 'success' ? (
            <div className="dn-success">
              <div className="dn-success-check" aria-hidden="true">
                ✓
              </div>
              <h3>Te-am notat!</h3>
              <p>
                Ți-am trimis un email pe <strong>{emailTrimis}</strong> — apasă pe linkul din el ca
                să confirmi înscrierea. Ne vedem la antrenament!
              </p>
            </div>
          ) : (
            <form
              className="dn-form"
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                handleSubmit();
              }}
            >
              <div className="dn-form-row">
                <label className={`dn-field${errors.nume ? ' invalid' : ''}`}>
                  <span>Nume</span>
                  <input
                    type="text"
                    placeholder="Nume"
                    autoComplete="family-name"
                    value={draft.nume}
                    onChange={(e) => setField('nume', e.target.value)}
                  />
                </label>
                <label className={`dn-field${errors.prenume ? ' invalid' : ''}`}>
                  <span>Prenume</span>
                  <input
                    type="text"
                    placeholder="Prenume"
                    autoComplete="given-name"
                    value={draft.prenume}
                    onChange={(e) => setField('prenume', e.target.value)}
                  />
                </label>
              </div>
              <label className={`dn-field${errors.email ? ' invalid' : ''}`}>
                <span>Email</span>
                <input
                  type="email"
                  placeholder="email@exemplu.md"
                  autoComplete="email"
                  value={draft.email}
                  onChange={(e) => setField('email', e.target.value)}
                />
              </label>
              <label className={`dn-field${errors.telefon ? ' invalid' : ''}`}>
                <span>Telefon</span>
                <input
                  type="tel"
                  placeholder="069 123 456"
                  autoComplete="tel"
                  value={draft.telefon}
                  onChange={(e) => setField('telefon', e.target.value)}
                />
              </label>

              {eroare && (
                <p className="dn-error" role="alert">
                  {eroare}
                </p>
              )}

              <button type="submit" className="dn-submit" disabled={state === 'loading'}>
                {state === 'loading' ? 'Se trimite…' : 'Ține-mă la curent'}
              </button>
            </form>
          )}
        </div>
      </section>

      <footer className="dn-footer">
        <span className="dn-footer-brand">
          Run <span className="dn-accent">+</span> Lift
        </span>
        <a
          className="dn-footer-link"
          href={INSTAGRAM_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          Instagram {INSTAGRAM_HANDLE}
        </a>
        <a className="dn-footer-link" href="/">
          Vezi evenimentul →
        </a>
      </footer>
    </div>
  );
};
