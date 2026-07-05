import { useCallback, useEffect, useRef, useState } from 'react';

export type ToastKind = 'error' | 'success';
export type ToastState = { kind: ToastKind; msg: string } | null;

const AUTO_HIDE_MS = 3500;

export const useToast = () => {
  const [toast, setToast] = useState<ToastState>(null);
  const [hiding, setHiding] = useState(false);
  const timerRef = useRef<number | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const hideToast = useCallback(() => {
    if (!toast) return;
    setHiding(true);
    window.setTimeout(() => {
      setToast(null);
      setHiding(false);
    }, 200);
  }, [toast]);

  const showToast = useCallback(
    (kind: ToastKind, msg: string) => {
      clearTimer();
      setHiding(false);
      setToast({ kind, msg });
      timerRef.current = window.setTimeout(() => hideToast(), AUTO_HIDE_MS);
    },
    [clearTimer, hideToast]
  );

  useEffect(() => () => clearTimer(), [clearTimer]);

  return { toast, hiding, showToast, hideToast };
};
