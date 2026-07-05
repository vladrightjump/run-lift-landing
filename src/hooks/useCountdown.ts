import { useEffect, useState } from 'react';

const pad = (n: number) => String(n).padStart(2, '0');

export type Countdown = {
  zile: string;
  ore: string;
  minute: string;
  secunde: string;
};

const computeCountdown = (target: Date): Countdown => {
  const diff = Math.max(0, target.getTime() - Date.now());
  return {
    zile: pad(Math.floor(diff / 86400000)),
    ore: pad(Math.floor(diff / 3600000) % 24),
    minute: pad(Math.floor(diff / 60000) % 60),
    secunde: pad(Math.floor(diff / 1000) % 60),
  };
};

export const useCountdown = (target: Date): Countdown => {
  const [cd, setCd] = useState<Countdown>(() => computeCountdown(target));

  useEffect(() => {
    const id = setInterval(() => setCd(computeCountdown(target)), 1000);
    return () => clearInterval(id);
  }, [target]);

  return cd;
};
