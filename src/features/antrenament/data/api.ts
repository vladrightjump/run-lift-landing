import { SUPABASE } from '../../../shared/lib/config';
import { SubmitHttpError } from '../../../lib/supabase';

/** O săptămână din programul de antrenamente, așa cum o vede pagina publică. */
export type WeeklyWorkout = { numar: number; titlu: string; corp: string };

/**
 * Programul vizibil, crescător: Săptămâna 1, 2, 3 … N.
 *
 * Tot programul într-un singur răspuns, deliberat: alegerea unei săptămâni din
 * selector nu mai cere nimic de la server. Un al doilea RPC „dă-mi săptămâna N"
 * ar fi însemnat un tur la server la fiecare apăsare, pentru un conținut care
 * încape într-un răspuns.
 *
 * Lista goală acoperă trei situații pe care pagina le tratează identic: nu s-a
 * scris încă nimic, totul e ascuns, sau tot ce există sunt versiuni înlocuite.
 * Serverul nu le distinge deliberat — un vizitator n-are de ce să afle care e
 * cazul.
 *
 * Aceeași formă ca `fetchPublicConfig`: RPC stabil peste un tabel închis, cu
 * cheia publicabilă.
 */
export const fetchWeeklyWorkouts = async (signal?: AbortSignal): Promise<WeeklyWorkout[]> => {
  const res = await fetch(`${SUPABASE.url}/rest/v1/rpc/public_weekly_workouts`, {
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
  // Tolerant ca `parseEventConfig`: ce nu are forma așteptată se sare, în loc să
  // rupă pagina. O săptămână stricată nu are de ce să le ascundă pe celelalte.
  if (!Array.isArray(raw)) return [];
  const program = raw.flatMap((element): WeeklyWorkout[] => {
    if (typeof element !== 'object' || element === null) return [];
    const { numar, titlu, corp } = element as Record<string, unknown>;
    if (typeof numar !== 'number' || !Number.isFinite(numar)) return [];
    if (typeof titlu !== 'string' || typeof corp !== 'string') return [];
    return [{ numar, titlu, corp }];
  });
  // Serverul le dă deja crescător. Sortăm oricum: ordinea E programul, iar
  // pagina n-are de ce să depindă de ordonarea din corpul unui RPC.
  return program.sort((a, b) => a.numar - b.numar);
};
