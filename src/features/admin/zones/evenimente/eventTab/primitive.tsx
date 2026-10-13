import shared1 from '../EvenimenteStyles.module.css';
import styles from './primitive.module.css';
import { createContext, useContext, useId, useState } from 'react';
import type { ReactNode } from 'react';
import type { Reper } from '../reperele';

/**
 * Cât ține o publicare, formularul e inert.
 *
 * `publicaCiorna` închide dialogul pe prima linie, iar cele două apeluri await
 * țin documentul pe care l-au capturat. Un câmp rămas viu ar însemna că poți
 * tasta în timpul dus-întorsului: s-ar publica instantaneul vechi ȘI s-ar
 * anunța succesul — exact divergența dintre ecran și site pe care tabul o
 * închide.
 *
 * Context, nu prop: `Camp` e un component separat, iar altfel fiecare dintre
 * cele optsprezece câmpuri ar căra aceeași valoare de mână.
 */
export const Blocat = createContext(false);

/**
 * O secțiune a formularului, pliabilă, cu rezumat pe capac.
 *
 * De ce pliabilă: cele șase grupuri însemnau douăzeci de câmpuri deschise
 * simultan, pe două ecrane și jumătate. Organizatorul vine însă să schimbe un
 * lucru — ora, locul, capacitatea — nu douăzeci. Cu grupurile închise, tot
 * documentul încape într-un ecran, iar cel deschis e cel la care lucrezi.
 *
 * `rezumat` e ce ține locul câmpurilor când grupul e închis. Fără el, plierea
 * ar ascunde informația în loc s-o comprime, iar organizatorul ar fi nevoit să
 * deschidă fiecare grup ca să verifice ce a pus.
 *
 * Un grup cu erori se deschide singur și rămâne deschis: o problemă ascunsă
 * sub un capac e o problemă pe care „Publică" o raportează fără să arate unde.
 */
export const Grup = ({
  titlu,
  ajutor,
  rezumat,
  areEroare = false,
  deschisImplicit = false,
  children,
}: {
  titlu: string;
  ajutor?: string;
  rezumat?: ReactNode;
  areEroare?: boolean;
  deschisImplicit?: boolean;
  children: ReactNode;
}) => {
  const [deschisManual, setDeschisManual] = useState(deschisImplicit);
  const deschis = deschisManual || areEroare;
  const idCorp = useId();

  return (
    <section className={`admin-config-grup${deschis ? ' deschis' : ''}${areEroare ? ' invalid' : ''}`} data-css={`admin-config-grup${deschis ? ' deschis' : ''}${areEroare ? ' invalid' : ''}`}>
      <button
        type="button"
        className={styles['admin-config-grup-cap']} data-css="admin-config-grup-cap"
        aria-expanded={deschis}
        // `aria-expanded` singur spune „e deschis" fără să spună CE e deschis.
        aria-controls={idCorp}
        onClick={() => setDeschisManual((v) => !v)}
      >
        <span className={styles['admin-config-grup-sageata']} data-css="admin-config-grup-sageata" aria-hidden="true">
          {deschis ? '▾' : '▸'}
        </span>
        <span className={styles['admin-config-grup-titlu']} data-css="admin-config-grup-titlu">{titlu}</span>
        {!deschis && rezumat && <span className={styles['admin-config-grup-rezumat']} data-css="admin-config-grup-rezumat">{rezumat}</span>}
        {areEroare && <span className="admin-tab-alert" data-css="admin-tab-alert">!</span>}
      </button>
      {deschis && (
        <div className={styles['admin-config-grup-corp']} data-css="admin-config-grup-corp" id={idCorp}>
          {ajutor && <p className="admin-config-hint" data-css="admin-config-hint">{ajutor}</p>}
          <div className={shared1['admin-config-grup-campuri']} data-css="admin-config-grup-campuri">{children}</div>
        </div>
      )}
    </section>
  );
};

/** Ce primește controlul din interiorul unui `Camp`, gata de împrăștiat pe el. */
export type ControlCamp = {
  id: string;
  'aria-describedby'?: string;
  'aria-invalid'?: true;
  autoComplete: 'off';
  disabled?: true;
};

/**
 * Un câmp: etichetă, control, și — sub el — explicația, ecoul sau eroarea.
 *
 * `ecou` e confirmarea a ceea ce tocmai s-a ales, scrisă cu litere („sâmbătă,
 * 22 august 2026 · peste 3 luni”). Eroarea îl înlocuiește: cât timp valoarea e
 * invalidă, n-are ce confirma.
 *
 * Controlul vine ca funcție, nu ca element: eticheta e legată prin `htmlFor`,
 * iar ajutorul și eroarea prin `aria-describedby`. Un `<label>` care le-ar
 * înveli pe toate ar lipi și explicația de NUMELE accesibil al inputului —
 * cititorul de ecran ar anunța „Numărul ediției Ediția la care se înscrie lumea
 * acum" în loc de „Numărul ediției", iar `getByLabelText` n-ar mai găsi câmpul.
 */
export const Camp = ({
  eticheta,
  cheie,
  ajutor,
  eroare,
  atentie,
  ecou,
  children,
}: {
  eticheta: string;
  /**
   * Cheia câmpului din validare (`venue.mapQuery`, `slots.total`), stampilată
   * ca `data-camp`.
   *
   * Rostul ei: indicatorul „N câmpuri de reparat" din bară trebuie să ducă LA
   * câmpul vinovat. Id-ul controlului vine din `useId()`, deci nu e ghicibil
   * din afară, iar o hartă cheie→id ținută în tab ar fi fost un al doilea
   * vocabular de întreținut. Cheia e aceeași cu `CampInvalid.camp`.
   */
  cheie?: string;
  ajutor?: string;
  eroare?: string;
  /**
   * Valoarea e acceptabilă, dar consecința ei nu e cea așteptată.
   *
   * Separat de `eroare` pentru că nu blochează nimic, și de `ecou` pentru că
   * nu confirmă nimic. Un anunț cu momentul deja trecut e un document perfect
   * valid — doar că homepage-ul nu va sta pe Coming Soon, oricât ai apăsa
   * comutatorul. Marcat `status`, nu `alert`: cere atenție, nu o acțiune acum.
   */
  atentie?: string;
  ecou?: ReactNode;
  children: (control: ControlCamp) => ReactNode;
}) => {
  const id = useId();
  const idAjutor = `${id}-ajutor`;
  const idEroare = `${id}-eroare`;
  const idAtentie = `${id}-atentie`;
  const blocat = useContext(Blocat);
  // Eroarea prima: e cea care cere o acțiune acum.
  const descrieri = [eroare && idEroare, atentie && idAtentie, ajutor && idAjutor]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={`admin-config-camp${eroare ? ' invalid' : ''}${atentie ? ' atentie' : ''}`} data-css={`admin-config-camp${eroare ? ' invalid' : ''}${atentie ? ' atentie' : ''}`}
      data-camp={cheie}
    >
      <label className="admin-config-eticheta" data-css="admin-config-eticheta" htmlFor={id}>
        {eticheta}
      </label>
      {children({
        id,
        'aria-describedby': descrieri || undefined,
        'aria-invalid': eroare ? true : undefined,
        // Niciun câmp de aici nu e dată personală. Autocompletarea browserului
        // n-are ce oferi, dar poate acoperi valoarea reală cu una veche.
        autoComplete: 'off',
        disabled: blocat || undefined,
      })}
      {eroare ? (
        <span id={idEroare} className={shared1['admin-config-eroare']} data-css="admin-config-eroare" role="alert">
          {eroare}
        </span>
      ) : (
        ecou && <span className="admin-config-ecou" data-css="admin-config-ecou">{ecou}</span>
      )}
      {atentie && (
        <span id={idAtentie} className={styles['admin-config-atentie']} data-css="admin-config-atentie" role="status">
          {atentie}
        </span>
      )}
      {ajutor && (
        <span id={idAjutor} className="admin-config-ajutor" data-css="admin-config-ajutor">
          {ajutor}
        </span>
      )}
    </div>
  );
};

/**
 * Desfășurarea ediției, ca linie de timp.
 *
 * Cele șase momente stăteau în șase câmpuri separate, fiecare corect în sine,
 * niciunul spunând vreodată în ce relație e cu celelalte. Dar întrebarea pe
 * care organizatorul o are deschisă cât timp completează formularul nu e „ce
 * scrie în câmpul ăsta" — e „se ține totul în ordine?". Șase datetime-uri
 * ISO n-o pot răspunde: două date la trei zile distanță arată la fel cu două
 * la trei luni, iar o zi a săptămânii greșită arată identic cu una corectă.
 *
 * Puse în ordinea în care se întâmplă, cu distanța față de start scrisă cu
 * litere, răspunsul e citit dintr-o privire. Ordinea e a momentelor, nu a
 * câmpurilor: dacă anunțul cade după deadline, se vede pentru că sare din
 * locul lui, nu pentru că o regulă spune că a sărit.
 *
 * Include și „se termină cursa" — `start + durata` — care nu are câmp propriu
 * dar e reperul ce comută homepage-ul pe countdown. Până acum era complet
 * invizibil în admin.
 */
export const LinieDeTimp = ({ repere }: { repere: Reper[] }) => {
  if (repere.length === 0) return null;

  return (
    <ol className={styles['admin-cronologie']} data-css="admin-cronologie" aria-label="Desfășurarea ediției">
      {repere.map((r) => (
        <li
          key={r.id}
          className={[
            (styles['admin-cronologie-reper']),
            r.cheie === 'start' ? 'start' : '',
            r.trecut ? 'trecut' : '',
            r.semnal ? 'problema' : '',
          ]
            .filter(Boolean)
            .join(' ')} data-css={[
            'admin-cronologie-reper',
            r.cheie === 'start' ? 'start' : '',
            r.trecut ? 'trecut' : '',
            r.semnal ? 'problema' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <span className={styles['admin-cronologie-punct']} data-css="admin-cronologie-punct" aria-hidden="true" />
          <span className={styles['admin-cronologie-nume']} data-css="admin-cronologie-nume">{r.eticheta}</span>
          <span className={styles['admin-cronologie-cand']} data-css="admin-cronologie-cand">{r.cand}</span>
          {/* Flagul scurt, nu consecința pe larg: linia se citește dintr-o
              privire, iar explicația stă pe câmpul unde se și repară. */}
          <span className={styles['admin-cronologie-fata']} data-css="admin-cronologie-fata">{r.semnal ?? r.fataDeStart}</span>
        </li>
      ))}
    </ol>
  );
};
