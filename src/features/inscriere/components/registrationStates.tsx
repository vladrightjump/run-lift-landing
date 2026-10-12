import shared3 from '../../../shared/ui/PublicControls.module.css';
import shared1 from './RegistrationStyles.module.css';
import styles from './registrationStates.module.css';
import type { CSSProperties, ReactNode, Ref } from 'react';
import { INSTAGRAM_URL } from '../../../shared/lib/config';
import { downloadEventIcs, shareSignup } from '../../../shared/lib/calendar';
import type { EventConfig } from '../../../shared/content/eventConfig';

/**
 * Bucățile pe care le randează AMÂNDOUĂ suprafețele de înscriere: secțiunea 03
 * de pe landing (`RegistrationSection`) și formularul de sine stătător
 * (`RegistrationForm`, folosit de pagina `/inscriere` și de overlay).
 *
 * Ce s-a mutat aici e ce era identic caracter cu caracter: câmpurile, bifa de
 * acord, cele trei ilustrații de stare, textele. Ce ține de CADRUL fiecărei
 * suprafețe — grila secțiunii, rezumatul „Pe scurt", numărătoarea inversă spre
 * pagina evenimentului — a rămas la ea acasă.
 *
 * Deliberat NU e o singură componentă cu cinci prop-uri booleene care să
 * randeze ambele suprafețe: cele două chiar diferă (vezi `TITLU_SUCCES`), iar
 * un asemenea comutator ar fi schimbat duplicarea pe ceva mai greu de citit.
 */

/* ---------- Texte pe care le spun ambele suprafețe, identic ---------- */

export const TEXT_INCARCARE = 'Se trimite înscrierea…';
export const TEXT_EROARE_TITLU = 'Ceva n-a mers';
export const TEXT_EROARE_MESAJ =
  'Înscrierea nu a putut fi trimisă. Verifică conexiunea la internet și încearcă din nou.';
export const TEXT_SUCCES_ASTEPTARE =
  'Toate locurile sunt ocupate momentan. Te contactăm pe email sau telefon imediat ce se eliberează un loc, în ordinea înscrierii.';
const TEXT_ACORD =
  'Confirm că sunt apt din punct de vedere medical pentru efort fizic intens și accept regulamentul evenimentului. *';
const TEXT_ACORD_EROARE = 'Trebuie să accepți regulamentul ca să te poți înscrie.';
const TEXT_CONTACT = 'Contactează organizatorii';

/** Titlul și motivul ecranului „închis", per cauză. */
export const textInchis = (
  motiv: 'ended' | 'reg' | 'full'
): { titlu: string; mesaj: string } => {
  if (motiv === 'ended') {
    return {
      titlu: 'Evenimentul a avut loc',
      mesaj: 'Ne vedem la ediția următoare. Urmărește-ne pentru anunțuri.',
    };
  }
  if (motiv === 'reg') {
    return {
      titlu: 'Înscrierile s-au închis',
      mesaj:
        'Perioada de înscriere s-a încheiat. Scrie-ne pe Instagram: dacă se eliberează un loc, te anunțăm.',
    };
  }
  return {
    titlu: 'Locurile sunt pline',
    mesaj:
      'Toate locurile și lista de așteptare sunt ocupate. Scrie-ne pe Instagram dacă apare o disponibilitate.',
  };
};

/* ---------- Câmpurile formularului ---------- */

type CampProps = {
  nume: string;
  eticheta: string;
  tip: string;
  placeholder: string;
  autoComplete: string;
  /** Tastatura de pe telefon; formularul de sine stătător o cere, secțiunea nu. */
  inputMode?: 'tel' | 'email';
  eroare?: boolean;
  mesajEroare: string;
  /** Primul câmp primește focus la montare, pe pagina `/inscriere`. */
  campRef?: Ref<HTMLInputElement>;
};

/** Eticheta, câmpul și mesajul lui de eroare — de opt ori, până acum. */
export const CampText = ({
  nume,
  eticheta,
  tip,
  placeholder,
  autoComplete,
  inputMode,
  eroare = false,
  mesajEroare,
  campRef,
}: CampProps) => (
  <label className={styles.field1}>
    <span className={styles.text2}>{eticheta}</span>
    <input
      ref={campRef}
      className={shared1['e3-input'] + ' ' + styles.input3 + ' ' + (eroare ? styles.input3On0 : styles.input3Off0)} data-css={"e3-input"}
      name={nume}
      type={tip}
      inputMode={inputMode}
      placeholder={placeholder}
      autoComplete={autoComplete}

    />
    {eroare && <span className={styles.text4}>{mesajEroare}</span>}
  </label>
);

/**
 * Bifa de acord. Cele două suprafețe o desenează cu 2px diferență, pentru că
 * formularul de sine stătător stă pe o coloană mai lată.
 */
export const BifaAcord = ({
  eroare = false,
  onClear,
  className,
}: {
  eroare?: boolean;
  onClear: () => void;
  className: string;
}) => (
  <>
    <label
      className={styles.field5}
      onChange={onClear}
    >
      <input
        name="acord"
        type="checkbox"
        className={styles.input6 + ' ' + className + ' ' + (eroare ? styles.acordInvalid : styles.acordValid)}
      />
      <span
        className={styles.text7 + ' ' + (eroare ? styles.text7On0 : styles.text7Off0)}
      >
        {TEXT_ACORD}
      </span>
    </label>
    {eroare && <span className={styles.text8}>{TEXT_ACORD_EROARE}</span>}
  </>
);

/** Butonul de trimitere; textul se schimbă când înscrierea intră pe listă. */
export const ButonTrimite = ({
  peListaDeAsteptare,
  className,
}: {
  peListaDeAsteptare: boolean;
  className: string;
}) => (
  <button
    type="submit"
    className={styles['e3-submit'] + ' ' + shared3['e3-shine'] + ' ' + styles.button9 + ' ' + className} data-css={"e3-submit e3-shine"}
  >
    {peListaDeAsteptare ? 'Intră pe lista de așteptare' : 'Trimite înscrierea'}
  </button>
);

/* ---------- Ilustrațiile de stare ---------- */

/**
 * Cât timp înscrierea e pe drum: o bară care se umple și se golește, nu un
 * cerc care se învârte. Pagina are colțuri drepte peste tot.
 */
export const BaraIncarcare = () => <div className={styles['e3-progress-bar']} data-css={"e3-progress-bar"} aria-hidden="true" />;

/** Bifa de succes: pătratul care pulsează o dată, apoi linia care se desenează. */
export const BifaSucces = () => (
  <div className={styles.layout10}>
    <div
      className={styles.layout11}
    />
    <div
      className={styles.layout12}
    >
      <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
        <path
          d="M10 23 L19 32 L34 13"
          stroke="var(--e3-bg)"
          strokeWidth="5"
          strokeLinecap="square"
          strokeLinejoin="miter"
          className={styles.path13}
        />
      </svg>
    </div>
  </div>
);

/** Pătratul roșu cu „✕", pentru starea de eroare. */
export const IconEroare = () => (
  <div
    className={styles.layout14}
  >
    <span className={styles.text15}>✕</span>
  </div>
);

/* ---------- Acțiunile de după succes ---------- */

/**
 * Calendarul și distribuirea. Nu apar pe lista de așteptare: n-ai ce pune în
 * calendar până nu se eliberează un loc.
 */
export const ActiuniSucces = ({ config }: { config: EventConfig }) => (
  <div className={styles.layout16}>
    <button type="button" onClick={() => downloadEventIcs(config)} className={styles.button17}>
      Adaugă în calendar
    </button>
    <button
      type="button"
      onClick={() => void shareSignup(config)}
      className={styles.button18}
    >
      Distribuie
    </button>
  </div>
);

/** „Înscrie altă persoană" — readuce formularul gol. */
export const ButonReset = ({
  peListaDeAsteptare,
  onClick,
  className,
}: {
  peListaDeAsteptare: boolean;
  onClick: () => void;
  className: string;
}) => (
  <button
    type="button"
    className={shared1['e3-ghost'] + ' ' + styles.button19 + ' ' + className} data-css={"e3-ghost"}
    onClick={onClick}
  >
    {peListaDeAsteptare ? 'Adaugă altă persoană' : 'Înscrie altă persoană'}
  </button>
);

/**
 * „Încearcă din nou" — curăță erorile și readuce formularul.
 *
 * Clasele locale păstrează diferențele dintre suprafețe: cele două suprafețe chiar desenează butonul
 * altfel (secțiunea răsfiră literele la 1.5, formularul la 1, moștenit din
 * butonul mic). Un singur stil impus aici ar fi fost o schimbare vizuală
 * strecurată într-un refactor.
 */
export const ButonReincearca = ({
  onClick,
  className,
}: {
  onClick: () => void;
  className?: string;
}) => (
  <button
    type="button"
    className={styles['e3-retry'] + ' ' + styles.button20 + ' ' + (className ?? '')} data-css={"e3-retry"}
    onClick={onClick}
  >
    Încearcă din nou
  </button>
);

/** Linkul spre Instagram de pe ecranul „închis". */
export const LinkContact = ({ className }: { className: string }) => (
  <a
    href={INSTAGRAM_URL}
    target="_blank"
    rel="noopener noreferrer"
    className={shared3['e3-cta'] + ' ' + styles.link21 + ' ' + className} data-css={"e3-cta"}
  >
    {TEXT_CONTACT}
  </a>
);

/** Bara de segmente care arată cât s-a ocupat din ediție. */
export const BaraLocuri = ({
  total,
  ocupate,
  className,
  animat,
}: {
  total: number;
  ocupate: number;
  className: string;
  /** Pe landing segmentele se umplu în lanț; în formular apar dintr-o dată. */
  animat: boolean;
}) => (
  <div className={styles.layout22 + ' ' + className} aria-hidden="true">
    {Array.from({ length: total }, (_, i) => {
      const pline = i < ocupate;
      return (
        <div
          key={i}
          // Doar segmentele ocupate se umplu în lanț; cele goale sunt fundal,
          // n-au ce anunța. `--i` dă decalajul din CSS.
          className={(pline && animat ? styles['e3-slot-fill'] : undefined) + ' ' + styles.layout23 + ' ' + (pline ? styles.layout23On0 : styles.layout23Off0)} data-css={(pline && animat ? "e3-slot-fill" : undefined)}
          style={{ ...(pline && animat ? ({ '--i': i } as CSSProperties) : null) }}
        />
      );
    })}
  </div>
);

/** Antetul barei de locuri: eticheta și contorul. */
export const AntetLocuri = ({ children }: { children: ReactNode }) => (
  <div
    className={styles.layout24}
  >
    <span
      className={styles.text25}
    >
      Locuri rămase
    </span>
    {children}
  </div>
);
