/**
 * Configurări eveniment — actualizează valorile de mai jos manual.
 */

// Ediția curentă a evenimentului. Înscrierile noi se salvează cu această
// valoare (coloana `editie` din `registrations`); `public_stats` și lista
// din backoffice arată doar ediția curentă. La un eveniment nou: incrementezi.
// Sincron cu `app_config.current_event_edition` din Supabase (vezi
// funcția `current_event_edition()`, care alimentează defaults-urile și
// `public_stats`). La ediție nouă: incrementezi aici ȘI acolo.
export const CURRENT_EDITION = 3;

// Fallback static — folosit doar dacă API-ul de statistici nu răspunde.
// Numărul live vine din Supabase (vezi useStats).
export const OCCUPIED_SLOTS = 0;
export const TOTAL_SLOTS = 20;
// Locuri adiționale pe lista de așteptare (când cele TOTAL_SLOTS sunt pline).
export const WAITLIST_SLOTS = 10;

// Orele sunt fixate pe fusul orar al Chișinăului (UTC+3 vara) — vizitatorii
// din alte fusuri văd același moment absolut, nu ora lor locală.
export const EVENT_DATE = new Date('2026-07-25T07:00:00+03:00'); // 25 iulie 2026, 07:00
export const EVENT_END_DATE = new Date(EVENT_DATE.getTime() + 6 * 60 * 60 * 1000); // start + 6h
export const REGISTRATION_DEADLINE = new Date('2026-07-25T00:00:00+03:00'); // până pe 24 iulie inclusiv

/**
 * Coming Soon.
 * `SHOW_COMING_SOON = true` face ca homepage-ul (/) să afișeze ecranul Coming Soon
 * în locul landing-ului. Pune pe `false` ca să revii la landing-ul complet.
 */
export const SHOW_COMING_SOON = true;
export const LAUNCH_DATE = new Date('2026-07-22T18:00:00+03:00'); // 22 iulie 2026, 18:00

/**
 * Ediția pentru care se strâng acum înscrieri la „Anunță-mă la lansare".
 * Lista din `launch_notifications` e per-ediție: emailul e unic pe (email, ediție),
 * deci cine s-a înscris la o lansare anterioară se poate înscrie din nou.
 *
 * IMPORTANT: ediția pe rândurile noi o pune serverul (DEFAULT pe coloana `editie`).
 * Valoarea de aici e folosită doar de backoffice, ca să filtreze lista.
 * La ediție nouă: incrementezi aici ȘI schimbi default-ul coloanei în Supabase.
 */
export const CURRENT_LAUNCH_EDITION = 3;

/** Instagramul comunității — afișat în footer pe ambele pagini. */
export const INSTAGRAM_HANDLE = '@we_run_and_lift';
export const INSTAGRAM_URL = 'https://instagram.com/we_run_and_lift';

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
