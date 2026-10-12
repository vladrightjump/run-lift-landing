import shared5 from '../../../shared/ui/PublicControls.module.css';
import shared4 from '../../../shared/ui/PublicSurface.module.css';
import shared3 from '../../../shared/ui/PublicLayout.module.css';
import shared2 from '../../../shared/ui/PublicMotion.module.css';
import styles from './DespreNoiPage.module.css';
import { useState } from 'react';
import type { CSSProperties } from 'react';
import { useLaunchForm } from '../../inscriere';
import { useScrollReveal } from '../../../shared/lib/useScrollReveal';
import { useSpotlight } from '../../../shared/lib/useSpotlight';
import { useMagnetic } from '../../../shared/lib/useMagnetic';
import { Marquee } from '../../../shared/ui/Marquee';
import type { LaunchDraft } from '../../inscriere';
import { INSTAGRAM_URL, INSTAGRAM_HANDLE } from '../../../shared/lib/config';
// Antrenamentele, NU cursa: pagina asta descrie marțea și joia, care nu se mută
// odată cu ediția. Constantele `EVENT_*`/`MAP_*` sunt ale cursei — a le folosi
// aici a trimis oameni la locul greșit.
import { trainingPlace } from '../../../shared/content/format';
import { usePublicHomepage } from '../../../shared/lib/usePublicHomepage';
import { EDITION } from '../../../shared/content/edition';
import { HERO_POSTER, heroVideoSrc } from '../../../shared/lib/media';
import { useTrainingReels } from '../../reels';
import { ReelsRail } from '../../reels';

const POVESTE = [
  'Am început antrenamentele în parc, în trei prieteni, cu un scop simplu: să devenim mai fit și mai funcționali.',
  'Încet-încet am crescut comunitatea, unde am devenit prieteni care se antrenează și se respectă împreună.',
  'Azi organizăm antrenamente deschise și evenimente în stil HYROX, unde toată lumea e binevenită, de la începători la avansați.',
];

const VALORI = [
  {
    titlu: 'ÎMPREUNĂ',
    text: 'Nimeni nu termină singur. Ultimul care trece linia e aplaudat cel mai tare.',
  },
  {
    titlu: 'ÎN AER LIBER',
    text: 'Parcul e sala noastră. Soare, ploaie sau frig: ne vedem afară.',
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
];

const ETAPE = [
  { nr: '01', titlu: 'Încălzire', text: 'Mobilitate și alergare ușoară: pregătim corpul împreună.' },
  {
    nr: '02',
    titlu: 'Exerciții funcționale',
    text: 'Antrenament în grup, adaptat individual, cu exerciții funcționale, în stil HYROX.',
  },
  { nr: '03', titlu: 'Stretching', text: 'Revenire, întindere și un moment să ne cunoaștem mai bine.' },
];

/**
 * Programul. Locul vine din setările botului (vezi `trainingPlace`), deci nu mai
 * are voie să promită „în parc": antrenamentele se pot muta într-o sală. Cât
 * locul nu e încă știut, rândul „Unde" lipsește în loc să arate unul vechi.
 */
const orar = (unde: string | null) => [
  { k: 'Când', v: EDITION.training.days, accent: false },
  ...(unde ? [{ k: 'Unde', v: unde, accent: false }] : []),
  { k: 'Ora', v: EDITION.training.time, accent: true },
];

/**
 * Banda de sub hero. Zilele și ora sunt constante de build; locul vine din
 * setările botului.
 *
 * Pagina cere de la server exact două lucruri: `public_training_reels()` (banda
 * cu clipuri, administrată din `/admin`) și `public_homepage()` (locul).
 * `tests/e2e/despre-noi.spec.ts` păzește granița asta.
 */
const marquee = (unde: string | null) => [
  'Alergare',
  'Forță',
  EDITION.training.days,
  EDITION.training.time,
  ...(unde ? [unde] : []),
];

type CheieSectiune = 'poveste' | 'comunitate' | 'antrenament' | 'clipuri' | 'unde' | 'info';

/**
 * Numerele secțiunilor, derivate din ce chiar se randează.
 *
 * Banda cu clipuri dispare când lista e goală, iar numere scrise de mână ar
 * lăsa atunci o gaură (01, 02, 03, 05).
 *
 * Compromisul, spus pe față: lista e goală până răspunde `public_training_reels()`,
 * deci secțiunile de după bandă se renumerotează o dată, la sosirea răspunsului
 * (04→05, 05→06). Alternativa — să rezervăm numărul dinainte — ar fi lăsat
 * exact gaura de mai sus când banda chiar e goală, adică starea normală. Saltul
 * e vizibil doar dacă ești deja derulat acolo în prima secundă.
 */
const numerotare = (areClipuri: boolean) => {
  const sectiuni: CheieSectiune[] = [
    'poveste',
    'comunitate',
    'antrenament',
    ...(areClipuri ? (['clipuri'] as const) : []),
    'unde',
    'info',
  ];
  return (cheie: CheieSectiune): string =>
    String(sectiuni.indexOf(cheie) + 1).padStart(2, '0');
};

export const DespreNoi = () => {
  const { draft, setField: setFieldBase, errors, state, submit, hpProps } = useLaunchForm('despre-noi');
  const [eroare, setEroare] = useState('');
  const reels = useTrainingReels();
  // Locul apare abia după răspunsul serverului (cel mult 2 s): după o mutare,
  // nimeni nu trebuie să vadă, nici o clipă, locul vechi din cod. Dacă serverul
  // nu răspunde, rămâne locul din cod.
  const setari = usePublicHomepage();
  const loc = setari.gata ? trainingPlace(setari.trainingLocation) : null;
  const nr = numerotare(reels.length > 0);
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
    <div className={styles['dn-root'] + ' ' + styles['e3-grain']} data-css={"dn-root e3-grain"}>
      {/* Firul de progres al paginii, ca pe landing. Decorativ — dublează bara
          nativă de scroll, în culoarea brandului. */}
      <div className={shared2['e3-progress']} data-css={"e3-progress"} aria-hidden="true" />
      <header className={styles['dn-topbar']} data-css={"dn-topbar"}>
        <a className={styles['dn-logo']} data-css={"dn-logo"} href="/">
          Run <span className={styles['dn-accent']} data-css={"dn-accent"}>+</span> Lift
        </a>
        <a className={styles['dn-topbar-cta']} data-css={"dn-topbar-cta"} href="#informatii">
          Vreau info
        </a>
      </header>

      <section className={styles['dn-hero']} data-css={"dn-hero"}>
        <div className={styles['dn-hero-stripes']} data-css={"dn-hero-stripes"} aria-hidden="true" />
        {/* `e3-hero-video` adaugă driftul legat de scroll — clipul se mișcă în
            sens invers textului, mai puțin, ca planurile să se separe. */}
        <video
          className={styles['dn-hero-video'] + ' ' + shared3['e3-hero-video']} data-css={"dn-hero-video e3-hero-video"}
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
        <div className={styles['dn-hero-fade']} data-css={"dn-hero-fade"} aria-hidden="true" />
        {/* `e3-hero-copy` retrage textul la ieșirea din ecran. */}
        <div className={styles['dn-hero-inner'] + ' ' + shared3['e3-hero-copy']} data-css={"dn-hero-inner e3-hero-copy"}>
          <p className={styles['dn-kicker']} data-css={"dn-kicker"}>Cine suntem</p>
          <h1 className={styles['dn-hero-title']} data-css={"dn-hero-title"}>
            {/* Cuvintele cresc din linia de bază prin mască, ca pe landing. */}
            <span className={shared2['e3-word'] + ' ' + styles.text1} data-css={"e3-word"} >
              Mai mult decât
            </span>
            <br />
            <span className={shared2['e3-word'] + ' ' + styles['dn-accent'] + ' ' + styles.text2} data-css={"e3-word dn-accent"} >
              un antrenament.
            </span>
          </h1>
          <p className={styles['dn-hero-sub']} data-css={"dn-hero-sub"}>
            Alergare, forță și oameni faini: asta e Run <span className={styles['dn-accent']} data-css={"dn-accent"}>+</span> Lift.
            Vino așa cum ești, restul vine de la sine.
          </p>
        </div>
      </section>

      <Marquee items={marquee(loc?.where ?? null)} />

      <section className={styles['dn-section']} data-css={"dn-section"}>
        <div className={styles['dn-container']} data-css={"dn-container"}>
          <div className={styles['dn-section-head']} data-css={"dn-section-head"}>
            <span className={styles['dn-section-num'] + ' ' + shared3['e3-title-num']} data-css={"dn-section-num e3-title-num"}>{nr('poveste')}</span>
            <h2 className={shared3['e3-title']} data-css={"e3-title"}>Povestea noastră</h2>
          </div>
          <div className={styles['dn-story']} data-css={"dn-story"}>
            <div className={styles.layout3}>
              {POVESTE.map((text) => (
                <p key={text} className={styles['dn-story-text']} data-css={"dn-story-text"}>
                  {text}
                </p>
              ))}
            </div>
            <div className={styles['dn-values']} data-css={"dn-values"}>
              {VALORI.map((v) => (
                <div key={v.titlu} className={styles['dn-value-card'] + ' ' + shared4['e3-spot']} data-css={"dn-value-card e3-spot"} data-reveal>
                  <div className={styles['dn-value-title']} data-css={"dn-value-title"}>{v.titlu}</div>
                  <p>{v.text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className={styles['dn-section']} data-css={"dn-section"}>
        <div className={styles['dn-container']} data-css={"dn-container"}>
          <div className={styles['dn-section-head']} data-css={"dn-section-head"}>
            <span className={styles['dn-section-num'] + ' ' + shared3['e3-title-num']} data-css={"dn-section-num e3-title-num"}>{nr('comunitate')}</span>
            <h2 className={shared3['e3-title']} data-css={"e3-title"}>Comunitatea</h2>
          </div>
          <div className={styles['dn-stats']} data-css={"dn-stats"}>
            {STATISTICI.map((s, i) => (
              // `--i` dă decalajul cascadei; cartonașele nu mai apar toate odată.
              <div key={s.eticheta} className={styles['dn-stat'] + ' ' + shared4['e3-spot']} data-css={"dn-stat e3-spot"} style={{ '--i': i } as CSSProperties}>
                <div className={styles['dn-stat-value']} data-css={`dn-stat-value${s.accent ? ' accent' : ''}`}>{s.valoare}</div>
                <div className={styles['dn-stat-label']} data-css={"dn-stat-label"}>{s.eticheta}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className={styles['dn-section']} data-css={"dn-section"}>
        <div className={styles['dn-container']} data-css={"dn-container"}>
          <div className={styles['dn-section-head']} data-css={"dn-section-head"}>
            <span className={styles['dn-section-num'] + ' ' + shared3['e3-title-num']} data-css={"dn-section-num e3-title-num"}>{nr('antrenament')}</span>
            <h2 className={shared3['e3-title']} data-css={"e3-title"}>Cum arată un antrenament</h2>
          </div>
          <div className={styles.layout4}>
            {ETAPE.map((e) => (
              // Stilurile stau în `.dn-step` (index.css), NU inline: inline ar
              // bate `:hover` la specificitate și tenta lime n-ar mai apărea.
              <div key={e.nr} className={styles['dn-step'] + ' ' + shared4['e3-spot']} data-css={"dn-step e3-spot"} data-reveal>
                <span className={styles['dn-step-nr']} data-css={"dn-step-nr"}>{e.nr}</span>
                <div className={styles['dn-step-titlu']} data-css={"dn-step-titlu"}>{e.titlu}</div>
                <p>{e.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Clipurile vin imediat după descrierea antrenamentului: secțiunea de
          deasupra îl spune în cuvinte, banda îl arată. Aceeași listă ca pe
          landing, administrată din `/admin` → Clipuri. Lista goală nu randează
          nimic, iar numerotarea de mai sus se strânge singură. */}
      <ReelsRail
        reels={reels}
        num={nr('clipuri')}
        headline="Cum arată la noi"
        body="Antrenamentele, filmate pe teren. Dacă vrei să vezi cum e înainte să vii, aici e."
      />

      <section className={styles['dn-section']} data-css={"dn-section"}>
        <div className={styles['dn-container']} data-css={"dn-container"}>
          <div className={styles['dn-section-head']} data-css={"dn-section-head"}>
            <span className={styles['dn-section-num'] + ' ' + shared3['e3-title-num']} data-css={"dn-section-num e3-title-num"}>{nr('unde')}</span>
            <h2 className={shared3['e3-title']} data-css={"e3-title"}>Unde ne antrenăm</h2>
          </div>
          <div
            className={styles.layout5}
          >
            <div>
              <div data-reveal className={styles.layout6}>
                {orar(loc?.where ?? null).map((row, i, arr) => (
                  <div
                    key={row.k}
                    className={styles['dn-orar-row'] + ' ' + styles.layout7 + ' ' + (i < arr.length - 1 ? styles.layout7On0 : styles.layout7Off0)} data-css={"dn-orar-row"}

                  >
                    <span className={styles.text8}>
                      {row.k}
                    </span>
                    <span className={styles.text9 + ' ' + (row.accent ? styles.text9On0 : '')}>
                      {row.v}
                    </span>
                  </div>
                ))}
              </div>
              {loc && (
                <a
                  href={loc.directionsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={shared5['e3-cta'] + ' ' + shared5['e3-shine'] + ' ' + shared5['e3-mag'] + ' ' + styles.link10} data-css={"e3-cta e3-shine e3-mag"}

                >
                  Deschide în Google Maps →
                </a>
              )}
            </div>
            {/* `position: relative` ancorează butonul de direcții peste hartă. */}
            <div
              data-reveal
              className={styles.layout11}
            >
              {/* Cutia își păstrează mărimea; harta intră când locul e știut. */}
              {loc && (
                <>
                  <iframe
                    title={`${loc.where}: hartă`}
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    allowFullScreen
                    src={loc.embedSrc}
                    className={styles.map12}
                  />
                  <a
                    className={styles['dn-map-link']} data-css={"dn-map-link"}
                    href={loc.directionsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Direcții ↗
                  </a>
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className={styles['dn-section'] + ' ' + styles['dn-section-form']} data-css={"dn-section dn-section-form"} id="informatii">
        <div className={styles['dn-form-grid']} data-css={"dn-form-grid"}>
          <div>
            <div className={styles['dn-section-head']} data-css={"dn-section-head"}>
              <span className={styles['dn-section-num'] + ' ' + shared3['e3-title-num']} data-css={"dn-section-num e3-title-num"}>{nr('info')}</span>
              <h2 className={shared3['e3-title']} data-css={"e3-title"}>Vrei mai multe informații?</h2>
            </div>
            <p className={styles['dn-form-intro']} data-css={"dn-form-intro"} data-reveal>
              Lasă-ne datele tale și îți scriem când urmează un antrenament deschis sau un eveniment
              nou. Fără spam, doar ce contează.
            </p>
            <div className={styles['dn-badge']} data-css={"dn-badge"}>
              <span>Răspundem de obicei în 24h</span>
            </div>
          </div>

          {state === 'success' ? (
            <div className={styles['dn-success']} data-css={"dn-success"}>
              <div className={styles['dn-success-check']} data-css={"dn-success-check"} aria-hidden="true">
                ✓
              </div>
              <h3>Te-am notat!</h3>
              <p>
                Ți-am trimis un email pe <strong>{emailTrimis}</strong>. Apasă pe linkul din el ca
                să confirmi înscrierea. Ne vedem la antrenament!
              </p>
            </div>
          ) : (
            <form
              className={styles['dn-form']} data-css={"dn-form"}
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                handleSubmit();
              }}
            >
              {/* Capcană anti-bot — invizibilă; verificată pe server. */}
              <input type="text" {...hpProps} />
              <div className={styles['dn-form-row']} data-css={"dn-form-row"}>
                <label className={styles['dn-field'] + ' ' + (errors.nume ? styles.invalid : '')} data-css={`dn-field${errors.nume ? ' invalid' : ''}`}>
                  <span>Nume</span>
                  <input
                    type="text"
                    placeholder="Nume"
                    autoComplete="family-name"
                    value={draft.nume}
                    onChange={(e) => setField('nume', e.target.value)}
                  />
                </label>
                <label className={styles['dn-field'] + ' ' + (errors.prenume ? styles.invalid : '')} data-css={`dn-field${errors.prenume ? ' invalid' : ''}`}>
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
              <label className={styles['dn-field'] + ' ' + (errors.email ? styles.invalid : '')} data-css={`dn-field${errors.email ? ' invalid' : ''}`}>
                <span>Email</span>
                <input
                  type="email"
                  placeholder="email@exemplu.md"
                  autoComplete="email"
                  value={draft.email}
                  onChange={(e) => setField('email', e.target.value)}
                />
              </label>
              <label className={styles['dn-field'] + ' ' + (errors.telefon ? styles.invalid : '')} data-css={`dn-field${errors.telefon ? ' invalid' : ''}`}>
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
                <p className={styles['dn-error']} data-css={"dn-error"} role="alert">
                  {eroare}
                </p>
              )}

              <button type="submit" className={styles['dn-submit'] + ' ' + shared5['e3-shine']} data-css={"dn-submit e3-shine"} disabled={state === 'loading'}>
                {state === 'loading' ? 'Se trimite…' : 'Ține-mă la curent'}
              </button>
            </form>
          )}
        </div>
      </section>

      <footer className={styles['dn-footer']} data-css={"dn-footer"}>
        <span className={styles['dn-footer-brand']} data-css={"dn-footer-brand"}>
          Run <span className={styles['dn-accent']} data-css={"dn-accent"}>+</span> Lift
        </span>
        <a
          className={styles['dn-footer-link']} data-css={"dn-footer-link"}
          href={INSTAGRAM_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          Instagram {INSTAGRAM_HANDLE}
        </a>
        <a className={styles['dn-footer-link']} data-css={"dn-footer-link"} href="/">
          Vezi evenimentul →
        </a>
      </footer>
    </div>
  );
};
