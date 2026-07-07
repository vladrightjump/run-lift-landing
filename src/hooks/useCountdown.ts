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

export const useCountdown = (target: Date): Countdown => {
  const [cd, setCd] = useState<Countdown>(() => computeCountdown(target));

  useEffect(() => {
    if (cd.done) return;
    const id = setInterval(() => setCd(computeCountdown(target)), 1000);
    return () => clearInterval(id);
  }, [target, cd.done]);

  return cd;
};
