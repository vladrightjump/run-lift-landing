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

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string): string => readFileSync(resolve(repoRoot, rel), 'utf8');

const problems = checkDeployConfig({
  vercelJson: read('vercel.json'),
  indexHtml: read('index.html'),
});

if (problems.length > 0) {
  console.error('\n✗ Config de deploy inconsistent (CSP connect-src ↔ SUPABASE.url):');
  for (const p of problems) console.error(`  - ${p}`);
  console.error(
    '\nActualizează `vercel.json` (headerul CSP, directiva connect-src) ca să corespundă\n' +
      'cu `src/lib/backend.ts` (SUPABASE.url). Vezi src/lib/deployConfig.ts.\n'
  );
  process.exit(1);
}

console.log('✓ Config de deploy consistent (CSP connect-src ↔ SUPABASE.url).');
