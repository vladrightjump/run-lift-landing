import { createContext, createElement, useContext, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { incarcaSala, refuzSala, MESAJE_REFUZ, type SalaDate } from './api';
import { useAdminResource } from '../../data/useAdminResource';
import { ADMIN_REFRESH_MS } from '../../data/constants';
import { useSesiuneAdmin } from '../../data/adminSession';
import { useAdminMutation } from '../../data/useAdminMutation';
import { logClientError } from '../../../../shared/lib/monitoring';
import { isNetworkOrCspError, isTimeoutError } from '../../../../shared/lib/errors';

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
const useSalaIncarcata = (activ: boolean) => {
  const { token, onAuthError, showToast } = useSesiuneAdmin();
  const client = useQueryClient();
  const { date, eroare, reincarca } = useAdminResource<SalaDate>(incarcaSala, ADMIN_REFRESH_MS, {
    queryKey: ['antrenamente', 'sala'], enabled: activ,
  });
  const scrie = useAdminMutation((actiune: (token: string) => Promise<unknown>) => actiune(token));
  const [ocupat, setOcupat] = useState(false);

  const fa = async (actiune: (token: string) => Promise<unknown>, reusit: string): Promise<boolean> => {
    setOcupat(true);
    try {
      await scrie(actiune);
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
      const queryKey = ['admin-resource', token, 'antrenamente', 'sala'];
      await client.cancelQueries({ queryKey });
      await client.invalidateQueries({ queryKey });
      setOcupat(false);
    }
  };

  return { date, eroare, ocupat, fa, reincarca };
};

type Sala = ReturnType<typeof useSalaIncarcata>;
const SalaComuna = createContext<Sala | null>(null);

/**
 * Un singur bloc al grupului pentru tot dashboardul (U8): cadrul îl citește
 * pentru numărul de pe Acum, ecranul Acum pentru săptămână și card, iar
 * ecranele grupului pentru restul. O cerere la 15 secunde, nu câte una pe
 * consumator.
 */
export const FurnizorSala = ({ children }: { children: ReactNode }) =>
  createElement(SalaComuna.Provider, { value: useSalaIncarcata(true) }, children);

/**
 * Datele grupului: din furnizorul comun, când există; altfel ecranul își
 * încarcă singur blocul (ecranele randate separat, ca în teste).
 */
export const useSala = (): Sala => {
  const comun = useContext(SalaComuna);
  const propriu = useSalaIncarcata(comun === null);
  return comun ?? propriu;
};
