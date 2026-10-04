import { defineRailway, github, preserve, project, service } from 'railway/iac';

/**
 * Serviciul Railway al botului de Telegram, descris în cod (Infrastructure as Code).
 *
 * Înlocuiește `bot/railway.json`: Railway nu mai citește „Config as Code" după
 * 1 decembrie 2026. Fișierul ăsta NU e citit la deploy — îl aplică CLI-ul,
 * explicit: `railway config plan` arată diferențele față de serviciul live,
 * `railway config apply` le pune (vezi `bot/README.md`, „Deploy").
 *
 * Proiectul Railway are un singur serviciu, iar codul lui e tot aici, deci
 * fișierul descrie proiectul întreg: o resursă lipsă de aici ar fi ștearsă la
 * `apply`.
 */
export default defineRailway(() => {
  const bot = service('bot', {
    // Botul se construiește din `bot/`, după CI: „Wait for CI" (`checkSuites`)
    // ține deploy-ul până trec toate job-urile commitului. Calea urmărită face
    // ca un commit doar pe site să nu repornească botul (R16, AE6).
    source: github('vladrightjump/run-lift-landing', {
      branch: 'main',
      rootDirectory: '/bot',
      checkSuites: true,
    }),
    build: {
      // Builderul din setările serviciului. Versiunea de Node vine din
      // `engines` în `bot/package.json` (24.x, LTS-ul din `.nvmrc`).
      builder: 'RAILPACK',
      buildCommand: 'npm run build',
      watchPatterns: ['/bot/**'],
    },
    deploy: {
      startCommand: 'npm start',
      // Un deploy care nu răspunde pe /health nu-l înlocuiește pe cel care merge.
      healthcheckPath: '/health',
      healthcheckTimeout: 120,
      restartPolicyType: 'ON_FAILURE',
      restartPolicyMaxRetries: 10,
      multiRegionConfig: { sfo: { numReplicas: 1 } },
    },
    // Valorile rămân pe Railway; fișierul doar le numește, ca `apply` să nu le
    // șteargă. `NIXPACKS_NODE_VERSION` nu-l mai citește nimeni pe Railpack, dar
    // întoarcerea pe repo-ul vechi (care cere NIXPACKS) are nevoie de el: se
    // scoate la oprirea gym-app (U11), odată cu repo-ul vechi.
    env: {
      TELEGRAM_BOT_TOKEN: preserve(),
      TELEGRAM_WEBHOOK_SECRET: preserve(),
      TELEGRAM_GROUP_CHAT_ID: preserve(),
      TELEGRAM_ADMIN_CHAT_IDS: preserve(),
      SUPABASE_URL: preserve(),
      SUPABASE_SERVICE_ROLE_KEY: preserve(),
      PUBLIC_URL: preserve(),
      TZ: preserve(),
      NIXPACKS_NODE_VERSION: preserve(),
    },
  });

  return project('parkgym-telegram-bot', { resources: [bot] });
});
