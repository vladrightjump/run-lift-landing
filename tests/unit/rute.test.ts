import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Aplicația nu folosește router: `main.tsx` alege pagina după
 * `window.location.pathname`. Ca Vercel să servească acele rute pe refresh
 * sau acces direct, fiecare are nevoie de un rewrite către /index.html.
 *
 * Testul ăsta există pentru că exact asta s-a rupt în producție: ruta
 * /despre-noi funcționa în dev, dar dădea 404 pe site pentru că lipsea
 * rewrite-ul. Un test verde aici înseamnă că nu se mai poate întâmpla.
 */

const root = resolve(__dirname, '../..');
const mainTsx = readFileSync(resolve(root, 'src/main.tsx'), 'utf8');
const vercelJson = JSON.parse(readFileSync(resolve(root, 'vercel.json'), 'utf8'));

/** Extrage rutele comparate în main.tsx: path === '/ceva' */
const ruteDinCod = (): string[] => {
  const matches = mainTsx.matchAll(/path\s*===\s*['"](\/[^'"]*)['"]/g);
  return [...new Set([...matches].map((m) => m[1]))];
};

const ruteDinVercel = (): string[] =>
  (vercelJson.rewrites ?? []).map((r: { source: string }) => r.source);

describe('rutele au rewrite în vercel.json', () => {
  it('main.tsx declară cel puțin o rută', () => {
    expect(ruteDinCod().length).toBeGreaterThan(0);
  });

  it('fiecare rută din main.tsx are rewrite către /index.html', () => {
    const rewrites = vercelJson.rewrites ?? [];
    for (const ruta of ruteDinCod()) {
      const rw = rewrites.find((r: { source: string }) => r.source === ruta);
      expect(rw, `Ruta ${ruta} nu are rewrite în vercel.json → va da 404 în producție`).toBeDefined();
      expect(rw.destination).toBe('/index.html');
    }
  });

  it('nu există rewrite-uri orfane pentru rute inexistente', () => {
    const rute = ruteDinCod();
    for (const source of ruteDinVercel()) {
      expect(rute, `Rewrite pentru ${source} dar ruta nu există în main.tsx`).toContain(source);
    }
  });
});

describe('legăturile interne duc spre rute reale', () => {
  const fisiere = [
    'src/components/ComingSoon.tsx',
    'src/components/DespreNoi.tsx',
    'src/components/Confirmare.tsx',
  ];

  it('fiecare href intern e o rută cunoscută sau o ancoră', () => {
    const cunoscute = new Set([...ruteDinCod(), '/']);
    for (const f of fisiere) {
      const sursa = readFileSync(resolve(root, f), 'utf8');
      for (const m of sursa.matchAll(/href="(\/[^"#]*)"/g)) {
        const href = m[1];
        expect(cunoscute, `${f}: href="${href}" nu corespunde niciunei rute`).toContain(href);
      }
    }
  });
});
