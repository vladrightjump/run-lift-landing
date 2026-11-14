import styles from './GiveawayPage.module.css';
import { useState } from 'react';
import { INSTAGRAM_URL } from '../../../shared/lib/config';
import { momentComplet } from '../../../shared/lib/formatare';
import { usePublicQuery } from '../../../shared/lib/usePublicQuery';
import { GiveawayForm } from '../components/GiveawayForm';
import { continutGiveaway, type ContinutGiveaway } from '../content';
import { loadPublicGiveaway, type GiveawayPublic } from '../data/api';

/**
 * Pagina giveaway-ului de pe Instagram: unde ajunge linkul din bio și din story.
 *
 * Nu ține de nicio ediție, deci stă în afara `EventConfigProvider`, ca
 * `/despre-noi` și `/antrenament`, și își citește singură RPC-ul.
 *
 * Două surse, cu roluri diferite:
 *  • baza de date spune CARE e giveaway-ul curent și în ce stare e
 *    (`public_giveaway()`), fiindcă tot ea refuză înscrierile din afara perioadei;
 *  • codul spune CE scrie pe pagină (`content.ts`), sub același `slug`.
 * Un `slug` fără texte arată „niciun giveaway activ", la fel ca lipsa oricărui
 * giveaway.
 */
export const GiveawayPage = () => {
  const cerere = usePublicQuery('giveaway', loadPublicGiveaway);
  const giveaway = cerere.data?.value ?? null;
  const continut = giveaway ? continutGiveaway(giveaway.slug) : null;

  return (
    <div className={styles['gw-root']} data-css="gw-root">
      <header className={styles['gw-topbar']} data-css="gw-topbar">
        <a className={styles['gw-logo']} data-css="gw-logo" href="/">
          Run <span className={styles['gw-accent']}>+</span> Lift
        </a>
      </header>

      <main className={styles['gw-main']} data-css="gw-main">
        {cerere.isPending ? (
          <p className={styles['gw-loading']} data-css="gw-loading" aria-busy="true">
            Se încarcă…
          </p>
        ) : cerere.isError ? (
          <div className={styles['gw-empty']} data-css="gw-empty" role="alert">
            <h1>Nu am putut încărca giveaway-ul</h1>
            <p>Verifică conexiunea și încearcă din nou.</p>
            <button type="button" className={styles['gw-retry']} onClick={() => void cerere.refresh()}>
              Încearcă din nou
            </button>
          </div>
        ) : giveaway && continut ? (
          <Giveaway giveaway={giveaway} continut={continut} />
        ) : (
          <div className={styles['gw-empty']} data-css="gw-empty">
            <h1>Momentan nu avem niciun giveaway activ</h1>
            <p>Următorul îl anunțăm pe Instagram. Urmărește-ne ca să afli primul.</p>
            <a className={styles['gw-link']} href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer">
              Deschide Instagram
            </a>
            <a className={styles['gw-link']} href="/">
              Înapoi la pagina principală
            </a>
          </div>
        )}
      </main>

      <footer className={styles['gw-footer']} data-css="gw-footer">
        Run <span className={styles['gw-accent']}>+</span> Lift
      </footer>
    </div>
  );
};

const Giveaway = ({ giveaway, continut }: { giveaway: GiveawayPublic; continut: ContinutGiveaway }) => {
  // Serverul a refuzat o trimitere fiindcă giveaway-ul s-a închis cât pagina
  // stătea deschisă. Starea citită la încărcare a rămas în urmă.
  const [inchisLaTrimitere, setInchisLaTrimitere] = useState(false);
  const stare = inchisLaTrimitere ? 'inchis' : giveaway.stare;

  return (
    <>
      <section className={styles['gw-hero']} data-css="gw-hero">
        <p className={styles['gw-kicker']}>Giveaway</p>
        <h1 className={styles['gw-title']}>{continut.titlu}</h1>
        <p className={styles['gw-prize']}>{continut.premiu}</p>
        <div className={styles['gw-sponsor']} data-css="gw-sponsor">
          <span>Împreună cu</span>
          <img src={continut.sponsor.logo} alt={continut.sponsor.nume} />
          <span className={styles['gw-sponsor-name']}>{continut.sponsor.nume}</span>
        </div>
        <p className={styles['gw-period']} data-css="gw-period">
          Înscrieri: {momentComplet(giveaway.starts_at)} – {momentComplet(giveaway.ends_at)}
        </p>
      </section>

      <div className={styles['gw-grid']} data-css="gw-grid">
        <section className={styles['gw-how']} data-css="gw-how">
          <h2>Cum participi</h2>
          <ol>
            {continut.conditii.map((conditie) => (
              <li key={conditie}>{conditie}</li>
            ))}
            <li>Completează formularul de pe această pagină, o singură dată.</li>
          </ol>
        </section>

        <section className={styles['gw-entry']} data-css="gw-entry" id="inscriere">
          {stare === 'programat' && (
            <div className={styles['gw-notice']} data-css="gw-notice">
              <h2>Încă puțin</h2>
              <p>Înscrierile încep pe {momentComplet(giveaway.starts_at)}.</p>
            </div>
          )}
          {stare === 'deschis' && (
            <GiveawayForm sfarsit={giveaway.ends_at} onInchis={() => setInchisLaTrimitere(true)} />
          )}
          {stare === 'inchis' && (
            <div className={styles['gw-notice']} data-css="gw-notice">
              <h2>Înscrierile s-au încheiat</h2>
              <p>Câștigătorul e anunțat pe pagina noastră de Instagram.</p>
            </div>
          )}
        </section>
      </div>

      <section className={styles['gw-rules']} data-css="gw-rules" id="regulament">
        <h2>Regulament</h2>
        {continut.regulament.map((sectiune) => (
          <div className={styles['gw-rule']} key={sectiune.titlu}>
            <h3>{sectiune.titlu}</h3>
            {sectiune.paragrafe.map((paragraf) => (
              <p key={paragraf}>{paragraf}</p>
            ))}
          </div>
        ))}
      </section>
    </>
  );
};
