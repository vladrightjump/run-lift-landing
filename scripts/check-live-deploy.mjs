/**
 * Verificare post-deploy pe LIVE (rulată de CI după ce a declanșat deploy-ul):
 *  1) build-ul NOU e chiar sus? — poll pe `/version.json` până `commit === EXPECTED_SHA`;
 *  2) CSP-ul live permite originul Supabase din `vercel.json`? — exact regresia din 4 aug.
 *
 * Iese cu cod != 0 (CI roșu) dacă build-ul nu apare în timeout sau CSP-ul e greșit.
 * Node pur (fetch global, Node ≥18) — fără toolchain, ca job-ul de deploy să fie ușor.
 *
 * Env: EXPECTED_SHA (obligatoriu), SITE_URL (default parktraining.fit), TIMEOUT_MS.
 */
import { readFileSync } from 'node:fs';

const SITE = (process.env.SITE_URL ?? 'https://parktraining.fit').replace(/\/+$/, '');
const EXPECTED = process.env.EXPECTED_SHA;
const TIMEOUT_MS = Number(process.env.TIMEOUT_MS ?? 180_000);
const INTERVAL_MS = 5_000;

if (!EXPECTED) {
  console.error('✗ EXPECTED_SHA lipsește (setează-l la commit-ul deployat).');
  process.exit(2);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const bust = () => `cb=${Math.random().toString(36).slice(2)}`;
const connectSrcOf = (csp) => (/connect-src([^;]*)/i.exec(csp || '')?.[1] ?? '').trim();

const liveCommit = async () => {
  try {
    const res = await fetch(`${SITE}/version.json?${bust()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json())?.commit ?? null;
  } catch {
    return null;
  }
};

// 1) așteaptă ca build-ul EXPECTED să fie live
const started = Date.now();
let live = null;
while (Date.now() - started < TIMEOUT_MS) {
  live = await liveCommit();
  if (live === EXPECTED) break;
  console.log(`… aștept build-ul ${EXPECTED.slice(0, 8)} (live acum: ${live ? live.slice(0, 8) : 'n/a'})`);
  await sleep(INTERVAL_MS);
}
if (live !== EXPECTED) {
  console.error(
    `✗ Build-ul nou NU e live după ${Math.round((Date.now() - started) / 1000)}s ` +
      `(live: ${live ?? 'n/a'}, așteptat: ${EXPECTED.slice(0, 8)}).`
  );
  process.exit(1);
}
console.log(`✓ Build ${EXPECTED.slice(0, 8)} e live pe ${SITE}.`);

// 2) CSP-ul live trebuie să permită originul Supabase din vercel.json
const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
const cspValue = (vercel.headers ?? [])
  .flatMap((h) => h.headers ?? [])
  .find((h) => h.key.toLowerCase() === 'content-security-policy')?.value;
const supaOrigin = /https:\/\/[a-z0-9]+\.supabase\.co/i.exec(connectSrcOf(cspValue))?.[0];

const headRes = await fetch(`${SITE}/?${bust()}`, { cache: 'no-store' });
const liveConnect = connectSrcOf(headRes.headers.get('content-security-policy'));
if (supaOrigin && !liveConnect.includes(supaOrigin)) {
  console.error(`✗ CSP live nu permite ${supaOrigin} (live connect-src: "${liveConnect}").`);
  process.exit(1);
}
console.log(`✓ CSP live permite ${supaOrigin ?? '(origin Supabase negăsit în vercel.json)'}.`);
console.log('✓ Deploy verificat pe live.');
