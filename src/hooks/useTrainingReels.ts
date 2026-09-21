import { useEffect, useState } from 'react';
import { fetchTrainingReels, isAbortError, type Reel } from '../lib/supabase';
import { logClientError } from '../lib/monitoring';

/**
 * Clipurile de antrenament, cerute o singură dată la montare.
 *
 * Fără provider și fără reîmprospătare periodică, spre deosebire de configul
 * ediției: banda nu e o cronologie care se schimbă sub degetul vizitatorului, iar
 * un tab lăsat deschis n-are de ce să reîncarce clipuri.
 *
 * Pornește de la lista goală, nu de la un instantaneu de build. Consecința e că
 * secțiunea apare abia după răspuns — acceptabil, fiindcă ea stă oricum sub fold
 * pe amândouă paginile, iar alternativa (o listă în cod, reconciliată din DB) ar
 * fi însemnat două surse care pot să difere.
 *
 * Un backend căzut nu e o cale de eroare: lista rămâne goală, secțiunea nu se
 * randează, iar restul paginii nu știe că a existat.
 */
export const useTrainingReels = (): readonly Reel[] => {
  const [reels, setReels] = useState<readonly Reel[]>([]);

  useEffect(() => {
    const control = new AbortController();
    fetchTrainingReels(control.signal)
      .then(setReels)
      .catch((err) => {
        // Abort la unmount e normal. Restul lasă o urmă, dar pagina rămâne
        // întreagă, fără bandă.
        if (isAbortError(err)) return;
        logClientError('fetch-training-reels', err);
      });
    return () => control.abort();
  }, []);

  return reels;
};
