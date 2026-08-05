import { defineConfig } from 'vitest/config';

/**
 * Teste de integrare LIVE — lovesc backendul Supabase real. Opt-in, separate de
 * `npm test`. Rulează cu:
 *   RUNLIFT_LIVE=1 SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   npm run test:integration
 * Fără `RUNLIFT_LIVE=1` + credențiale, testele se auto-omit (skip).
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
    globals: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
