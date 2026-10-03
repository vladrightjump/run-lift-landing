import { useCallback, useState } from 'react';
import { incarcaSala, refuzSala, MESAJE_REFUZ, type SalaDate } from '../../lib/salaApi';
import { useAdminResource } from '../useAdminResource';
import { useSesiuneAdmin } from '../adminSession';

/**
 * Datele grupului de antrenament, ținute proaspete, plus o singură cale de a
 * scrie în ele.
 *
 * Toate cele patru ecrane citesc același bloc (KTD2). Se reîmprospătează ca
 * restul adminului, la 15 secunde: voturile din grup apar singure pe ecranul
 * „Prezențe", fără reîncărcare.
 *
 * `fa` e drumul comun pentru scrieri: cheamă serverul, spune în toast ce s-a
 * întâmplat — cu motivul serverului tradus, nu cu un „a apărut o eroare" —
 * și reîncarcă blocul, ca ecranul să arate starea de după.
 */
export const useSala = () => {
  const { token, onAuthError, showToast } = useSesiuneAdmin();
  const incarca = useCallback(
    (t: string, signal: AbortSignal) => incarcaSala(t, signal),
    []
  );
  const { date, eroare, reincarca } = useAdminResource<SalaDate>(incarca);
  const [ocupat, setOcupat] = useState(false);

  const fa = async (actiune: (token: string) => Promise<unknown>, reusit: string): Promise<boolean> => {
    setOcupat(true);
    try {
      await actiune(token);
      showToast({ kind: 'success', msg: reusit });
      return true;
    } catch (err) {
      if (!onAuthError(err)) {
        const motiv = refuzSala(err);
        showToast({
          kind: 'error',
          msg: motiv ? MESAJE_REFUZ[motiv] : 'Nu s-a putut salva. Încearcă din nou.',
        });
      }
      return false;
    } finally {
      setOcupat(false);
      reincarca();
    }
  };

  return { date, eroare, ocupat, fa, reincarca };
};
