import { useMutation } from '@tanstack/react-query';
import { loadPublicHomepage } from '../../../../shared/lib/homepagePublic';
import { usePublicQuery } from '../../../../shared/lib/usePublicQuery';
import { GrupRadio } from '../../../../shared/ui/GrupRadio';
import adminStyles from '../../components/AdminStyles.module.css';
import adminRoot from '../../components/RadacinaAdmin.module.css';
import { useSesiuneAdmin } from '../../data/adminSession';
import { setHomepageGiveaway } from './api';

const OPTIUNI = [
  { valoare: 'vizibil', eticheta: 'Afișat' },
  { valoare: 'ascuns', eticheta: 'Ascuns' },
] as const;

export const AdminGiveawayVisibility = () => {
  const { token, onAuthError, showToast } = useSesiuneAdmin();
  const homepage = usePublicQuery('homepage', loadPublicHomepage);
  const salvare = useMutation({
    networkMode: 'always',
    mutationFn: (vizibil: boolean) => setHomepageGiveaway(token, vizibil),
    onSuccess: async (_, vizibil) => {
      await homepage.refresh();
      showToast({ kind: 'success', msg: vizibil ? 'Butonul Giveaway este afișat.' : 'Butonul Giveaway este ascuns.' });
    },
    onError: (err) => {
      if (!onAuthError(err)) showToast({ kind: 'error', msg: 'Nu am putut salva vizibilitatea. Încearcă din nou.' });
    },
  });

  return (
    <div className={adminStyles['admin-config-grup']} data-css="admin-config-grup">
      {homepage.isError ? (
        <p className={adminStyles['admin-config-hint']} data-css="admin-config-hint" role="status">
          Nu s-a putut citi vizibilitatea butonului.{' '}
          <button type="button" className={adminRoot['admin-btn-ghost']} onClick={() => void homepage.refresh()}>
            Reîncearcă
          </button>
        </p>
      ) : homepage.data ? (
        <GrupRadio
          eticheta="Butonul Giveaway pe pagina principală"
          valoare={homepage.data.value.giveawayVisible ? 'vizibil' : 'ascuns'}
          optiuni={[...OPTIUNI]}
          onSchimba={(alegere) => salvare.mutate(alegere === 'vizibil')}
          dezactivat={salvare.isPending || homepage.isFetching}
        />
      ) : (
        <p className={adminStyles['admin-config-hint']} data-css="admin-config-hint" role="status">
          Se încarcă vizibilitatea butonului Giveaway…
        </p>
      )}
    </div>
  );
};
