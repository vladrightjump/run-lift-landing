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
      thresholds: {
        lines: 68,
        statements: 67,
        functions: 61,
        branches: 59,
      },
    },
  },
});
