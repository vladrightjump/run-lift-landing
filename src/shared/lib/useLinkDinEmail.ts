import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { esteTokenValid, tokenDinAdresa } from './token';

export type StareLink<R extends string> = 'incarca' | 'invalid' | 'eroare' | R;

/**
 * O pagină deschisă din linkul unui email, care își face treaba la încărcare
 * (confirmarea, dezabonarea): citește tokenul o dată, îl trimite o dată și
 * întoarce starea de arătat.
 *
 * Un token care nu arată a UUID nu ajunge la server: e `invalid` pe loc.
 * „N-am putut întreba" (`eroare`) rămâne diferit de „serverul a zis nu"
 * (`invalid`). Query aduce o singură cerere și anularea la demontare; nu
 * reîncearcă și nu repetă cererea la revenirea în tab (vezi `app/providers`).
 */
export const useLinkDinEmail = <R extends string>(
  cheie: string,
  trimite: (token: string, signal: AbortSignal) => Promise<R>
): StareLink<R> => {
  const [token] = useState(tokenDinAdresa);
  const valid = esteTokenValid(token);
  const { data, isError } = useQuery({
    queryKey: ['link-email', cheie, token],
    queryFn: ({ signal }) => trimite(token, signal),
    enabled: valid,
    // Linkul se folosește o dată: niciun motiv să-l retrimitem.
    staleTime: Infinity,
  });
  if (!valid) return 'invalid';
  if (isError) return 'eroare';
  return data ?? 'incarca';
};
