import { useMutation } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import {
  ANTIBOT_MESSAGES,
  antiBotErrorMessage,
  isBotRejectedError,
  isDuplicateError,
  useAntiBot,
} from '../../inscriere';
import { isAbortError, isTimeoutError } from '../../../shared/lib/errors';
import { logClientError } from '../../../shared/lib/monitoring';
import { isTurnstileError } from '../../../shared/lib/turnstile';
import { isGiveawayClosedError, isGiveawayUnavailableError, submitGiveawayEntry } from '../data/api';
import {
  EMPTY_GIVEAWAY_DRAFT,
  GIVEAWAY_MESSAGES,
  validateGiveawayDraft,
  type GiveawayDraft,
  type GiveawayErrors,
} from '../lib/giveawayForm';

/**
 * `duplicate` e un răspuns al serverului, nu o eroare de arătat lângă buton:
 * omul nu are ce corecta în formular, deci formularul dispare.
 */
type GiveawayFormState = 'form' | 'loading' | 'success' | 'duplicate';

/**
 * Logica formularului de giveaway: validare, trimitere prin poarta anti-bot și
 * mașina de stări. Aceeași formă ca `useLaunchForm`, cu două ieșiri în plus.
 */
export const useGiveawayForm = () => {
  const trimite = useMutation({
    mutationFn: (args: Parameters<typeof submitGiveawayEntry>) => submitGiveawayEntry(...args),
    networkMode: 'always',
  });

  const [draft, setDraft] = useState<GiveawayDraft>(EMPTY_GIVEAWAY_DRAFT);
  const [errors, setErrors] = useState<GiveawayErrors>({});
  const [state, setState] = useState<GiveawayFormState>('form');
  const [eroare, setEroare] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const submittingRef = useRef(false);
  const antiBot = useAntiBot();

  // Oprește fetch-ul în curs la unmount.
  useEffect(() => () => abortRef.current?.abort(), []);

  const setField = <K extends keyof GiveawayDraft>(name: K, value: GiveawayDraft[K]) => {
    setDraft((d) => ({ ...d, [name]: value }));
    setErrors((prev) => {
      if (!(name in prev)) return prev;
      const next = { ...prev };
      delete next[name as keyof GiveawayErrors];
      return next;
    });
  };

  /**
   * Întoarce `'closed'` când serverul a refuzat fiindcă giveaway-ul nu mai
   * primește înscrieri: pagina era în urmă și trebuie să arate închiderea.
   */
  const submit = async (): Promise<'closed' | undefined> => {
    if (submittingRef.current) return;

    const errs = validateGiveawayDraft(draft);
    const gresite = Object.keys(errs);
    if (gresite.length > 0) {
      setErrors(errs);
      // Doar bifa lipsă: „câmpurile marcate cu roșu" n-ar spune ce lipsește.
      setEroare(
        gresite.length === 1 && errs.acordRegulament
          ? GIVEAWAY_MESSAGES.regulament
          : GIVEAWAY_MESSAGES.validation
      );
      return;
    }

    setErrors({});
    setEroare(null);
    setState('loading');
    submittingRef.current = true;
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      // Token-ul Turnstile se cere ACUM, nu la montare: e de unică folosință și
      // expiră în ~5 minute.
      const proofs = await antiBot.collect();
      await trimite.mutateAsync([draft, proofs, controller.signal]);
      setState('success');
    } catch (err) {
      if (isAbortError(err)) return;
      if (isDuplicateError(err)) {
        setState('duplicate');
        return;
      }
      if (isGiveawayClosedError(err)) {
        setState('form');
        return 'closed';
      }
      logClientError('giveaway-entry', err);
      setState('form');
      if (isGiveawayUnavailableError(err)) setEroare(GIVEAWAY_MESSAGES.indisponibil);
      else if (isTurnstileError(err)) setEroare(antiBotErrorMessage(err));
      else if (isBotRejectedError(err)) setEroare(ANTIBOT_MESSAGES.captcha);
      else setEroare(isTimeoutError(err) ? GIVEAWAY_MESSAGES.timeout : GIVEAWAY_MESSAGES.generic);
    } finally {
      submittingRef.current = false;
    }
  };

  return { draft, setField, errors, state, eroare, submit, hpProps: antiBot.hpProps };
};
