import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useEditionStrings, useEventConfig } from '../../../shared/lib/useEventConfig';
import { CadruScurt, TitluScurt } from '../../../shared/ui/CadruScurt';
import { RezultatLink, type Rezultat } from '../../../shared/ui/RezultatLink';
import { esteTokenValid, tokenDinAdresa } from '../../../shared/lib/token';
import { declineSpot, type DeclineResult } from '../data/api';

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

const REZULTATE: Record<DeclineResult | 'eroare', Rezultat> = {
  renuntat: {
    titlu: 'Locul e eliberat',
    text: 'Mulțumim că ne-ai spus din timp: locul tău merge acum către primul om de pe lista de așteptare. Dacă te răzgândești, scrie-ne pe Instagram; dacă mai e loc, te punem la loc.',
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

export const RenuntPage = () => {
  const { LAUNCH_EDITION_ORDINAL, EVENT_WHEN, EVENT_START_TIME, EVENT_WHERE } =
    useEditionStrings();
  const { eventName } = useEventConfig();

  // Tokenul citit o singură dată, la montare: pagina nu-l re-citește, iar starea
  // nu depinde de URL după primul cadru.
  const [token] = useState(tokenDinAdresa);
  // O mutație, nu un query: cererea pleacă doar la click, niciodată la încărcare.
  const renuntare = useMutation({ mutationFn: () => declineSpot(token), networkMode: 'always' });
  // Starea mutației se actualizează după click, nu în el; un dublu-click rapid ar
  // fi trimis două cereri. Indicatorul local blochează al doilea click pe loc.
  const [trimis, setTrimis] = useState(false);

  const renunta = () => {
    if (trimis) return;
    setTrimis(true);
    renuntare.mutate();
  };

  let rezultat: Rezultat | null = null;
  if (!esteTokenValid(token)) rezultat = REZULTATE.invalid;
  else if (renuntare.isError) rezultat = REZULTATE.eroare;
  else if (renuntare.data) rezultat = REZULTATE[renuntare.data];
  const trimite = trimis && rezultat === null;

  return (
    <CadruScurt meta={<>Run + Lift · Ediția {LAUNCH_EDITION_ORDINAL}</>}>
      {rezultat === null ? (
        <>
          <TitluScurt>Nu mai poți veni?</TitluScurt>
          <p className="cs-sub">
            Ești pe lista de participanți la <strong>{eventName}</strong>, {EVENT_WHEN}, ora{' '}
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
              disabled={trimite}
            >
              {trimite ? 'Se eliberează…' : 'Da, eliberează-mi locul'}
            </button>
          </div>
        </>
      ) : (
        <RezultatLink {...rezultat} />
      )}
    </CadruScurt>
  );
};
