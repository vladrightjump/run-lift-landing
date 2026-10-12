import { useEditionStrings } from '../../../hooks/useEventConfig';
import { CadruScurt } from '../../../shared/ui/CadruScurt';
import { RezultatLink, type Rezultat } from '../../../shared/ui/RezultatLink';
import { useLinkDinEmail } from '../../../shared/lib/useLinkDinEmail';
import { confirmSignup, type ConfirmResult } from '../data/api';

const CONTINUT: Record<ConfirmResult | 'eroare', Rezultat> = {
  confirmat: {
    titlu: 'Înscriere confirmată!',
    text: 'Gata, ești pe listă. Îți scriem imediat ce avem noutăți despre noul antrenament.',
    ok: true,
  },
  deja_confirmat: {
    titlu: 'Erai deja confirmat',
    text: 'Linkul a fost folosit deja, totul e în regulă. Rămâi pe listă și îți scriem cu noutățile.',
    ok: true,
  },
  invalid: {
    titlu: 'Link invalid',
    text: 'Linkul nu (mai) e valabil. Dacă tocmai te-ai înscris, verifică să fi deschis exact linkul din email sau înscrie-te din nou.',
    ok: false,
  },
  eroare: {
    titlu: 'Nu am putut verifica',
    text: 'A apărut o problemă de conexiune. Reîncarcă pagina sau încearcă din nou în câteva minute.',
    ok: false,
  },
};

export const ConfirmarePage = () => {
  const { LAUNCH_EDITION_ORDINAL } = useEditionStrings();
  const stare = useLinkDinEmail('confirmare', confirmSignup);

  return (
    <CadruScurt meta={<>Run + Lift · Ediția {LAUNCH_EDITION_ORDINAL}</>}>
      {stare === 'incarca' ? <p className="cs-sub">Verificăm linkul…</p> : <RezultatLink {...CONTINUT[stare]} />}
    </CadruScurt>
  );
};
