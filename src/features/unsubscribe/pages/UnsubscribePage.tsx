import { useEditionStrings } from '../../../hooks/useEventConfig';
import { CadruScurt } from '../../../shared/ui/CadruScurt';
import { RezultatLink, type Rezultat } from '../../../shared/ui/RezultatLink';
import { useLinkDinEmail } from '../../../shared/lib/useLinkDinEmail';
import { unsubscribe, type UnsubResult } from '../data/api';

const CONTINUT: Record<UnsubResult | 'eroare', Rezultat> = {
  dezabonat: {
    titlu: 'Te-am dezabonat',
    text: 'Nu îți mai trimitem emailuri în masă. Confirmările tranzacționale (ex. înscriere) pot totuși ajunge.',
    ok: true,
  },
  deja_dezabonat: {
    titlu: 'Erai deja dezabonat',
    text: 'Adresa ta era deja scoasă de pe listă. Nu trebuie să faci nimic.',
    ok: true,
  },
  invalid: {
    titlu: 'Link invalid',
    text: 'Linkul de dezabonare nu (mai) e valabil. Dacă tot primești emailuri nedorite, scrie-ne pe Instagram.',
    ok: false,
  },
  eroare: {
    titlu: 'Nu am putut procesa',
    text: 'A apărut o problemă de conexiune. Reîncarcă pagina sau încearcă din nou în câteva minute.',
    ok: false,
  },
};

export const UnsubscribePage = () => {
  const { LAUNCH_EDITION_ORDINAL } = useEditionStrings();
  const stare = useLinkDinEmail('dezabonare', unsubscribe);

  return (
    <CadruScurt meta={<>Run + Lift · Ediția {LAUNCH_EDITION_ORDINAL}</>}>
      {stare === 'incarca' ? <p className="cs-sub">Procesăm cererea…</p> : <RezultatLink {...CONTINUT[stare]} />}
    </CadruScurt>
  );
};
