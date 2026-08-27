import { useState } from 'react';
import type { CSSProperties } from 'react';
import { useLaunchForm } from '../hooks/useLaunchForm';
import { useScrollReveal } from '../hooks/useScrollReveal';
import { useSpotlight } from '../hooks/useSpotlight';
import { useMagnetic } from '../hooks/useMagnetic';
import { Marquee } from './landing/Marquee';
import type { LaunchDraft } from '../lib/launchForm';
import { INSTAGRAM_URL, INSTAGRAM_HANDLE } from '../lib/config';
// Antrenamentele, NU cursa: pagina asta descrie marțea și joia din parc, care nu
// se mută odată cu ediția. Constantele `EVENT_*`/`MAP_*` sunt ale cursei — a le
// folosi aici a trimis oameni la locul greșit.
import {
  TRAINING_WHERE,
  TRAINING_MAP_EMBED_SRC,
  TRAINING_MAP_DIRECTIONS_URL,
} from '../content/format';
import { EDITION } from '../content/edition';
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
  { k: 'Când', v: EDITION.training.days, accent: false },
  { k: 'Unde', v: TRAINING_WHERE, accent: false },
  { k: 'Ora', v: EDITION.training.time, accent: true },
  { k: 'Unde ne găsești', v: 'În aer liber, în parc', accent: false },
];

/**
 * Banda de sub hero. Constante de build (antrenamentele nu se mută odată cu
 * ediția), deci pagina rămâne fără NICIUN request către Supabase — proprietate
 * păzită de `tests/despre-noi.spec.ts`.
 */
const MARQUEE = [
  'Alergare',
  'Forță',
  'În aer liber',
  EDITION.training.days,
  EDITION.training.time,
  TRAINING_WHERE,
];

export const DespreNoi = () => {
  const { draft, setField: setFieldBase, errors, state, submit } = useLaunchForm('despre-noi');
  const [eroare, setEroare] = useState('');
  const [emailTrimis, setEmailTrimis] = useState('');

  // Același strat de mișcare ca pe landing — pagina asta rămăsese cu un hero
  // animat și nimic sub el, deci se citea ca alt site.
  useScrollReveal();
  useSpotlight();
  useMagnetic();

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
    <div className="dn-root e3-grain">
      {/* Firul de progres al paginii, ca pe landing. Decorativ — dublează bara
          nativă de scroll, în culoarea brandului. */}
      <div className="e3-progress" aria-hidden="true" />
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
        {/* `e3-hero-video` adaugă driftul legat de scroll — clipul se mișcă în
            sens invers textului, mai puțin, ca planurile să se separe. */}
        <video
          className="dn-hero-video e3-hero-video"
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
        {/* `e3-hero-copy` retrage textul la ieșirea din ecran. */}
        <div className="dn-hero-inner e3-hero-copy">
          <p className="dn-kicker">Cine suntem</p>
          <h1 className="dn-hero-title">
            {/* Cuvintele cresc din linia de bază prin mască, ca pe landing. */}
            <span className="e3-word" style={{ '--d': '0.12s' } as CSSProperties}>
              Mai mult decât
            </span>
            <br />
            <span className="e3-word dn-accent" style={{ '--d': '0.28s' } as CSSProperties}>
              un antrenament.
            </span>
          </h1>
          <p className="dn-hero-sub">
            Alergare, forță și oameni faini — asta e Run <span className="dn-accent">+</span> Lift.
            Vino așa cum ești, restul vine de la sine.
          </p>
        </div>
      </section>

      <Marquee items={MARQUEE} />

      <section className="dn-section">
        <div className="dn-container">
          <div className="dn-section-head">
            <span className="dn-section-num e3-title-num">01</span>
            <h2 className="e3-title">Povestea noastră</h2>
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
                <div key={v.titlu} className="dn-value-card e3-spot" data-reveal>
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
            <span className="dn-section-num e3-title-num">02</span>
            <h2 className="e3-title">Comunitatea</h2>
          </div>
          <div className="dn-stats">
            {STATISTICI.map((s, i) => (
              // `--i` dă decalajul cascadei; cartonașele nu mai apar toate odată.
              <div key={s.eticheta} className="dn-stat e3-spot" style={{ '--i': i } as CSSProperties}>
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
            <span className="dn-section-num e3-title-num">03</span>
            <h2 className="e3-title">Cum arată un antrenament</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
            {ETAPE.map((e) => (
              // Stilurile stau în `.dn-step` (index.css), NU inline: inline ar
              // bate `:hover` la specificitate și tenta lime n-ar mai apărea.
              <div key={e.nr} className="dn-step e3-spot" data-reveal>
                <span className="dn-step-nr">{e.nr}</span>
                <div className="dn-step-titlu">{e.titlu}</div>
                <p>{e.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="dn-section">
        <div className="dn-container">
          <div className="dn-section-head">
            <span className="dn-section-num e3-title-num">04</span>
            <h2 className="e3-title">Unde ne antrenăm</h2>
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
              <div data-reveal style={{ display: 'grid', gap: 0, border: '1px solid var(--e3-border)' }}>
                {ORAR.map((row, i, arr) => (
                  <div
                    key={row.k}
                    className="dn-orar-row"
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
                href={TRAINING_MAP_DIRECTIONS_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="e3-cta e3-shine e3-mag"
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
            {/* `position: relative` ancorează butonul de direcții peste hartă. */}
            <div
              data-reveal
              style={{
                position: 'relative',
                border: '1px solid var(--e3-border)',
                aspectRatio: '4 / 3',
                overflow: 'hidden',
                background: 'var(--e3-surface)',
              }}
            >
              <iframe
                title={`${TRAINING_WHERE} — hartă`}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                allowFullScreen
                src={TRAINING_MAP_EMBED_SRC}
                style={{ width: '100%', height: '100%', border: 'none', display: 'block', filter: 'grayscale(0.3) contrast(1.05)' }}
              />
              <a
                className="dn-map-link"
                href={TRAINING_MAP_DIRECTIONS_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                Direcții ↗
              </a>
            </div>
          </div>
        </div>
      </section>

      <section className="dn-section dn-section-form" id="informatii">
        <div className="dn-form-grid">
          <div>
            <div className="dn-section-head">
              <span className="dn-section-num e3-title-num">05</span>
              <h2 className="e3-title">Vrei mai multe informații?</h2>
            </div>
            <p className="dn-form-intro" data-reveal>
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

              <button type="submit" className="dn-submit e3-shine" disabled={state === 'loading'}>
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
