/**
 * Configurare de MEDIU pentru backend (Supabase) — separată de datele de ediție.
 *
 * De ce separat de `content/edition.ts`: URL-ul/cheia/schema țin de proiectul
 * Supabase, nu de ediția evenimentului. Se schimbă rar (o migrare de proiect),
 * nu la fiecare ediție.
 *
 * `publishableKey` e cheia publică (safe în client): RLS permite doar INSERT în
 * `registrations`/`event_waitlist`/`launch_notifications` (cu `acord = true`) și
 * citirea RPC-ului `public_stats` (date ne-personale). Protecția vine din RLS,
 * nu din secretul cheii.
 *
 * `schema` = `runlift`: tabelele Run + Lift trăiesc în schema `runlift` a
 * proiectului ironworks-gym (partajat cu gym-app + botul de Telegram, care stau
 * în schema `public`). PostgREST rutează spre `runlift` prin headerele
 * Accept-Profile (GET) / Content-Profile (scriere). Schema TREBUIE expusă în
 * Supabase → Project Settings → API → Exposed schemas.
 */
export const SUPABASE = {
  url: 'https://whyndrjcezmtajbykeil.supabase.co',
  publishableKey: 'sb_publishable_SR4wCG4ZsSZYAqobBjUF_g_Xx4pRbHh',
  schema: 'runlift',
} as const;

export const isBackendConfigured = (): boolean =>
  SUPABASE.url.startsWith('https://') && SUPABASE.publishableKey.length > 0;
