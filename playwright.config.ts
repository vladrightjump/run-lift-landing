import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

/**
 * Teste e2e pentru landing.
 * Testele mock-uiesc endpoint-ul Supabase, deci nu scriu în baza de date reală.
 *
 * DOUĂ ținte, aceleași teste:
 *
 *  - implicit, dev server-ul Vite — pentru iterat local (HMR, `reuseExistingServer`);
 *  - cu `E2E_PREVIEW=1`, build-ul din `dist/` servit de `vite preview`.
 *
 * CI rulează varianta a doua, din două motive. E de două ori mai rapidă (58s
 * față de 2m01s pe aceleași două worker-e: dev server-ul transformă modulele la
 * fiecare cerere, iar suita încarcă pagina de sute de ori). Și verifică bundle-ul
 * care chiar ajunge în producție, nu unul construit altfel.
 *
 * `E2E_PREVIEW=1` servește `dist/` AȘA CUM E: dacă e vechi, testele trec pe cod
 * vechi. De aceea și CI, și `npm run verify` construiesc imediat înainte.
 */
const PE_BUILD = !!process.env.E2E_PREVIEW;

// Fără build, `vite preview` n-are ce servi și Playwright doar aștepta portul
// 60 de secunde, ca să raporteze „Timed out waiting from config.webServer" —
// un mesaj care nu spune ce lipsește. Cădem imediat, cu ce e de făcut.
if (PE_BUILD && !existsSync('dist/index.html')) {
  throw new Error(
    'E2E_PREVIEW=1 servește `dist/`, dar `dist/index.html` lipsește. Rulează întâi `npm run build` ' +
      '(sau `npm run verify`, care le înlănțuie).'
  );
}

export default defineConfig({
  testDir: './tests',
  // Doar fișierele .spec.ts sunt e2e; tests/unit/*.test.ts aparțin vitest
  // și nu pot fi încărcate de Playwright (import din 'vitest' => crash).
  testMatch: /.*\.spec\.ts/,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // `--strictPort`: dacă 5173 e ocupat, preview-ul cade în loc să se mute pe
    // alt port și să lase testele să lovească altceva.
    command: PE_BUILD ? 'npm run preview -- --port 5173 --strictPort' : 'npm run dev',
    url: 'http://localhost:5173',
    // Pe build NU reutilizăm niciodată un server pornit deja: un `npm run dev`
    // uitat pe 5173 ar fi preluat tăcut, iar rularea care crede că verifică
    // `dist/` ar verifica de fapt sursele. Pe dev, reutilizarea rămâne — acolo
    // e chiar ce vrei când iterezi.
    reuseExistingServer: !process.env.CI && !PE_BUILD,
    timeout: 60_000,
  },
});
