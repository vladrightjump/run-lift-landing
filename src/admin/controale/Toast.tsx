import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Confirmarea scurtă de jos a ecranului, cu „Anulează" pentru ce se poate
 * desface (R17, R26).
 *
 * „Anulează" ține 6 secunde, nu 3: e timpul în care cineva marcat prezent din
 * greșeală, la intrarea în cursă, apucă să ridice ochii de pe listă.
 */

export type ToastAdmin = { kind: 'error' | 'success'; msg: string; undo?: () => void };
type ToastAfisat = ToastAdmin & { id: number };

export const DURATA_CU_ANULARE = 6000;
export const DURATA_SIMPLA = 3200;

export const useToast = () => {
  const [toast, setToast] = useState<ToastAfisat | null>(null);
  const cronometru = useRef<number | null>(null);
  const contor = useRef(0);

  const opreste = useCallback(() => {
    if (cronometru.current !== null) window.clearTimeout(cronometru.current);
    cronometru.current = null;
  }, []);

  const inchide = useCallback(() => {
    opreste();
    setToast(null);
  }, [opreste]);

  const arata = useCallback(
    (t: ToastAdmin) => {
      opreste();
      contor.current += 1;
      setToast({ ...t, id: contor.current });
      cronometru.current = window.setTimeout(
        () => setToast(null),
        t.undo ? DURATA_CU_ANULARE : DURATA_SIMPLA
      );
    },
    [opreste]
  );

  useEffect(() => opreste, [opreste]);

  return { toast, arata, inchide };
};

/**
 * Zona e mereu montată, cu `role="status"`: un cititor de ecran anunță doar
 * schimbările dintr-o regiune care exista deja când s-au produs.
 */
export const Toast = ({ toast, onInchide }: { toast: ToastAfisat | null; onInchide: () => void }) => (
  <div className="admin-toast-zona" role="status" aria-live="polite">
    {toast && (
      <div key={toast.id} className={`admin-toast${toast.kind === 'error' ? ' error' : ''}`}>
        <span className="admin-toast-punct" aria-hidden="true" />
        <span className="admin-toast-text">{toast.msg}</span>
        {toast.undo && (
          <button
            type="button"
            className="admin-toast-actiune"
            onClick={() => {
              toast.undo?.();
              onInchide();
            }}
          >
            Anulează
          </button>
        )}
      </div>
    )}
  </div>
);
