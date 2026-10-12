import { SUPABASE } from '../../../shared/lib/config';
import { esteIdYouTube } from '../../../shared/lib/youtube';
import { SubmitHttpError } from '../../../shared/lib/errors';
/**
 * Un clip de antrenament, așa cum îl arată pagina.
 *
 * CLIPUL nu vine de aici: `youtube` e identificatorul de pe gazdă, iar octeții
 * lui îi servește ea. Din backend vine PREZENTAREA — ordinea, legenda, linkul
 * postării și dacă se vede.
 *
 * `url` rămâne o adresă de Instagram, nu de YouTube: gazda ține fișierul, dar
 * publicul e pe Instagram, iar acolo trimite cardul.
 */
export type Reel = { youtube: string; caption: string; url: string };

/**
 * Clipurile vizibile, în ordinea din bandă.
 *
 * Aceeași formă ca `fetchWeeklyWorkouts` (`features/antrenament/data/api.ts`): RPC stabil peste un tabel închis, cu
 * cheia publicabilă. Clipurile nu aparțin niciunei ediții — antrenamentele nu se
 * mută odată cu cursa — deci nu trec prin documentul de configurare.
 *
 * Tolerant ca `parseEventConfig`: o intrare stricată se sare, în loc să rupă
 * secțiunea. Lista goală e o stare validă și normală — atunci banda dispare
 * complet, fără să lase un număr de secțiune sărit.
 */
export const fetchTrainingReels = async (signal?: AbortSignal): Promise<Reel[]> => {
  const res = await fetch(`${SUPABASE.url}/rest/v1/rpc/public_training_reels`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE.publishableKey,
      'Content-Type': 'application/json',
      'Content-Profile': SUPABASE.schema,
    },
    body: '{}',
    signal,
  });
  if (!res.ok) {
    throw new SubmitHttpError(res.status, await res.text().catch(() => ''));
  }
  const raw: unknown = await res.json();
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((element): Reel[] => {
    if (typeof element !== 'object' || element === null) return [];
    const { youtube, caption, url } = element as Record<string, unknown>;
    // `youtube` și `url` sunt singurele obligatorii: fără ele cardul n-are ce
    // reda și n-are unde trimite. Serverul le validează deja prin constrângeri;
    // asta e apărarea în adâncime pentru o scriere directă în DB.
    //
    // Forma identificatorului se verifică, nu doar tipul: de aici iese un `src`
    // de `iframe` spre o origine pe care CSP-ul o permite acum, deci un șir
    // arbitrar n-are voie să ajungă până acolo.
    if (typeof youtube !== 'string' || !esteIdYouTube(youtube)) return [];
    if (typeof url !== 'string' || !url.startsWith('https://www.instagram.com/')) return [];
    return [
      {
        youtube,
        caption: typeof caption === 'string' ? caption : '',
        url,
      },
    ];
  });
};
