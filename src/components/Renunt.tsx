import { useState } from 'react';
import { declineSpot } from '../lib/supabase';
import type { DeclineResult } from '../lib/supabase';
import { INSTAGRAM_URL, INSTAGRAM_HANDLE } from '../lib/config';
import { useEditionStrings, useEventConfig } from '../hooks/useEventConfig';

/**
 * „Nu mai pot veni" — pagina din linkul emailurilor către participanți.
 *
 * De ce e ALTFEL decât `/unsubscribe`, care își face treaba la încărcare:
 * dezabonarea e reversibilă cu o reînscriere, dar locul eliberat pleacă în
 * aceeași secundă la primul din lista de așteptare, care primește deja emailul
 * de confirmare. Nu există „undo" din partea participantului.
 *
 * Deci pagina nu atinge nimic până la un click explicit. Asta o apără și de
 * scanerele de linkuri ale providerilor de email, care deschid URL-urile din
 * mesaje ca să le verifice: dacă deschiderea ar fi fost de ajuns, oameni care
 * n-au atins nimic și-ar fi pierdut locul.
 */

type Stare = 'confirma' | 'trimite' | DeclineResult | 'eroare';

/** UUID v4 — validăm înainte să lovim serverul cu token evident greșit. */
const TOKEN_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const REZULTATE: Record<
  Exclude<Stare, 'confirma' | 'trimite'>,
  { titlu: string; text: string; ok: boolean }
> = {
  renuntat: {
    titlu: 'Locul e eliberat',
    text: 'Mulțumim că ne-ai spus din timp — locul tău merge acum către primul om de pe lista de așteptare. Dacă te răzgândești, scrie-ne pe Instagram; dacă mai e loc, te punem la loc.',
    ok: true,
  },
  deja_renuntat: {
    titlu: 'Nu mai ești pe listă',
    text: 'Locul tău era deja eliberat. Nu trebuie să faci nimic. Ne vedem la ediția următoare!',
    ok: true,
  },
  prea_tarziu: {
    titlu: 'E prea târziu pentru link',
    text: 'Cursa a început deja (sau linkul e dintr-o ediție încheiată), deci n-are ce loc mai elibera. Dacă e vorba de ediția care vine, scrie-ne pe Instagram.',
    ok: false,
  },
  invalid: {
    titlu: 'Link invalid',
    text: 'Linkul nu (mai) e valabil. Dacă nu mai poți veni, scrie-ne pe Instagram și îți eliberăm noi locul.',
    ok: false,
  },
  eroare: {
    titlu: 'Nu am putut procesa',
    text: 'A apărut o problemă de conexiune, iar locul tău a rămas neatins. Încearcă din nou în câteva minute.',
    ok: false,
  },
};

export const Renunt = () => {
  const { LAUNCH_EDITION_ORDINAL, EVENT_WHEN, EVENT_START_TIME, EVENT_WHERE } =
    useEditionStrings();
  const { eventName } = useEventConfig();

  // Tokenul citit o singură dată, la montare: pagina nu-l re-citește, iar starea
  // nu depinde de URL după primul cadru.
  const [token] = useState(
    () => new URLSearchParams(window.location.search).get('token') ?? ''
  );
  const [stare, setStare] = useState<Stare>(() => (TOKEN_RE.test(token) ? 'confirma' : 'invalid'));

  const renunta = () => {
    if (stare === 'trimite') return;
    setStare('trimite');
    declineSpot(token)
      .then(setStare)
      .catch(() => setStare('eroare'));
  };

  const rezultat = stare === 'confirma' || stare === 'trimite' ? null : REZULTATE[stare];

  return (
    <div className="cs-root">
      <div className="cs-bg" aria-hidden="true" />

      <header className="cs-topbar">
        <a className="cs-logo" href="/">
          R<span className="cs-accent">+</span>L
        </a>
        <span className="cs-brand-meta">Run + Lift · Ediția {LAUNCH_EDITION_ORDINAL}</span>
      </header>

      <main className="cs-main">
        {rezultat === null ? (
          <>
            <h1 className="cf-title">Nu mai poți veni?</h1>
            <p className="cs-sub">
              Ești pe lista de participanți la <strong>{eventName}</strong> — {EVENT_WHEN}, ora{' '}
              {EVENT_START_TIME}, la {EVENT_WHERE}.
            </p>
            {/*
              Consecința, spusă înainte de click, nu după: butonul nu doar te
              scoate din listă, ci dă locul mai departe pe loc. Cine apasă
              trebuie să știe că nu se poate întoarce singur.
            */}
            <p className="cs-sub">
              Dacă apeși mai jos, îți eliberăm locul imediat și îl primește primul om de pe lista
              de așteptare. Nu-l poți lua înapoi singur.
            </p>
            {/*
              „Rămân înscris" e primul și e cel neutru, iar eliberarea e cea
              secundară — invers decât dictează instinctul de a evidenția acțiunea
              paginii. Aici acțiunea paginii e cea ireversibilă, deci nu ea trebuie
              să fie butonul pe care cade degetul din greșeală.
            */}
            <div className="cs-actions">
              <a className="cs-cta" href="/">
                Nu, rămân înscris
              </a>
              <button
                type="button"
                className="cs-cta-secondary"
                onClick={renunta}
                disabled={stare === 'trimite'}
              >
                {stare === 'trimite' ? 'Se eliberează…' : 'Da, eliberează-mi locul'}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className={`cf-icon${rezultat.ok ? '' : ' err'}`} aria-hidden="true">
              {rezultat.ok ? '✓' : '✕'}
            </div>
            <h1 className="cf-title">{rezultat.titlu}</h1>
            <p className="cs-sub">{rezultat.text}</p>
            <a className="cs-cta" href="/">
              Înapoi la pagina principală
            </a>
          </>
        )}
      </main>

      <footer className="cs-footer">
        <span>Run + Lift · Chișinău</span>
        <a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer">
          Instagram {INSTAGRAM_HANDLE}
        </a>
      </footer>
    </div>
  );
};
