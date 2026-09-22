import { defineConfig } from 'vitest/config';

/**
 * Teste unitare (logică pură + guard-uri de configurare) și teste de componentă
 * pentru backoffice (`.test.tsx`, prin `@testing-library/react`).
 * Testele e2e rulează separat, cu Playwright: `npm run test:e2e`.
 */
export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.ts', 'tests/unit/**/*.test.tsx'],
    globals: false,
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        // Puncte de intrare: montează arborele, n-au logică proprie.
        'src/main.tsx',
        'src/admin-preview.tsx',
        'src/vite-env.d.ts',
      ],
      reporter: ['text-summary', 'json-summary'],
      // Praguri de CLICHET: coborâte sub valoarea măsurată, ca să prindă o
      // regresie fără să blocheze un PR pentru zgomot. Se URCĂ pe măsură ce
      // acoperirea crește; nu se coboară niciodată. Vezi `CI-CD.md`.
      // Măsurate pe 22 septembrie 2026, după
      // `docs/plans/2026-09-22-1328-feat-admin-pe-ecrane-plan.md`:
      // linii 75,99 · instrucțiuni 74,13 · funcții 70,77 · ramuri 67,20.
      // (Anterior, 21 septembrie: 75,36 · 73,55 · 69,65 · 66,42.)
      // (Anterior, 18 septembrie: 74,35 · 72,9 · 69,75 · 65,71. „Funcții" a
      // scăzut cu o zecime — `analytics.ts` aduce funcții noi, nu toate atinse
      // de teste — deci pragul ei rămâne pe loc. Clichetul nu coboară.)
      thresholds: {
        lines: 75,
        statements: 74,
        functions: 70,
        branches: 67,
      },
    },
  },
});
