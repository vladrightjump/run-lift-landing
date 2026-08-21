import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { SUPABASE } from '../../src/lib/config';
import {
  checkDeployConfig,
  checkTurnstileCsp,
  currentSupabaseRef,
  extractDirective,
  TURNSTILE_ORIGIN,
} from '../../src/lib/deployConfig';
import type { VercelJson } from '../../src/lib/deployConfig';

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

describe('CSP pentru Turnstile', () => {
  // Turnstile are nevoie de trei directive. Dacă lipsește vreuna, captcha pică
  // TĂCUT în producție și nimeni nu se mai poate înscrie — exact tiparul
  // regresiei din 4 august, de aceea îl prindem tot la build.
  const cspCu = (value: string) =>
    JSON.parse(
      JSON.stringify({ headers: [{ headers: [{ key: 'Content-Security-Policy', value }] }] })
    ) as VercelJson;

  it('fișierele reale permit challenges.cloudflare.com în toate cele trei directive', () => {
    const vercel = JSON.parse(realFiles().vercelJson) as VercelJson;
    expect(checkTurnstileCsp(vercel)).toEqual([]);
    for (const directive of ['script-src', 'frame-src', 'connect-src']) {
      expect(extractDirective(vercel, directive)).toContain(TURNSTILE_ORIGIN);
    }
  });

  it('raportează fiecare directivă care nu permite originul Turnstile', () => {
    const problems = checkTurnstileCsp(
      cspCu(`script-src 'self'; frame-src 'self'; connect-src 'self'`)
    );
    expect(problems).toHaveLength(3);
    expect(problems.join('\n')).toContain(TURNSTILE_ORIGIN);
  });

  it('raportează și când o singură directivă a rămas în urmă', () => {
    const problems = checkTurnstileCsp(
      cspCu(
        `script-src 'self' ${TURNSTILE_ORIGIN}; frame-src 'self'; connect-src 'self' ${TURNSTILE_ORIGIN}`
      )
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('frame-src');
  });

  it('checkDeployConfig include verificarea Turnstile', () => {
    const fara = JSON.stringify({
      headers: [
        {
          headers: [
            {
              key: 'Content-Security-Policy',
              value: `default-src 'self'; script-src 'self'; frame-src 'self'; connect-src 'self' ${SUPABASE.url}`,
            },
          ],
        },
      ],
    });
    const problems = checkDeployConfig({ vercelJson: fara, indexHtml: '<!doctype html>' });
    expect(problems.join('\n')).toContain(TURNSTILE_ORIGIN);
  });
});

describe('vercel.json — deploy doar via CI', () => {
  it('auto-deploy-ul git pe main e dezactivat (CI e singurul care face deploy)', () => {
    const vercel = JSON.parse(realFiles().vercelJson) as {
      git?: { deploymentEnabled?: Record<string, boolean> };
    };
    expect(vercel.git?.deploymentEnabled?.main).toBe(false);
  });
});
