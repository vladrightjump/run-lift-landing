import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { SUPABASE } from '../../src/lib/config';
import { checkDeployConfig, currentSupabaseRef } from '../../src/lib/deployConfig';

/**
 * Consistența configului de deploy — păzește regresia care a blocat înscrierile
 * în producție pe 4 august 2026: `vercel.json` avea CSP-ul `connect-src` rămas pe
 * proiectul Supabase vechi, așa că browserul bloca toate cererile spre backendul
 * nou, chiar dacă acesta funcționa perfect.
 *
 * Aceeași logică (`checkDeployConfig`) e rulată de gardă de build
 * (`scripts/check-deploy-config.ts`) înainte de `vite build`, deci un drift face
 * build-ul Vercel să pice.
 *
 * Nu folosim `new URL(..., import.meta.url)`: Vite transformă acel pattern într-o
 * referință de asset (URL servit din root), deci citirea de pe disc pică.
 */
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const readRepoFile = (rel: string): string => readFileSync(resolve(repoRoot, rel), 'utf8');

const realFiles = () => ({
  vercelJson: readRepoFile('vercel.json'),
  indexHtml: readRepoFile('index.html'),
});

describe('checkDeployConfig — fișierele reale din repo', () => {
  it('nu raportează nicio problemă (CSP connect-src ↔ SUPABASE.url)', () => {
    expect(checkDeployConfig(realFiles())).toEqual([]);
  });

  it('connect-src permite exact originul Supabase din config', () => {
    const origin = new URL(SUPABASE.url).origin;
    const vercel = JSON.parse(realFiles().vercelJson) as {
      headers: Array<{ headers: Array<{ key: string; value: string }> }>;
    };
    const csp = vercel.headers
      .flatMap((h) => h.headers)
      .find((h) => h.key.toLowerCase() === 'content-security-policy');
    expect(csp?.value).toContain(origin);
  });
});

describe('checkDeployConfig — detectează drift-ul', () => {
  const OLD_REF = 'iattqvakxcgepjiecgpf';

  it('raportează când connect-src e pe un proiect Supabase străin', () => {
    const badVercel = JSON.stringify({
      headers: [
        {
          headers: [
            {
              key: 'Content-Security-Policy',
              value: `default-src 'self'; connect-src 'self' https://${OLD_REF}.supabase.co; object-src 'none'`,
            },
          ],
        },
      ],
    });
    const problems = checkDeployConfig({ vercelJson: badVercel, indexHtml: '<!doctype html>' });
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.join('\n')).toContain(OLD_REF);
  });

  it('raportează referință străină în index.html', () => {
    const good = realFiles();
    const problems = checkDeployConfig({
      vercelJson: good.vercelJson,
      indexHtml: `<link href="https://${OLD_REF}.supabase.co">`,
    });
    expect(problems.join('\n')).toContain(OLD_REF);
  });

  it('raportează lipsa headerului CSP', () => {
    const problems = checkDeployConfig({ vercelJson: '{}', indexHtml: '' });
    expect(problems.join('\n')).toMatch(/Content-Security-Policy/i);
  });

  it('currentSupabaseRef corespunde cu SUPABASE.url', () => {
    expect(SUPABASE.url).toContain(currentSupabaseRef());
  });
});
