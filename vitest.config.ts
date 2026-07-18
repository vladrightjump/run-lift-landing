import { defineConfig } from 'vitest/config';

/**
 * Teste unitare (logică pură + guard-uri de configurare).
 * Testele e2e rulează separat, cu Playwright: `npm run test:e2e`.
 */
export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.ts'],
    globals: false,
    restoreMocks: true,
  },
});
