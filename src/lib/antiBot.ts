/**
 * Dovezile anti-bot atașate fiecărui submit public: token Turnstile + honeypot +
 * timpul petrecut pe formular. Partajat de `useLaunchForm` și `useRegistration`,
 * ca ambele formulare să aibă exact aceleași apărări.
 *
 * Straturile, în ordinea costului:
 *  1. honeypot — câmp ascuns; un om nu-l vede, deci nu-l completează. Gratis.
 *  2. timp minim pe formular — falsificabil (vine din client), oprește doar botii
 *     naivi. Gratis.
 *  3. Turnstile — singurul strat pe care nu-l poate ocoli un `curl`. Verificat
 *     server-side, în funcția Edge `submit-form`.
 *
 * Toate trei sunt VERIFICATE PE SERVER. Aici doar le colectăm.
 */
import { useEffect, useRef, useState } from 'react';
import { getTurnstileToken, isTurnstileError } from './turnstile';
import type { AntiBot } from './supabase';

/** Numele câmpului-capcană. Plauzibil pentru un bot, irelevant pentru formular. */
export const HONEYPOT_NAME = 'website';

export const ANTIBOT_MESSAGES = {
  captcha: 'Verificarea anti-bot nu a trecut. Reîncarcă pagina și încearcă din nou.',
  captchaBlocked:
    'Verificarea anti-bot nu s-a putut încărca. Dezactivează blocantul de reclame și încearcă din nou.',
} as const;

/**
 * Colectorul de dovezi pentru un formular.
 *
 * `hpProps` se întind pe un `<input>` ascuns; `collect()` se apelează la submit
 * și cere un token Turnstile PROASPĂT (token-urile sunt de unică folosință și
 * expiră în ~5 minute — unul luat la montare ar fi deja mort).
 */
export const useAntiBot = () => {
  const [hp, setHp] = useState('');
  const mountedAt = useRef(Date.now());

  // Formularul poate fi reafișat („înscrie altă persoană") fără remount: repornim
  // cronometrul la fiecare golire a capcanei, ca a doua înscriere să nu pară
  // instantanee doar pentru că prima a durat.
  const restart = () => {
    mountedAt.current = Date.now();
    setHp('');
  };

  useEffect(() => {
    mountedAt.current = Date.now();
  }, []);

  const collect = async (): Promise<AntiBot> => ({
    token: await getTurnstileToken(),
    hp,
    elapsed: Date.now() - mountedAt.current,
  });

  const hpProps = {
    name: HONEYPOT_NAME,
    value: hp,
    onChange: (e: { target: { value: string } }) => setHp(e.target.value),
    tabIndex: -1,
    autoComplete: 'off',
    'aria-hidden': true as const,
    style: {
      position: 'absolute' as const,
      left: '-9999px',
      width: 1,
      height: 1,
      opacity: 0,
      pointerEvents: 'none' as const,
      // 16px deși câmpul e invizibil: garda de pe mobil (`tests/mobil.spec.ts`)
      // se uită la TOATE `input`-urile din `<form>`, fără excepții — și e bine
      // că e așa, fiindcă o excepție ar lăsa un câmp real să treacă pe sub ea.
      // Capcana n-are cum să primească focus (tabIndex -1, off-screen), deci
      // regula o satisface gratis.
      fontSize: 16,
    },
  };

  return { collect, hpProps, restart };
};

/** Mesajul potrivit când `collect()` a eșuat înainte de a ajunge la server. */
export const antiBotErrorMessage = (err: unknown): string =>
  isTurnstileError(err) ? ANTIBOT_MESSAGES.captchaBlocked : ANTIBOT_MESSAGES.captcha;
