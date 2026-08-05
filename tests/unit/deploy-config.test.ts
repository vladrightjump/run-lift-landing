import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { SUPABASE } from '../../src/lib/config';

/**
 * Consistența configului de deploy — păzește regresia care a blocat înscrierile
 * în producție pe 4 august 2026: `vercel.json` avea CSP-ul `connect-src` rămas pe
 * proiectul Supabase vechi, așa că browserul bloca toate cererile spre backendul
 * nou, chiar dacă acesta funcționa perfect.
 *
 * Citim fișierele direct de pe disc (nu prin bundler) ca testul să reflecte exact
 * ce se deployează.
 */

// Nu folosim `new URL(..., import.meta.url)`: Vite transformă acel pattern într-o
// referință de asset (îl rescrie la un URL servit din root), așa că citirea de pe
// disc pică. Calculăm rădăcina repo-ului din calea fișierului de test.
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const readRepoFile = (relFromRepoRoot: string): string =>
  readFileSync(resolve(repoRoot, relFromRepoRoot), 'utf8');

const supabaseOrigin = new URL(SUPABASE.url).origin;

const cspConnectSrc = (): string => {
  const vercel = JSON.parse(readRepoFile('vercel.json')) as {
    headers?: Array<{ headers?: Array<{ key: string; value: string }> }>;
  };
  const all = (vercel.headers ?? []).flatMap((h) => h.headers ?? []);
  const csp = all.find((h) => h.key.toLowerCase() === 'content-security-policy');
  expect(csp, 'vercel.json trebuie să aibă un header Content-Security-Policy').toBeTruthy();
  const match = /connect-src([^;]*)/i.exec(csp!.value);
  expect(match, 'CSP trebuie să aibă o directivă connect-src').toBeTruthy();
  return match![1];
};

describe('CSP ↔ URL Supabase (vercel.json)', () => {
  it('connect-src permite exact originul Supabase din config', () => {
    expect(cspConnectSrc()).toContain(supabaseOrigin);
  });

  it('CSP nu mai referă proiectul Supabase vechi', () => {
    const csp = cspConnectSrc();
    expect(csp).not.toContain('iattqvakxcgepjiecgpf');
  });
});

describe('meta din index.html', () => {
  it('nu mai există referințe la proiectul Supabase vechi nicăieri în index.html', () => {
    expect(readRepoFile('index.html')).not.toContain('iattqvakxcgepjiecgpf');
  });
});
