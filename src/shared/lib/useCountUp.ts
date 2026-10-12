import { useEffect, useRef, useState } from 'react';

/**
 * Urcă de la valoarea afișată anterior la `target`, ca cifrele să nu sară.
 * Se folosește la contoare (locuri rămase, participanți înscriși): datele vin
 * pe rând de la Supabase, iar saltul brusc de la „–" la „37" trece neobservat.
 *
 * Prima valoare cunoscută pornește de la 0; actualizările ulterioare pornesc
 * de unde era. Returnează `null` cât timp `target` e `null` (încă se încarcă),
 * ca apelantul să-și păstreze propriul marcaj de gol.
 */
export const useCountUp = (target: number | null, duration = 700): number | null => {
  const [value, setValue] = useState<number | null>(null);
  const fromRef = useRef(0);

  useEffect(() => {
    if (target === null) return;

    const from = fromRef.current;
    if (from === target) {
      setValue(target);
      return;
    }

    // Fără mișcare: sare direct la valoare.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      fromRef.current = target;
      setValue(target);
      return;
    }

    const start = performance.now();
    let frame = requestAnimationFrame(function step(now) {
      const t = Math.min((now - start) / duration, 1);
      // easeOutCubic — rapid la început, se așază lin pe valoarea finală.
      const eased = 1 - Math.pow(1 - t, 3);
      const current = Math.round(from + (target - from) * eased);
      setValue(current);
      if (t < 1) {
        frame = requestAnimationFrame(step);
      } else {
        fromRef.current = target;
      }
    });

    return () => cancelAnimationFrame(frame);
  }, [target, duration]);

  return value;
};
