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
  },
});
