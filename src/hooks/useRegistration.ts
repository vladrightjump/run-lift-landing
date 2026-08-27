import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { isBackendConfigured } from '../lib/config';
import { useEventConfig, useEditionDates } from './useEventConfig';
import {
  submitRegistration,
  submitWaitlist,
  sendConfirmationEmail,
  isTimeoutError,
  isAbortError,
  isDuplicateError,
  isWaitlistFullError,
  isEventFullError,
  isRegistrationClosedError,
  isNetworkOrCspError,
  SubmitHttpError,
} from '../lib/supabase';
import type { PublicStats } from '../lib/supabase';
import { logClientError } from '../lib/monitoring';
import { validate, errorMessage, firstErrorField, dataNasteriiError } from '../lib/validation';
import type { FieldName, FieldErrors, FormData } from '../lib/validation';
import { rememberMySignup } from '../lib/mySignups';
import type { ToastKind } from './useToast';

type Phase = 'form' | 'loading' | 'success' | 'error';

const MIN_LOADING_MS = 700;
const SIM_LOADING_MS = 1800;
const delay = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));
const pad2 = (n: number | string) => String(n).padStart(2, '0');

type Params = {
  stats: PublicStats | null;
  now: number;
  refresh: () => void;
  showToast: (kind: ToastKind, msg: string) => void;
};

/**
 * Toată logica de înscriere a landing-ului: starea formularului, sloturile/derivatele
 * (din `stats` + `now`), mașina de stări `form → loading → success/error` și trimiterea
 * (înscriere sau listă de așteptare). Prezentarea stă în `RegistrationSection`.
 */
export const useRegistration = ({ stats, now, refresh, showToast }: Params) => {
  const config = useEventConfig();
  const { EVENT_END_DATE, REGISTRATION_DEADLINE } = useEditionDates();
  const [phase, setPhase] = useState<Phase>('form');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [dateErrMsg, setDateErrMsg] = useState('Introdu data nașterii.');
  const [confirmName, setConfirmName] = useState('atlet');
  const [submittedAsWaitlist, setSubmittedAsWaitlist] = useState(false);
  const [wlFull, setWlFull] = useState(false);
  const [sessionSignups, setSessionSignups] = useState(0);
  const [birth, setBirth] = useState({ d: '', m: '', y: '' });
  const birthISO = birth.d && birth.m && birth.y ? `${birth.y}-${pad2(birth.m)}-${pad2(birth.d)}` : '';

  const formRef = useRef<HTMLFormElement>(null);
  const submittingRef = useRef(false);
  const timersRef = useRef<number[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (stats) setSessionSignups(0);
  }, [stats]);

  useEffect(() => {
    return () => {
      for (const id of timersRef.current) window.clearTimeout(id);
      abortRef.current?.abort();
    };
  }, []);

  const scheduleTimer = (fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      timersRef.current = timersRef.current.filter((t) => t !== id);
      fn();
    }, ms);
    timersRef.current.push(id);
  };

  const slots = useMemo(() => {
    const base = stats?.count ?? config.slots.occupiedFallback;
    const occupied = Math.min(config.slots.total, base + sessionSignups);
    return { occupied, remaining: config.slots.total - occupied };
  }, [stats, sessionSignups]);

  const isEventEnded = now > EVENT_END_DATE.getTime();
  const isRegClosed = now > REGISTRATION_DEADLINE.getTime();
  const isSoldOut = slots.remaining <= 0;
  const waitlistCount = stats?.waitlist ?? 0;
  const isWaitlistFull = wlFull || waitlistCount >= config.slots.waitlist;
  const waitlistMode = isSoldOut && !isWaitlistFull;
  const waitlistLeft = Math.max(0, config.slots.waitlist - waitlistCount);
  const showForm =
    phase === 'form' && !isEventEnded && !isRegClosed && !(isSoldOut && isWaitlistFull);
  const closedReason: 'ended' | 'reg' | 'full' | null =
    phase !== 'form'
      ? null
      : isEventEnded
      ? 'ended'
      : isRegClosed
      ? 'reg'
      : isSoldOut && isWaitlistFull
      ? 'full'
      : null;

  const clearErrorFor = (name: FieldName) =>
    setErrors((prev) => {
      if (!prev[name]) return prev;
      const next = { ...prev };
      delete next[name];
      return next;
    });

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submittingRef.current) return;

    const asWaitlist = isSoldOut && !isWaitlistFull;
    const fd = new window.FormData(e.currentTarget);
    const data: FormData = {
      nume: String(fd.get('nume') ?? '').trim(),
      telefon: String(fd.get('telefon') ?? '').trim(),
      email: String(fd.get('email') ?? '').trim(),
      dataNasterii: String(fd.get('dataNasterii') ?? '').trim(),
      acord: !!fd.get('acord'),
    };

    const errs = validate(data, config.start);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      if (errs.dataNasterii) {
        setDateErrMsg(
          dataNasteriiError(data.dataNasterii, config.start) ?? 'Data nașterii nu e validă.'
        );
      }
      showToast('error', errorMessage(errs));
      const bad = firstErrorField(errs);
      if (bad) formRef.current?.querySelector<HTMLInputElement>(`[name="${bad}"]`)?.focus();
      return;
    }

    setErrors({});
    setPhase('loading');
    submittingRef.current = true;
    const firstName = data.nume.split(/\s+/)[0] || 'atlet';
    const startedAt = Date.now();

    const enforceMin = async () => {
      const elapsed = Date.now() - startedAt;
      if (elapsed < MIN_LOADING_MS) await delay(MIN_LOADING_MS - elapsed);
    };

    const finishSuccess = (wasWaitlist = asWaitlist) => {
      setConfirmName(firstName);
      setSubmittedAsWaitlist(wasWaitlist);
      if (!wasWaitlist) {
        setSessionSignups((n) => n + 1);
        rememberMySignup(data.nume);
      }
      if (isBackendConfigured()) refresh();
      setPhase('success');
      submittingRef.current = false;
      showToast('success', wasWaitlist ? 'Ai fost adăugat pe lista de așteptare!' : 'Înscrierea a fost trimisă!');
    };

    const finishError = (msg: string) => {
      setPhase('error');
      submittingRef.current = false;
      showToast('error', msg);
    };

    if (!isBackendConfigured()) {
      if (import.meta.env.DEV) {
        scheduleTimer(async () => {
          await enforceMin();
          finishSuccess();
        }, SIM_LOADING_MS);
      } else {
        scheduleTimer(async () => {
          await enforceMin();
          finishError('Înscrierea nu poate fi trimisă momentan.');
        }, 300);
      }
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      if (asWaitlist) {
        await submitWaitlist(data, controller.signal);
      } else {
        const newId = await submitRegistration(data, controller.signal);
        void sendConfirmationEmail(newId);
      }
      await enforceMin();
      finishSuccess();
    } catch (err) {
      if (isAbortError(err)) return;
      await enforceMin();
      if (asWaitlist && isWaitlistFullError(err)) {
        setWlFull(true);
        if (isBackendConfigured()) refresh();
        setPhase('form');
        submittingRef.current = false;
        showToast('error', 'Lista de așteptare tocmai s-a umplut.');
        return;
      }
      // Serverul a închis înscrierile (deadline trecut, verificat server-side) —
      // clientul putea avea ceasul în urmă. Mesaj clar, fără retry.
      if (!asWaitlist && isRegistrationClosedError(err)) {
        finishError('Înscrierile s-au închis.');
        return;
      }
      // Locurile s-au ocupat între timp (numărătoarea din client era stale): serverul
      // a respins înscrierea. Comutăm automat pe lista de așteptare, dacă mai e loc.
      if (!asWaitlist && isEventFullError(err)) {
        try {
          await submitWaitlist(data, controller.signal);
          finishSuccess(true);
          return;
        } catch (wlErr) {
          if (isAbortError(wlErr)) return;
          if (isWaitlistFullError(wlErr)) {
            setWlFull(true);
            if (isBackendConfigured()) refresh();
            setPhase('form');
            submittingRef.current = false;
            showToast('error', 'Locurile și lista de așteptare s-au ocupat.');
            return;
          }
          logClientError('waitlist', wlErr, {
            status: wlErr instanceof SubmitHttpError ? wlErr.status : undefined,
          });
          finishError('Înscrierea nu a putut fi trimisă.');
          return;
        }
      }
      logClientError(asWaitlist ? 'waitlist' : 'registration', err, {
        status: err instanceof SubmitHttpError ? err.status : undefined,
      });
      const msg = isTimeoutError(err)
        ? 'Serverul răspunde greu. Încearcă din nou.'
        : isDuplicateError(err)
        ? 'Există deja o înscriere cu acest email.'
        : isNetworkOrCspError(err)
        ? 'Conexiune blocată sau indisponibilă. Reîncearcă.'
        : 'Înscrierea nu a putut fi trimisă.';
      finishError(msg);
    }
  };

  const resetForm = () => {
    formRef.current?.reset();
    setBirth({ d: '', m: '', y: '' });
    setErrors({});
    setPhase('form');
  };

  return {
    phase,
    setPhase,
    errors,
    setErrors,
    dateErrMsg,
    confirmName,
    submittedAsWaitlist,
    birth,
    setBirth,
    birthISO,
    formRef,
    slots,
    isSoldOut,
    isWaitlistFull,
    waitlistMode,
    waitlistLeft,
    showForm,
    closedReason,
    handleSubmit,
    clearErrorFor,
    resetForm,
  };
};
