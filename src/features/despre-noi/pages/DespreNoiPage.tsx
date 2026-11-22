import shared5 from '../../../shared/ui/PublicControls.module.css';
import shared4 from '../../../shared/ui/PublicSurface.module.css';
import shared3 from '../../../shared/ui/PublicLayout.module.css';
import shared2 from '../../../shared/ui/PublicMotion.module.css';
import styles from './DespreNoiPage.module.css';
import { useState } from 'react';
import { TrialTraining, usePublicTrialStare } from '../../trial';
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
import { HeroFilm } from '../components/HeroFilm';
import { SectionNav } from '../components/SectionNav';
import { ArrowDownRightIcon } from '@phosphor-icons/react/ArrowDownRight';
import { useTrainingReels } from '../../reels';
import { ReelsRail } from '../../reels';

const POVESTE = [
  'La început eram trei prieteni. Ne întâlneam în parc, în Chișinău, ca să alergăm și să lucrăm la forță împreună.',
  'Pe măsură ce ni s-au alăturat și alții, am legat prietenii la antrenament. Așa a crescut Run + Lift.',
];

const VALORI = [
  { titlu: 'Ne încurajăm', text: 'Când mai ai o repetare de făcut, ai lângă tine oameni care te încurajează.' },
  { titlu: 'În ritmul tău', text: 'La alergare îți alegi ritmul. La stații, adaptăm exercițiile și greutățile nivelului tău.' },
  { titlu: 'La prima întâlnire', text: 'Poți veni singur la o probă. Facem încălzirea împreună și ai ocazia să cunoști grupul înainte să decizi dacă revii.' },
];

const ACTIVITATI = [
  { titlu: 'Antrenamente în grup', text: 'În timpul săptămânii ne întâlnim pentru alergare și forță. Membrii anunță în sondajul din Telegram dacă vin la următoarea sesiune.', href: '#program', link: 'Program și hartă' },
  { titlu: 'Antrenamentul săptămânii', text: 'Publicăm pe site sesiunile de pregătire. Poți deschide o săptămână anterioară ca să repeți un antrenament.', href: '/antrenament', link: 'Deschide programul săptămânii' },
  { titlu: 'Un loc la prima probă', text: 'Poți veni la un antrenament ca să cunoști grupul. Ghidul îți arată cum alegi ziua în Telegram și ce poți face dacă ți se schimbă programul.', href: '#prima-vizita', link: 'Cum vii la o probă' },
];

const ETAPE = [
  { nr: '01', titlu: 'Încălzire', text: 'Mobilitate și alergare ușoară: pregătim corpul împreună.' },
  {
    nr: '02',
    titlu: 'Exerciții funcționale',
    text: 'Alternăm alergarea cu exerciții de forță. Într-o stație poți avea de împins, de tras sau de cărat o greutate.',
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
 */
const marquee = (unde: string | null) => [
  'Alergare',
  'Forță',
  EDITION.training.days,
  EDITION.training.time,
  ...(unde ? [unde] : []),
];

type CheieSectiune = 'poveste' | 'comunitate' | 'antrenament' | 'clipuri' | 'vizita' | 'unde' | 'info';

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
    'vizita',
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
  const proba = usePublicTrialStare();
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
        <SectionNav />
        <a className={styles['dn-topbar-cta']} data-css={"dn-topbar-cta"} href="#prima-vizita">
          Vin prima dată <ArrowDownRightIcon size={18} weight="bold" aria-hidden="true" />
        </a>
      </header>

      <main>
      <section className={styles['dn-hero']} data-css={"dn-hero"}>
        <HeroFilm />
        <div className={styles['dn-hero-fade']} data-css={"dn-hero-fade"} aria-hidden="true" />
        <div aria-hidden="true" className={styles.cortina} />
        {/* `e3-hero-copy` retrage textul la ieșirea din ecran. */}
        <div className={styles['dn-hero-inner'] + ' ' + shared3['e3-hero-copy']} data-css={"dn-hero-inner e3-hero-copy"}>
          <p className={styles['dn-kicker']} data-css={"dn-kicker"}>Cine suntem</p>
          <h1 className={styles['dn-hero-title']} data-css={"dn-hero-title"}>
            {/* Cuvintele cresc din linia de bază prin mască, ca pe landing. */}
            <span className={shared2['e3-word'] + ' ' + styles.text1} data-css={"e3-word"} >
              Comunitatea
            </span>
            <br />
            <span className={shared2['e3-word'] + ' ' + styles['dn-accent'] + ' ' + styles.text2} data-css={"e3-word dn-accent"} >
              Run + Lift
            </span>
          </h1>
          <p className={styles['dn-hero-sub']} data-css={"dn-hero-sub"}>
            Facem antrenamente de grup în Chișinău. Alergăm împreună, apoi lucrăm la forță. Poți începe cu o sesiune de probă.
          </p>
          <a href="#program" className={styles.programLink}>Vezi programul <ArrowDownRightIcon size={20} aria-hidden="true" /></a>
        </div>
      </section>

      <Marquee items={marquee(loc?.where ?? null)} />

      <section id="poveste" className={styles['dn-section']} data-css={"dn-section"}>
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

      <section id="comunitate" className={styles['dn-section']} data-css={"dn-section"}>
        <div className={styles['dn-container']} data-css={"dn-container"}>
          <div className={styles['dn-section-head']} data-css={"dn-section-head"}>
            <span className={styles['dn-section-num'] + ' ' + shared3['e3-title-num']} data-css={"dn-section-num e3-title-num"}>{nr('comunitate')}</span>
            <h2 className={shared3['e3-title']} data-css={"e3-title"}>Comunitatea</h2>
          </div>
          <ul className={styles.activitati}>
            {ACTIVITATI.map((activitate) => (
              <li key={activitate.href}>
                <h3>{activitate.titlu}</h3>
                <p>{activitate.text}</p>
                <a href={activitate.href}>{activitate.link} →</a>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section id="antrenament" className={styles['dn-section']} data-css={"dn-section"}>
        <div className={styles['dn-container']} data-css={"dn-container"}>
          <div className={styles['dn-section-head']} data-css={"dn-section-head"}>
            <span className={styles['dn-section-num'] + ' ' + shared3['e3-title-num']} data-css={"dn-section-num e3-title-num"}>{nr('antrenament')}</span>
            <h2 className={shared3['e3-title']} data-css={"e3-title"}>Cum arată un antrenament</h2>
          </div>
          <div className={styles.layout4}>
            {ETAPE.map((e) => (
              // Stilurile stau în `.dn-step` (DespreNoiPage.module.css), NU inline: inline ar
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

      <section id="prima-vizita" className={styles['dn-section']} data-css="dn-section">
        <div className={styles['dn-container']}>
          <div className={styles['dn-section-head']} data-css="dn-section-head">
            <span className={styles['dn-section-num']} data-css="dn-section-num">{nr('vizita')}</span>
            <h2 className={shared3['e3-title']}>Prima vizită</h2>
          </div>
          <div className={styles.intrebari}>
            <details open>
              <summary>Cum rezerv o probă?</summary>
              <p>Când înscrierile sunt deschise, apasă „Aleg ziua în Telegram”. În conversația privată cu botul apeși Start, citești condițiile, îți scrii numele și alegi o sesiune. Confirmarea și mesajul de reamintire vin în aceeași conversație.</p>
            </details>
            <details>
              <summary>Ce fac dacă mi se schimbă programul?</summary>
              <p>Revino la confirmarea din Telegram. De acolo poți anula rezervarea și alege o altă zi disponibilă.</p>
            </details>
            <details>
              <summary>Cum intru în grup după probă?</summary>
              <p>După ce organizatorul confirmă că ai participat, botul te întreabă dacă vrei să continui. Dacă alegi „Da, vreau să continui”, botul verifică cererea și îți trimite invitația în grupul de antrenament.</p>
            </details>
          </div>
          {proba.config
            ? <TrialTraining config={proba.config} embedded />
            : proba.gata && <p className={styles.disponibilitate}>Programul probelor nu este disponibil momentan. <a href="#informatii">Ține-mă la curent</a></p>}
        </div>
      </section>

      <section id="program" className={styles['dn-section']} data-css={"dn-section"}>
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
              Lasă-ne datele tale și îți scriem când organizăm următorul antrenament deschis.
            </p>
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

      </main>

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
        <a className={styles['dn-footer-link']} data-css={"dn-footer-link"} href="/antrenament">
          Antrenamentul săptămânii →
        </a>
      </footer>
    </div>
  );
};
