import { useCallback, useState } from 'react';
import { incarcaSala, refuzSala, MESAJE_REFUZ, type SalaDate } from '../../lib/salaApi';
import { useAdminResource } from '../useAdminResource';
import { useSesiuneAdmin } from '../adminSession';
import { logClientError } from '../../lib/monitoring';
import { isNetworkOrCspError, isTimeoutError } from '../../lib/supabase';

const NU_STIM =
  'Nu știm dacă a ajuns: legătura cu serverul s-a întrerupt. Verifică pe ecran (sau în „Ultimele comenzi") înainte să reîncerci.';

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
 * și reîncarcă blocul, ca ecranul să arate starea de după. Ecranul rămâne
 * „ocupat" până ajung datele noi: altfel, butoanele se deblochează peste starea
 * veche, iar un formular golit după salvare arată o clipă valorile de dinainte.
 *
 * O eroare pe care serverul n-o numește se trimite în monitorizare. Dacă e de
 * rețea, nu știm dacă scrierea a ajuns: toastul spune să verifici înainte să
 * reîncerci, ca o comandă pentru bot să nu plece de două ori.
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
        if (motiv) {
          showToast({ kind: 'error', msg: MESAJE_REFUZ[motiv] });
        } else {
          logClientError('sala-scriere', err);
          showToast({
            kind: 'error',
            msg: isNetworkOrCspError(err) || isTimeoutError(err) ? NU_STIM : 'Nu s-a putut salva. Încearcă din nou.',
          });
        }
      }
      return false;
    } finally {
      await reincarca();
      setOcupat(false);
    }
  };

  return { date, eroare, ocupat, fa, reincarca };
};
