import type { CSSProperties, ReactNode, Ref } from 'react';
import { INSTAGRAM_URL } from '../../lib/config';
import { downloadEventIcs, shareSignup } from '../../lib/calendar';
import type { EventConfig } from '../../content/eventConfig';
import { label, inputStyle, fieldErr, ctaSmall } from './shared';

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
  'Toate locurile sunt ocupate momentan. Te contactăm pe email sau telefon imediat ce se eliberează un loc — în ordinea înscrierii.';
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
        'Perioada de înscriere s-a încheiat. Scrie-ne pe Instagram — dacă se eliberează un loc, te anunțăm.',
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
  <label style={{ display: 'grid', gap: 8 }}>
    <span style={label}>{eticheta}</span>
    <input
      ref={campRef}
      className="e3-input"
      name={nume}
      type={tip}
      inputMode={inputMode}
      placeholder={placeholder}
      autoComplete={autoComplete}
      style={{ ...inputStyle, borderColor: eroare ? 'var(--e3-danger)' : 'var(--e3-border)' }}
    />
    {eroare && <span style={fieldErr}>{mesajEroare}</span>}
  </label>
);

/**
 * Bifa de acord. Cele două suprafețe o desenează cu 2px diferență, pentru că
 * formularul de sine stătător stă pe o coloană mai lată.
 */
export const BifaAcord = ({
  eroare = false,
  onClear,
  marime,
  margineSus,
}: {
  eroare?: boolean;
  onClear: () => void;
  marime: number;
  margineSus: string;
}) => (
  <>
    <label
      style={{ display: 'flex', gap: 12, alignItems: 'flex-start', cursor: 'pointer' }}
      onChange={onClear}
    >
      <input
        name="acord"
        type="checkbox"
        style={{
          width: marime,
          height: marime,
          margin: margineSus,
          accentColor: 'var(--e3-accent)',
          cursor: 'pointer',
          outline: `2px solid ${eroare ? 'var(--e3-danger)' : 'transparent'}`,
          outlineOffset: 2,
        }}
      />
      <span
        style={{ fontSize: 14, lineHeight: 1.5, color: eroare ? 'var(--e3-danger)' : 'var(--e3-muted)' }}
      >
        {TEXT_ACORD}
      </span>
    </label>
    {eroare && <span style={fieldErr}>{TEXT_ACORD_EROARE}</span>}
  </>
);

/** Butonul de trimitere; textul se schimbă când înscrierea intră pe listă. */
export const ButonTrimite = ({
  peListaDeAsteptare,
  marginTop,
}: {
  peListaDeAsteptare: boolean;
  marginTop: number;
}) => (
  <button
    type="submit"
    className="e3-submit e3-shine"
    style={{
      background: 'var(--e3-accent)',
      color: 'var(--e3-bg)',
      border: 'none',
      cursor: 'pointer',
      fontFamily: 'Anton, sans-serif',
      fontSize: 20,
      letterSpacing: 1.5,
      textTransform: 'uppercase',
      padding: 18,
      marginTop,
    }}
  >
    {peListaDeAsteptare ? 'Intră pe lista de așteptare' : 'Trimite înscrierea'}
  </button>
);

/* ---------- Ilustrațiile de stare ---------- */

/** Cercul care se învârte, cât timp înscrierea e pe drum. */
export const Rotitor = () => (
  <div
    style={{
      width: 52,
      height: 52,
      border: '4px solid var(--e3-border)',
      borderTopColor: 'var(--e3-accent)',
      borderRadius: '50%',
      animation: 'e3-spin 0.8s linear infinite',
    }}
  />
);

/** Bifa de succes: cercul care pulsează o dată, apoi linia care se desenează. */
export const BifaSucces = () => (
  <div style={{ position: 'relative', width: 84, height: 84, display: 'grid', placeItems: 'center' }}>
    <div
      style={{
        position: 'absolute',
        inset: 0,
        borderRadius: '50%',
        border: '2px solid var(--e3-accent)',
        animation: 'e3-ring-pulse 1.6s ease-out 0.4s 3',
      }}
    />
    <div
      style={{
        width: 84,
        height: 84,
        background: 'var(--e3-accent)',
        borderRadius: '50%',
        display: 'grid',
        placeItems: 'center',
        animation: 'e3-pop-in 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)',
      }}
    >
      <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
        <path
          d="M10 23 L19 32 L34 13"
          stroke="var(--e3-bg)"
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            strokeDasharray: 40,
            strokeDashoffset: 40,
            animation: 'e3-draw-check 0.5s ease-out 0.35s forwards',
          }}
        />
      </svg>
    </div>
  </div>
);

/** Cercul roșu cu „✕", pentru starea de eroare. */
export const IconEroare = () => (
  <div
    style={{
      width: 84,
      height: 84,
      background: 'var(--e3-danger-bg)',
      borderRadius: '50%',
      display: 'grid',
      placeItems: 'center',
      animation: 'e3-pop-in 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)',
    }}
  >
    <span style={{ fontSize: 38, fontWeight: 700, color: 'var(--e3-danger)' }}>✕</span>
  </div>
);

/* ---------- Acțiunile de după succes ---------- */

/**
 * Calendarul și distribuirea. Nu apar pe lista de așteptare: n-ai ce pune în
 * calendar până nu se eliberează un loc.
 */
export const ActiuniSucces = ({ config }: { config: EventConfig }) => (
  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
    <button type="button" onClick={() => downloadEventIcs(config)} style={ctaSmall}>
      Adaugă în calendar
    </button>
    <button
      type="button"
      onClick={() => void shareSignup(config)}
      style={{
        ...ctaSmall,
        background: 'transparent',
        border: '1px solid var(--e3-accent)',
        color: 'var(--e3-accent)',
      }}
    >
      Distribuie
    </button>
  </div>
);

/** „Înscrie altă persoană" — readuce formularul gol. */
export const ButonReset = ({
  peListaDeAsteptare,
  onClick,
  marginTop = 0,
}: {
  peListaDeAsteptare: boolean;
  onClick: () => void;
  marginTop?: number;
}) => (
  <button
    type="button"
    className="e3-ghost"
    onClick={onClick}
    style={{
      background: 'transparent',
      border: '1px solid var(--e3-border)',
      color: 'var(--e3-muted)',
      cursor: 'pointer',
      fontFamily: 'Archivo, sans-serif',
      fontSize: 13,
      fontWeight: 600,
      letterSpacing: 2,
      textTransform: 'uppercase',
      padding: '12px 24px',
      marginTop,
    }}
  >
    {peListaDeAsteptare ? 'Adaugă altă persoană' : 'Înscrie altă persoană'}
  </button>
);

/**
 * „Încearcă din nou" — curăță erorile și readuce formularul.
 *
 * `stil` nu e un prop de comoditate: cele două suprafețe chiar desenează butonul
 * altfel (secțiunea răsfiră literele la 1.5, formularul la 1, moștenit din
 * `ctaSmall`). Un singur stil impus aici ar fi fost o schimbare vizuală
 * strecurată într-un refactor.
 */
export const ButonReincearca = ({
  onClick,
  stil,
}: {
  onClick: () => void;
  stil?: CSSProperties;
}) => (
  <button
    type="button"
    className="e3-retry"
    onClick={onClick}
    style={{ ...ctaSmall, fontSize: 17, padding: '14px 32px', ...stil }}
  >
    Încearcă din nou
  </button>
);

/** Linkul spre Instagram de pe ecranul „închis". */
export const LinkContact = ({ stil }: { stil: CSSProperties }) => (
  <a
    href={INSTAGRAM_URL}
    target="_blank"
    rel="noopener noreferrer"
    className="e3-cta"
    style={{ ...stil, textDecoration: 'none', display: 'inline-block' }}
  >
    {TEXT_CONTACT}
  </a>
);

/** Bara de segmente care arată cât s-a ocupat din ediție. */
export const BaraLocuri = ({
  total,
  ocupate,
  gap,
  animat,
}: {
  total: number;
  ocupate: number;
  gap: number;
  /** Pe landing segmentele se umplu în lanț; în formular apar dintr-o dată. */
  animat: boolean;
}) => (
  <div style={{ display: 'flex', gap }} aria-hidden="true">
    {Array.from({ length: total }, (_, i) => {
      const pline = i < ocupate;
      return (
        <div
          key={i}
          // Doar segmentele ocupate se umplu în lanț; cele goale sunt fundal,
          // n-au ce anunța. `--i` dă decalajul din CSS.
          className={pline && animat ? 'e3-slot-fill' : undefined}
          style={{
            height: 8,
            flex: 1,
            background: pline ? 'var(--e3-accent)' : 'var(--e3-border)',
            ...(pline && animat ? ({ '--i': i } as CSSProperties) : null),
          }}
        />
      );
    })}
  </div>
);

/** Antetul barei de locuri: eticheta și contorul. */
export const AntetLocuri = ({ children }: { children: ReactNode }) => (
  <div
    style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      gap: 16,
      flexWrap: 'wrap',
    }}
  >
    <span
      style={{
        fontSize: 13,
        fontWeight: 600,
        letterSpacing: 2,
        textTransform: 'uppercase',
        color: 'var(--e3-muted)',
      }}
    >
      Locuri rămase
    </span>
    {children}
  </div>
);
