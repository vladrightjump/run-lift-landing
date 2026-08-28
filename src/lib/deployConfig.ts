/**
 * Gardă de consistență a configului de deploy: CSP-ul `connect-src` din
 * `vercel.json` TREBUIE să corespundă cu backendul din `SUPABASE.url`.
 *
 * De ce există: pe 4 august 2026 înscrierile au picat în producție fiindcă
 * `vercel.json` rămăsese cu `connect-src` pe proiectul Supabase vechi, iar
 * browserul bloca (prin CSP) toate cererile spre backendul nou. Bugul a fost
 * invizibil pentru că un blocaj CSP arată ca o eroare oarecare de rețea.
 *
 * Logica e partajată între testul unitar (`tests/unit/deploy-config.test.ts`)
 * și gardă de build (`scripts/check-deploy-config.ts`, rulată în `npm run build`
 * ÎNAINTE de `vite build` — deci un drift face build-ul Vercel să pice).
 */
import { SUPABASE } from './backend';

export type VercelJson = {
  headers?: Array<{ headers?: Array<{ key: string; value: string }> }>;
};

/** Sub-domeniul de proiect al backendului curent (ex: `whyndrjcezmtajbykeil`). */
export const currentSupabaseRef = (): string =>
  new URL(SUPABASE.url).hostname.split('.')[0];

/** Extrage conținutul unei directive CSP (ex. `connect-src`) din `vercel.json`. */
export const extractDirective = (vercel: VercelJson, name: string): string => {
  const all = (vercel.headers ?? []).flatMap((h) => h.headers ?? []);
  const csp = all.find((h) => h.key.toLowerCase() === 'content-security-policy');
  if (!csp) throw new Error('vercel.json: lipsește headerul Content-Security-Policy');
  const match = new RegExp(`${name}([^;]*)`, 'i').exec(csp.value);
  if (!match) throw new Error(`CSP: lipsește directiva ${name}`);
  return match[1];
};

export const extractConnectSrc = (vercel: VercelJson): string =>
  extractDirective(vercel, 'connect-src');

/** Originul de la care se încarcă widgetul Turnstile și se face challenge-ul. */
export const TURNSTILE_ORIGIN = 'https://challenges.cloudflare.com';

/**
 * Turnstile are nevoie de trei directive CSP: `script-src` (api.js), `frame-src`
 * (iframe-ul de challenge) și `connect-src` (telemetria widgetului). Dacă lipsește
 * vreuna, captcha pică TĂCUT în producție și nimeni nu se mai poate înscrie — exact
 * tiparul regresiei din 4 august, de aceea îl prindem tot la build.
 */
export const checkTurnstileCsp = (vercel: VercelJson): string[] => {
  const problems: string[] = [];
  for (const directive of ['script-src', 'frame-src', 'connect-src']) {
    try {
      if (!extractDirective(vercel, directive).includes(TURNSTILE_ORIGIN)) {
        problems.push(`CSP ${directive} nu permite ${TURNSTILE_ORIGIN} (necesar pentru Turnstile)`);
      }
    } catch (e) {
      problems.push((e as Error).message);
    }
  }
  return problems;
};

const SUPABASE_REF_RE = /([a-z0-9]{20})\.supabase\.co/g;

/** Toate referințele de proiect Supabase (`<ref>.supabase.co`) dintr-un text. */
const supabaseRefsIn = (text: string): string[] =>
  [...text.matchAll(SUPABASE_REF_RE)].map((m) => m[1]);

/**
 * Verifică `vercel.json` + `index.html` față de `SUPABASE.url`. Întoarce lista
 * de probleme (gol = totul consistent). Nu aruncă — caller-ul decide cum
 * raportează (test `expect` vs. `process.exit(1)`).
 */
export const checkDeployConfig = (files: { vercelJson: string; indexHtml: string }): string[] => {
  const problems: string[] = [];
  const origin = new URL(SUPABASE.url).origin;
  const ref = currentSupabaseRef();

  let connectSrc = '';
  try {
    connectSrc = extractConnectSrc(JSON.parse(files.vercelJson) as VercelJson);
  } catch (e) {
    problems.push((e as Error).message);
  }

  if (connectSrc && !connectSrc.includes(origin)) {
    problems.push(
      `CSP connect-src nu permite originul Supabase curent ${origin} (găsit: "${connectSrc.trim()}")`
    );
  }

  // Orice referință de proiect Supabase DIFERITĂ de cea curentă = drift.
  const stale = (label: string, text: string) => {
    for (const found of supabaseRefsIn(text)) {
      if (found !== ref) {
        problems.push(`${label} conține referință la un proiect Supabase străin: ${found}.supabase.co`);
      }
    }
  };
  if (connectSrc) stale('CSP connect-src', connectSrc);
  stale('index.html', files.indexHtml);

  try {
    problems.push(...checkTurnstileCsp(JSON.parse(files.vercelJson) as VercelJson));
  } catch {
    // JSON invalid — deja raportat mai sus de extractConnectSrc.
  }

  return problems;
};
