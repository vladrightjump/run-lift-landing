import { useCallback, useRef, useState } from 'react';
import { useAdminPolling, ADMIN_REFRESH_MS } from './useAdminPolling';
import { useSesiuneAdmin } from './adminSession';

/**
 * O listă din backoffice, ținută proaspătă.
 *
 * `useAdminPolling` se ocupa deja de programare și de anulare, dar fiecare tab
 * își scria singur ce se întâmplă cu răspunsul — și scria de fiecare dată
 * aceleași patru lucruri: pune datele, stinge eroarea, ignoră cererea anulată,
 * lasă `onAuthError` să trateze sesiunea expirată. Patru copii, patru șanse să
 * uiți una.
 *
 * Regula pentru `loadError` e cea de dinainte, păstrată intenționat: un eșec
 * contează doar cât timp N-AI încă date. După ce lista s-a încărcat o dată, o
 * reîmprospătare picată nu golește ecranul și nu sperie organizatorul — rămâne
 * ce era, până răspunde iar serverul.
 *
 * Vezi `tests/unit/useAdminResource.test.ts`.
 */

export type ResursaAdmin<T> = {
  /** `null` cât timp n-a venit niciun răspuns bun. */
  date: T | null;
  /** Adevărat doar dacă a picat ȘI n-avem încă nimic de arătat. */
  eroare: boolean;
  /** Reîncarcă acum, anulând cererea în zbor. */
  reincarca: () => void;
};

export const useAdminResource = <T>(
  /** Stabil (`useCallback`) — identitatea lui repornește poll-ul. */
  incarca: (token: string, signal: AbortSignal) => Promise<T>,
  /** `null` = se încarcă o singură dată. Vezi `useAdminPolling`. */
  intervalMs: number | null = ADMIN_REFRESH_MS
): ResursaAdmin<T> => {
  const { token, onAuthError } = useSesiuneAdmin();
  const [date, setDate] = useState<T | null>(null);
  const [eroare, setEroare] = useState(false);
  // Citit din interiorul lui `catch`, unde `date` ar fi valoarea din randarea
  // în care s-a pornit cererea, nu cea de acum.
  const dateRef = useRef<T | null>(null);
  dateRef.current = date;

  const cere = useCallback(
    (signal: AbortSignal) => {
      incarca(token, signal)
        .then((raspuns) => {
          setDate(raspuns);
          setEroare(false);
        })
        .catch((err) => {
          if (signal.aborted || onAuthError(err)) return;
          setEroare((precedent) => precedent || dateRef.current === null);
        });
    },
    [incarca, token, onAuthError]
  );

  const reincarca = useAdminPolling(cere, intervalMs);

  return { date, eroare, reincarca };
};
