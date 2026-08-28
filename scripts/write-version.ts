/**
 * Ștampilează build-ul în `dist/version.json`, cu două scopuri:
 *
 *  1. commit-ul, ca CI-ul să verifice după deploy că build-ul NOU e chiar cel
 *     live (poll pe `/version.json`);
 *  2. AMPRENTA câmpurilor de ediție care hrănesc meta de share.
 *
 * De ce a doua: meta (title/description/Open Graph) se injectează în HTML la
 * BUILD, pentru că scraper-ele de share nu rulează JS. Restul paginii citește
 * configul publicat la runtime. Deci după o publicare din admin, share preview-ul
 * rămâne pe datele build-ului până la următorul deploy. Amprenta îi dă
 * backoffice-ului cum să vadă asta și să o spună, în loc să pretindă că e live.
 *
 * SHA-ul vine din env-ul de build al Vercel (`VERCEL_GIT_COMMIT_SHA`), altfel din
 * GitHub Actions (`GITHUB_SHA`), altfel din git local.
 */
import { writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { EDITION } from '../src/content/edition';

const gitSha = () => {
  try {
    return execSync('git rev-parse HEAD').toString().trim();
  } catch {
    return 'unknown';
  }
};

const commit = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || gitSha();

/**
 * Exact câmpurile din care `content/meta.ts` compune titlul, descrierea și
 * imaginea de share. Dacă vreunul diferă de configul publicat, preview-ul e
 * vechi — și doar acelea contează, nu tot documentul.
 */
const metaFields = {
  eventName: EDITION.eventName,
  start: EDITION.start,
  venueName: EDITION.venue.name,
  venueCity: EDITION.venue.city,
  ogImageVersion: EDITION.ogImageVersion,
};

const payload = {
  commit,
  builtAt: new Date().toISOString(),
  editie: EDITION.number,
  // Mediul cu care s-a compilat bundle-ul. Îl ștampilăm ca să se poată VERIFICA
  // de afară că mutarea de pe `*.vercel.app` pe domeniul evenimentului e activă:
  // ea pornește doar pe 'production', iar fiind un redirect din JS, un `curl` pe
  // pagină nu l-ar arăta. Aici se vede dintr-o cerere.
  vercelEnv: process.env.VERCEL_ENV ?? 'development',
  meta: metaFields,
};

writeFileSync(new URL('../dist/version.json', import.meta.url), JSON.stringify(payload) + '\n');
console.log(`✓ dist/version.json → commit ${commit.slice(0, 8)}, ediția ${EDITION.number}`);
