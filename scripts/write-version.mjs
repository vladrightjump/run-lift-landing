/**
 * Ștampilează build-ul cu commit-ul curent în `dist/version.json`, ca CI-ul să
 * poată verifica după deploy că build-ul NOU e chiar cel live (poll pe
 * `/version.json`). Rulează la finalul lui `npm run build`.
 *
 * SHA-ul vine din env-ul de build al Vercel (`VERCEL_GIT_COMMIT_SHA`), altfel din
 * GitHub Actions (`GITHUB_SHA`), altfel din git local.
 */
import { writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const gitSha = () => {
  try {
    return execSync('git rev-parse HEAD').toString().trim();
  } catch {
    return 'unknown';
  }
};

const commit = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || gitSha();
const payload = { commit, builtAt: new Date().toISOString() };

writeFileSync(new URL('../dist/version.json', import.meta.url), JSON.stringify(payload) + '\n');
console.log(`✓ dist/version.json → commit ${commit.slice(0, 8)}`);
