import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Aplicația nu folosește router: `main.tsx` alege pagina după
 * `window.location.pathname`. Ca Vercel să servească acele rute pe refresh
 * sau acces direct, fiecare are nevoie de un rewrite către un shell HTML.
 *
 * Testul ăsta există pentru că exact asta s-a rupt în producție: ruta
 * /despre-noi funcționa în dev, dar dădea 404 pe site pentru că lipsea
 * rewrite-ul. Un test verde aici înseamnă că nu se mai poate întâmpla.
 *
 * Destinația nu mai e literal `/index.html`: `/antrenament` are shell-ul lui, ca
 * să-și poată avea propriul card de share (meta se injectează la build, deci un
 * card per pagină cere un fișier per pagină). Aserțiunea s-a lărgit exact cât
 * trebuie — destinația trebuie să fie un shell care EXISTĂ în repo. O rută fără
 * rewrite, sau un rewrite spre un fișier inexistent, pică la fel ca înainte.
 */

const root = resolve(__dirname, '../..');
const mainTsx = readFileSync(resolve(root, 'src/main.tsx'), 'utf8');
const vercelJson = JSON.parse(readFileSync(resolve(root, 'vercel.json'), 'utf8'));

/** Shell-urile HTML din rădăcina repo-ului — intrările de build. */
const shellsExistente = (): string[] =>
  readdirSync(root)
    .filter((f) => f.endsWith('.html'))
    .map((f) => `/${f}`);

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

  it('fiecare rută din main.tsx are rewrite către un shell care există', () => {
    const rewrites = vercelJson.rewrites ?? [];
    const shells = shellsExistente();
    for (const ruta of ruteDinCod()) {
      const rw = rewrites.find((r: { source: string }) => r.source === ruta);
      expect(rw, `Ruta ${ruta} nu are rewrite în vercel.json → va da 404 în producție`).toBeDefined();
      expect(
        shells,
        `Rewrite-ul rutei ${ruta} duce spre ${rw.destination}, care nu există în repo → 404 în producție`
      ).toContain(rw.destination);
    }
  });

  it('/antrenament e rutat spre shell-ul lui, nu spre cel al ediției', () => {
    // Regresia păzită: dacă ruta cade înapoi pe /index.html, pagina se randează
    // la fel și nimic nu pare rupt — dar linkul lipit în Telegram arată iar
    // cardul ediției, care e chiar lucrul pentru care există al doilea shell.
    //
    // NU e o regulă generală „fiecare shell trebuie rutat": `admin-preview.html`
    // stă în rădăcină ca demo de sine stătător și nu e ținta niciunei rute.
    const rw = (vercelJson.rewrites ?? []).find(
      (r: { source: string }) => r.source === '/antrenament'
    );
    expect(rw?.destination).toBe('/antrenament.html');
  });

  it('nu există rewrite-uri orfane pentru rute inexistente', () => {
    const rute = ruteDinCod();
    for (const source of ruteDinVercel()) {
      expect(rute, `Rewrite pentru ${source} dar ruta nu există în main.tsx`).toContain(source);
    }
  });
});

describe('legăturile interne duc spre rute reale', () => {
  // Landing-ul e spart în secțiuni (`landing/`) care au și ele linkuri interne
  // (tabul „Despre noi") — le scanăm pe toate, ca un href greșit să nu ajungă 404.
  const landingFiles = readdirSync(resolve(root, 'src/components/landing'))
    .filter((f) => f.endsWith('.tsx'))
    .map((f) => `src/components/landing/${f}`);
  const fisiere = [
    'src/components/ComingSoon.tsx',
    'src/components/DespreNoi.tsx',
    'src/components/Confirmare.tsx',
    'src/components/Landing.tsx',
    ...landingFiles,
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
