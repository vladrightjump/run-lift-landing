import { useCallback, useEffect, useRef, useState } from 'react';

export type ToastKind = 'error' | 'success';
export type ToastState = { kind: ToastKind; msg: string } | null;

const AUTO_HIDE_MS = 3500;
const HIDE_ANIM_MS = 200;

export const useToast = () => {
  const [toast, setToast] = useState<ToastState>(null);
  const [hiding, setHiding] = useState(false);
  const autoHideTimerRef = useRef<number | null>(null);
  const hideAnimTimerRef = useRef<number | null>(null);

  const clearTimers = useCallback(() => {
    if (autoHideTimerRef.current !== null) {
      window.clearTimeout(autoHideTimerRef.current);
      autoHideTimerRef.current = null;
    }
    if (hideAnimTimerRef.current !== null) {
      window.clearTimeout(hideAnimTimerRef.current);
      hideAnimTimerRef.current = null;
    }
  }, []);

  const hideToast = useCallback(() => {
    setHiding(true);
    if (hideAnimTimerRef.current !== null) window.clearTimeout(hideAnimTimerRef.current);
    hideAnimTimerRef.current = window.setTimeout(() => {
      hideAnimTimerRef.current = null;
      setToast(null);
      setHiding(false);
    }, HIDE_ANIM_MS);
  }, []);

  const showToast = useCallback(
    (kind: ToastKind, msg: string) => {
      clearTimers();
      setHiding(false);
      setToast({ kind, msg });
      autoHideTimerRef.current = window.setTimeout(() => hideToast(), AUTO_HIDE_MS);
    },
    [clearTimers, hideToast]
  );

  useEffect(() => () => clearTimers(), [clearTimers]);

  return { toast, hiding, showToast, hideToast };
};
