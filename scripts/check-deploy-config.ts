/**
 * Gardă de build: oprește deploy-ul dacă CSP-ul `connect-src` din `vercel.json`
 * nu corespunde cu `SUPABASE.url` (proiectul Supabase curent). Rulează în
 * `npm run build` ÎNAINTE de `vite build`, deci un drift face build-ul Vercel
 * să pice — regresia din 4 august nu mai poate ajunge în producție.
 *
 * Logica de verificare stă în `src/lib/deployConfig.ts` (partajată cu testul).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { checkDeployConfig } from '../src/lib/deployConfig';
import { sqlDinRadacina, mesajSqlInRadacina } from './rootSqlGuard';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string): string => readFileSync(resolve(repoRoot, rel), 'utf8');

const problems = checkDeployConfig({
  vercelJson: read('vercel.json'),
  indexHtml: read('index.html'),
});

if (problems.length > 0) {
  console.error('\n✗ Config de deploy inconsistent (CSP ↔ SUPABASE.url / Turnstile):');
  for (const p of problems) console.error(`  - ${p}`);
  console.error(
    '\nActualizează `vercel.json` (headerul CSP: connect-src / script-src / frame-src)\n' +
      'ca să corespundă cu `src/lib/backend.ts` (SUPABASE.url) și cu Turnstile.\n' +
      'Vezi src/lib/deployConfig.ts.\n'
  );
  process.exit(1);
}

/**
 * Cheia publică Turnstile. Fără ea, `src/lib/turnstile.ts` se dezactivează
 * singur — util în dev, dar în producție ar însemna captcha oprit fără ca nimeni
 * să observe. De aceea build-ul de producție Vercel pică; local doar avertizează.
 */
const siteKey = process.env.VITE_TURNSTILE_SITE_KEY ?? '';
if (!siteKey) {
  if (process.env.VERCEL_ENV === 'production') {
    console.error(
      '\n✗ VITE_TURNSTILE_SITE_KEY lipsește la un build de PRODUCȚIE.\n' +
        '  Fără ea, formularele s-ar trimite fără captcha. Adaug-o în Vercel →\n' +
        '  Project Settings → Environment Variables.\n'
    );
    process.exit(1);
  }
  console.warn('⚠ VITE_TURNSTILE_SITE_KEY lipsește — Turnstile dezactivat în acest build.');
}

// Igiena rădăcinii, DUPĂ verificările de deploy: un CSP stricat oprește
// înscrierile în producție, un fișier SQL rătăcit nu. Dacă amândouă sunt
// stricate, operatorul trebuie să vadă întâi diagnosticul care doare.
const sqlInRadacina = sqlDinRadacina(repoRoot);
if (sqlInRadacina.length > 0) {
  console.error(mesajSqlInRadacina(sqlInRadacina));
  process.exit(1);
}

console.log('✓ Config de deploy consistent (CSP ↔ SUPABASE.url, Turnstile).');
