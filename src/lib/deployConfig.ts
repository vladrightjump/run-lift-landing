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

/** Extrage conținutul directivei `connect-src` din headerul CSP al `vercel.json`. */
export const extractConnectSrc = (vercel: VercelJson): string => {
  const all = (vercel.headers ?? []).flatMap((h) => h.headers ?? []);
  const csp = all.find((h) => h.key.toLowerCase() === 'content-security-policy');
  if (!csp) throw new Error('vercel.json: lipsește headerul Content-Security-Policy');
  const match = /connect-src([^;]*)/i.exec(csp.value);
  if (!match) throw new Error('CSP: lipsește directiva connect-src');
  return match[1];
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

  return problems;
};
