import { useState } from 'react';
import { useLaunchForm } from '../hooks/useLaunchForm';
import type { LaunchDraft } from '../lib/launchForm';
import { INSTAGRAM_URL, INSTAGRAM_HANDLE } from '../lib/config';
import { EVENT_WHERE, MAP_EMBED_SRC, MAP_DIRECTIONS_URL } from '../content/format';
import { HERO_POSTER, heroVideoSrc } from '../lib/media';

const POVESTE = [
  'Am început antrenamentele în parc, în trei prieteni, cu un scop simplu: să devenim mai fit și mai funcționali.',
  'Încet-încet am crescut comunitatea, unde am devenit prieteni care se antrenează și se respectă împreună.',
  'Azi organizăm antrenamente deschise și evenimente în stil HYROX, unde toată lumea e binevenită — de la începători la avansați.',
];

const VALORI = [
  {
    titlu: 'ÎMPREUNĂ',
    text: 'Nimeni nu termină singur. Ultimul care trece linia e aplaudat cel mai tare.',
  },
  {
    titlu: 'ÎN AER LIBER',
    text: 'Parcul e sala noastră. Soare, ploaie sau frig — ne vedem afară.',
  },
  {
    titlu: 'PE NIVELUL TĂU',
    text: 'Fiecare merge în ritmul lui. Ne adaptăm exercițiile și greutățile după tine.',
  },
];

const STATISTICI = [
  { valoare: 'O comunitate', eticheta: 'În continuă creștere', accent: true },
  { valoare: 'Antrenamente', eticheta: 'În fiecare săptămână', accent: false },
  { valoare: 'Evenimente', eticheta: 'Deschise oricui', accent: false },
  { valoare: '100%', eticheta: 'În aer liber', accent: false },
];

const ETAPE = [
  { nr: '01', titlu: 'Încălzire', text: 'Mobilitate și alergare ușoară — pregătim corpul împreună.' },
  {
    nr: '02',
    titlu: 'Exerciții funcționale',
    text: 'Antrenament în grup, adaptat individual, cu exerciții funcționale — în stil HYROX.',
  },
  { nr: '03', titlu: 'Stretching', text: 'Revenire, întindere și un moment să ne cunoaștem mai bine.' },
];

const ORAR = [
  { k: 'Când', v: 'Marți și joi', accent: false },
  { k: 'Unde', v: EVENT_WHERE, accent: false },
  { k: 'Ora', v: '06:30', accent: true },
  { k: 'Unde ne găsești', v: 'În aer liber, în parc', accent: false },
];

export const DespreNoi = () => {
  const { draft, setField: setFieldBase, errors, state, submit, hpProps } = useLaunchForm('despre-noi');
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
        <video
          className="dn-hero-video"
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
            <div style={{ display: 'grid', gap: 16 }}>
              {POVESTE.map((text) => (
                <p key={text} className="dn-story-text">
                  {text}
                </p>
              ))}
            </div>
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

      <section className="dn-section">
        <div className="dn-container">
          <div className="dn-section-head">
            <span className="dn-section-num">03</span>
            <h2>Cum arată un antrenament</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
            {ETAPE.map((e) => (
              <div
                key={e.nr}
                style={{ border: '1px solid var(--e3-border)', padding: '28px 24px', display: 'grid', gap: 10 }}
              >
                <span style={{ fontFamily: 'Anton, sans-serif', fontSize: 34, color: 'var(--e3-accent)' }}>
                  {e.nr}
                </span>
                <div style={{ fontFamily: 'Anton, sans-serif', fontSize: 15, letterSpacing: 1.5, textTransform: 'uppercase' }}>
                  {e.titlu}
                </div>
                <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5, color: 'var(--e3-muted-strong)' }}>{e.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="dn-section">
        <div className="dn-container">
          <div className="dn-section-head">
            <span className="dn-section-num">04</span>
            <h2>Unde ne antrenăm</h2>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 400px), 1fr))',
              gap: 'clamp(32px, 5vw, 56px)',
              alignItems: 'start',
            }}
          >
            <div>
              <div style={{ display: 'grid', gap: 0, border: '1px solid var(--e3-border)' }}>
                {ORAR.map((row, i, arr) => (
                  <div
                    key={row.k}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'baseline',
                      padding: '18px 22px',
                      borderBottom: i < arr.length - 1 ? '1px solid var(--e3-border)' : 'none',
                    }}
                  >
                    <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--e3-muted)' }}>
                      {row.k}
                    </span>
                    <span style={{ fontSize: 16, fontWeight: 600, color: row.accent ? 'var(--e3-accent)' : undefined }}>
                      {row.v}
                    </span>
                  </div>
                ))}
              </div>
              <a
                href={MAP_DIRECTIONS_URL}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  marginTop: 20,
                  display: 'inline-block',
                  background: 'var(--e3-accent)',
                  color: 'var(--e3-bg)',
                  fontFamily: 'Anton, sans-serif',
                  fontSize: 15,
                  letterSpacing: 1,
                  textTransform: 'uppercase',
                  padding: '12px 24px',
                  textDecoration: 'none',
                }}
              >
                Deschide în Google Maps →
              </a>
            </div>
            <div style={{ border: '1px solid var(--e3-border)', aspectRatio: '4 / 3', overflow: 'hidden', background: 'var(--e3-surface)' }}>
              <iframe
                title={`${EVENT_WHERE} — hartă`}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                allowFullScreen
                src={MAP_EMBED_SRC}
                style={{ width: '100%', height: '100%', border: 'none', display: 'block', filter: 'grayscale(0.3) contrast(1.05)' }}
              />
            </div>
          </div>
        </div>
      </section>

      <section className="dn-section dn-section-form" id="informatii">
        <div className="dn-form-grid">
          <div>
            <div className="dn-section-head">
              <span className="dn-section-num">05</span>
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
              {/* Capcană anti-bot — invizibilă; verificată pe server. */}
              <input type="text" {...hpProps} />
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
