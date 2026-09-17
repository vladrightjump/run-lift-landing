import { useEffect, useRef, useState } from 'react';
import {
  submitLaunchNotification,
  isDuplicateError,
  isTimeoutError,
  isAbortError,
  isBotRejectedError,
} from '../lib/supabase';
import type { SursaInscriere } from '../lib/supabase';
import { logClientError } from '../lib/monitoring';
import { useAntiBot, antiBotErrorMessage, ANTIBOT_MESSAGES } from '../lib/antiBot';
import { isTurnstileError } from '../lib/turnstile';
import {
  EMPTY_LAUNCH_DRAFT,
  LAUNCH_MESSAGES,
  validateLaunchDraft,
} from '../lib/launchForm';
import type { LaunchDraft, LaunchFieldErrors } from '../lib/launchForm';

export type LaunchFormState = 'form' | 'loading' | 'success';

/**
 * Rezultatul unui submit. Componenta decide CUM îl arată (toast vs. inline vs.
 * panou de succes) — hook-ul deține doar logica și starea, nu prezentarea.
 */
export type LaunchOutcome =
  | { kind: 'busy' } // submit deja în curs sau abort la unmount — fără feedback
  | { kind: 'invalid'; message: string }
  | { kind: 'offline'; message: string }
  | { kind: 'success'; duplicate: boolean; email: string }
  | { kind: 'error'; message: string };

/**
 * Logica formularului „anunță-mă la lansare", partajată de `ComingSoon` și
 * `DespreNoi`: validare, submit, email best-effort, tratare duplicat/timeout/abort
 * și mașina de stări `form → loading → success`.
 */
export const useLaunchForm = (sursa: SursaInscriere = 'lansare') => {
  const [draft, setDraft] = useState<LaunchDraft>(EMPTY_LAUNCH_DRAFT);
  const [errors, setErrors] = useState<LaunchFieldErrors>({});
  const [state, setState] = useState<LaunchFormState>('form');
  const abortRef = useRef<AbortController | null>(null);
  const submittingRef = useRef(false);
  const antiBot = useAntiBot();

  // Oprește fetch-ul în curs la unmount.
  useEffect(() => () => abortRef.current?.abort(), []);

  const setField = (name: keyof LaunchDraft, value: string) => {
    setDraft((d) => ({ ...d, [name]: value }));
    setErrors((prev) => {
      if (!prev[name]) return prev;
      const next = { ...prev };
      delete next[name];
      return next;
    });
  };

  const reset = () => {
    setDraft(EMPTY_LAUNCH_DRAFT);
    setErrors({});
    setState('form');
    antiBot.restart();
  };

  const submit = async (): Promise<LaunchOutcome> => {
    if (submittingRef.current) return { kind: 'busy' };

    const errs = validateLaunchDraft(draft);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return { kind: 'invalid', message: LAUNCH_MESSAGES.validation };
    }

    // NU blocăm preemptiv pe `navigator.onLine`: pe unele rețele/VPN raportează greșit
    // „offline" și ar refuza trimiterea (același fals-offline scos din formularul de
    // înscriere). Încercăm submit-ul; un eșec real de rețea e prins în catch.
    setErrors({});
    setState('loading');
    submittingRef.current = true;
    const controller = new AbortController();
    abortRef.current = controller;
    const email = draft.email.trim();

    try {
      // Token-ul Turnstile se cere ACUM, nu la montare: e de unică folosință și
      // expiră în ~5 minute. Emailul de bun venit îl trimite funcția Edge.
      const proofs = await antiBot.collect();
      await submitLaunchNotification(draft, proofs, controller.signal, sursa);
      setState('success');
      return { kind: 'success', duplicate: false, email };
    } catch (err) {
      if (isAbortError(err)) return { kind: 'busy' };
      if (isDuplicateError(err)) {
        // Emailul e deja pe listă — pentru utilizator e tot un succes.
        setState('success');
        return { kind: 'success', duplicate: true, email };
      }
      logClientError(`launch-notification:${sursa}`, err);
      setState('form');
      // Verificarea anti-bot a picat în client (script blocat) sau pe server
      // (token invalid): mesaj propriu, altfel „verifică conexiunea" derutează.
      if (isTurnstileError(err)) {
        return { kind: 'error', message: antiBotErrorMessage(err) };
      }
      if (isBotRejectedError(err)) {
        return { kind: 'error', message: ANTIBOT_MESSAGES.captcha };
      }
      return {
        kind: 'error',
        message: isTimeoutError(err) ? LAUNCH_MESSAGES.timeout : LAUNCH_MESSAGES.generic,
      };
    } finally {
      submittingRef.current = false;
    }
  };

  return { draft, setField, errors, state, submit, reset, hpProps: antiBot.hpProps };
};
