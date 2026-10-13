import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

/**
 * Teste unitare (logică pură + guard-uri de configurare) și teste de componentă
 * pentru backoffice (`.test.tsx`, prin `@testing-library/react`).
 * Testele e2e rulează separat, cu Playwright: `npm run test:e2e`.
 */
export default defineConfig({
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
  },
  test: {
    globals: false,
    restoreMocks: true,
    setupFiles: ['./tests/support/vitest.setup.ts'],
    // Două proiecte, după extensie. jsdom costă: se construiește pentru fiecare
    // fișier și mânca jumătate din timpul suitei, deși majoritatea testelor `.ts`
    // sunt logică pură. Deci:
    //  - `.test.ts` rulează în Node; cine are nevoie de DOM (`window`,
    //    `localStorage`, `renderHook`) o spune pe primul rând, cu
    //    `// @vitest-environment jsdom`. Fără el, testul pică zgomotos
    //    („document is not defined"), nu trece pe alt drum;
    //  - `.test.tsx` (componente) rulează în jsdom.
    projects: [
      {
        extends: true,
        test: { name: 'node', environment: 'node', include: ['src/**/*.test.ts', 'tests/unit/**/*.test.ts'] },
      },
      {
        extends: true,
        test: { name: 'dom', environment: 'jsdom', include: ['src/**/*.test.tsx', 'tests/unit/**/*.test.tsx'] },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        // Puncte de intrare: montează arborele, n-au logică proprie.
        'src/app/main.tsx',
        'src/app/admin-preview.tsx',
        'src/app/vite-env.d.ts',
      ],
      reporter: ['text-summary', 'json-summary'],
      // Praguri de CLICHET: coborâte sub valoarea măsurată, ca să prindă o
      // regresie fără să blocheze un PR pentru zgomot. Se URCĂ pe măsură ce
      // acoperirea crește; nu se coboară niciodată. Vezi `CI-CD.md`.
      // Resetarea unică U13, măsurată pe 13 octombrie 2026 după eliminarea
      // structurii vechi și colocarea testelor, conform planului de arhitectură:
      // linii 84,56 · instrucțiuni 82,85 · funcții 80,08 · ramuri 77,93.
      // Pragurile sunt întregii imediat inferiori; de aici clichetul doar urcă.
      thresholds: {
        lines: 84,
        statements: 82,
        functions: 80,
        branches: 77,
      },
    },
  },
});
