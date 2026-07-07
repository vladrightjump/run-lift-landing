/**
 * Configurări eveniment — actualizează valorile de mai jos manual.
 */

// Fallback static — folosit doar dacă API-ul de statistici nu răspunde.
// Numărul live vine din Supabase (vezi useStats).
export const OCCUPIED_SLOTS = 9;
export const TOTAL_SLOTS = 30;

// Orele sunt fixate pe fusul orar al Chișinăului (UTC+3 vara) — vizitatorii
// din alte fusuri văd același moment absolut, nu ora lor locală.
export const EVENT_DATE = new Date('2026-07-11T06:30:00+03:00'); // 11 iulie 2026, 06:30
export const EVENT_END_DATE = new Date(EVENT_DATE.getTime() + 6 * 60 * 60 * 1000); // start + 6h
export const REGISTRATION_DEADLINE = new Date('2026-07-11T00:00:00+03:00'); // până pe 10 iulie inclusiv

/**
 * Supabase — backend-ul de înscrieri.
 *
 * `publishableKey` e cheia publică (safe în client): permite doar INSERT
 * în `registrations` (RLS) și citirea RPC-ului `public_stats`, care expune
 * exclusiv date ne-personale (număr înscriși + prenume + echipă).
 */
export const SUPABASE = {
  url: 'https://iattqvakxcgepjiecgpf.supabase.co',
  publishableKey: 'sb_publishable_aNPzVWhAckqnG3qubS00vA_KoBQmh5s',
} as const;

export const isBackendConfigured = (): boolean =>
  SUPABASE.url.startsWith('https://') && SUPABASE.publishableKey.length > 0;
