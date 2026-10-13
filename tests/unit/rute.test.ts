import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROUTE_PATHS } from '../../src/app/routes';

/**
 * Routerul declară paginile aplicației. Ca Vercel să servească acele rute pe refresh
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
const vercelJson = JSON.parse(readFileSync(resolve(root, 'vercel.json'), 'utf8'));

/** Shell-urile HTML din rădăcina repo-ului — intrările de build. */
const shellsExistente = (): string[] =>
  readdirSync(root)
    .filter((f) => f.endsWith('.html'))
    .map((f) => `/${f}`);

/** Rutele declarate de router; rădăcina nu cere rewrite. */
const ruteDinCod = (): string[] => ROUTE_PATHS.filter((path) => path !== '/');

type Rewrite = { source: string; destination: string };

const assertRouteTargets = (rewrites: Rewrite[]) => {
  const shells = shellsExistente();
  for (const ruta of ruteDinCod()) {
    const rw = rewrites.find((r: { source: string }) => r.source === ruta);
    expect(rw, `Ruta ${ruta} nu are rewrite în vercel.json → va da 404 în producție`).toBeDefined();
    expect(
      shells,
      `Rewrite-ul rutei ${ruta} duce spre ${rw?.destination}, care nu există în repo → 404 în producție`
    ).toContain(rw?.destination);
  }
};

const assertRewriteSources = (rewrites: Rewrite[]) => {
  const rute = ruteDinCod();
  for (const { source } of rewrites) {
    expect(rute, `Rewrite pentru ${source} dar ruta nu există în router`).toContain(source);
  }
};

describe('rutele au rewrite în vercel.json', () => {
  it('routerul declară cel puțin o rută', () => {
    expect(ruteDinCod().length).toBeGreaterThan(0);
  });

  it('fiecare rută din router are rewrite către un shell care există', () => {
    assertRouteTargets(vercelJson.rewrites ?? []);
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

  it('detectează și un rewrite lipsă, și unul orfan', () => {
    const rewrites = vercelJson.rewrites ?? [];
    expect(() => assertRouteTargets(rewrites.filter((r: Rewrite) => r.source !== '/admin')))
      .toThrow('Ruta /admin nu are rewrite');
    expect(() => assertRewriteSources([...rewrites, { source: '/ruta-inexistenta', destination: '/index.html' }]))
      .toThrow('Rewrite pentru /ruta-inexistenta dar ruta nu există');
  });

  it('nu există rewrite-uri orfane pentru rute inexistente', () => {
    assertRewriteSources(vercelJson.rewrites ?? []);
  });
});

describe('legăturile interne duc spre rute reale', () => {
  // Toate componentele publice și ale funcționalităților, oriunde stau: o listă
  // scrisă de mână ar fi rămas în urmă la prima mutare de fișier.
  const tsxDin = (dir: string): string[] =>
    readdirSync(resolve(root, dir), { withFileTypes: true }).flatMap((e) =>
      e.isDirectory()
        ? tsxDin(`${dir}/${e.name}`)
        : e.name.endsWith('.tsx') && !e.name.endsWith('.test.tsx')
          ? [`${dir}/${e.name}`]
          : []
    );
  const fisiere = ['src/features', 'src/shared/ui'].flatMap(tsxDin);

  it('fiecare href intern e o rută cunoscută sau o ancoră', () => {
    const cunoscute = new Set([...ruteDinCod(), '/']);
    for (const f of fisiere) {
      const sursa = readFileSync(resolve(root, f), 'utf8');
      // Query-ul nu face parte din rută: `/?preview=soon` (Site → Coming Soon) e tot `/`.
      for (const m of sursa.matchAll(/href="(\/[^"#?]*)/g)) {
        const href = m[1];
        expect(cunoscute, `${f}: href="${href}" nu corespunde niciunei rute`).toContain(href);
      }
    }
  });
});
