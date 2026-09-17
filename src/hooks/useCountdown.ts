import { useEffect, useState } from 'react';

const pad = (n: number) => String(n).padStart(2, '0');

export type Countdown = {
  zile: string;
  ore: string;
  minute: string;
  secunde: string;
  done: boolean;
};

const computeCountdown = (target: Date): Countdown => {
  const rawDiff = target.getTime() - Date.now();
  const diff = Math.max(0, rawDiff);
  return {
    zile: pad(Math.floor(diff / 86400000)),
    ore: pad(Math.floor(diff / 3600000) % 24),
    minute: pad(Math.floor(diff / 60000) % 60),
    secunde: pad(Math.floor(diff / 1000) % 60),
    done: rawDiff <= 0,
  };
};

/**
 * Numărătoare inversă spre `target`.
 *
 * Ținta NU e fixă: primul cadru se randează pe instantaneul de build, iar
 * reperele adevărate sosesc câteva sute de milisecunde mai târziu, când
 * răspunde `public_config()`. O ediție publicată din backoffice mută deci
 * ținta sub picioarele hook-ului, de la una trecută (ediția încheiată din
 * build) la una viitoare.
 *
 * De asta starea se recalculează la fiecare schimbare de țintă, ÎNAINTE de a
 * decide dacă mai e ceva de numărat. Varianta care doar repornea intervalul
 * ieșea devreme când `done` era deja `true` și îngheța acolo: `usePagePhase`
 * rămânea pe „next", iar homepage-ul arăta countdownul de după cursă pentru o
 * ediție care nu începuse încă — publicarea fără deploy nu ajungea pe site.
 *
 * Dependența e milisecunda, nu obiectul `Date`: `useEditionDates()` întoarce
 * repere noi la fiecare refresh de config, iar o dependență pe identitate ar
 * reporni intervalul degeaba.
 */
export const useCountdown = (target: Date): Countdown => {
  const ts = target.getTime();
  const [cd, setCd] = useState<Countdown>(() => computeCountdown(target));

  useEffect(() => {
    const tinta = new Date(ts);
    const proaspat = computeCountdown(tinta);
    setCd(proaspat);
    if (proaspat.done) return;

    // Intervalul se oprește singur la zero. Înainte asta o făcea dependența
    // `cd.done`, care acum lipsește — fără oprire ar rescrie aceleași zerouri
    // o dată pe secundă, la nesfârșit.
    const id = setInterval(() => {
      const next = computeCountdown(tinta);
      setCd(next);
      if (next.done) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [ts]);

  return cd;
};
