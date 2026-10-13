import { useEffect, useRef, useState } from 'react';

/**
 * O cifră care se schimbă se vede schimbându-se (R11, R30, KTD7).
 *
 * Când un răspuns nou ridică „vin" de la 11 la 12, cifra numără până acolo în
 * ~600 ms, cu încetinire la final. Cu `prefers-reduced-motion`, sare direct la
 * valoarea nouă. Prima valoare nu se animă: la deschidere, cifrele sunt deja
 * acolo, nu „se încarcă" de la zero.
 */

const DURATA = 600;

const miscareRedusa = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const cadru = (f: (t: number) => void): number =>
  typeof requestAnimationFrame === 'function'
    ? requestAnimationFrame(f)
    : (setTimeout(() => f(performance.now()), 16) as unknown as number);

const anuleaza = (id: number) =>
  typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame(id) : clearTimeout(id);

export const useNumarAnimat = (valoare: number): number => {
  const [afisat, setAfisat] = useState(valoare);
  const anterior = useRef(valoare);

  useEffect(() => {
    const de = anterior.current;
    anterior.current = valoare;
    if (de === valoare) return;
    if (miscareRedusa()) {
      const id = cadru(() => setAfisat(valoare));
      return () => anuleaza(id);
    }
    let id = 0;
    let inceput: number | null = null;
    const pas = (t: number) => {
      inceput ??= t;
      const p = Math.min(1, (t - inceput) / DURATA);
      setAfisat(Math.round(de + (valoare - de) * (1 - (1 - p) ** 3)));
      if (p < 1) id = cadru(pas);
    };
    id = cadru(pas);
    return () => anuleaza(id);
  }, [valoare]);

  return afisat;
};
