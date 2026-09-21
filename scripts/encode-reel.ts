/**
 * Duce un master exportat din Instagram până la clipul pe care îl servește
 * pagina: `public/reels/<slug>.mp4` + `public/reels/<slug>.jpg`.
 *
 *     npm run reel -- ~/Downloads/master.mp4 marti-in-parc [secunde]
 *
 * De ce există: masterele sunt la 28-30 Mbps, adică 150-250 MB bucata. Nicio
 * pagină nu servește așa ceva, iar transformarea manuală e exact pasul pe care
 * nimeni nu-l face de fiecare dată. Comanda e livrabilul care atacă asta.
 *
 * Produce DOAR fișierele. Legenda, linkul, ordinea și vizibilitatea se
 * administrează din `/admin` → Clipuri, peste tabelul `training_reels`.
 *
 * Calitatea se dă prin CRF, nu prin bitrate țintă: un CRF fix dă fișiere mici pe
 * cadre statice și mai mari acolo unde chiar e mișcare, ceea ce e exact profilul
 * unui clip de antrenament.
 *
 * Construcția argumentelor stă în funcții pure, exportate, ca testele să nu aibă
 * nevoie de `ffmpeg` instalat.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

/** Plafonul per clip. Peste atât, secțiunea costă mai mult decât hero-ul paginii. */
export const PLAFON_MB = 6;

/** Bucla implicită. Cardul e un cârlig, nu reel-ul întreg — ăla e pe Instagram. */
export const SECUNDE_IMPLICIT = 14;

/** Ținta de calitate. 24 ține un 1080x1920 pe la 2-4 MB la 14 secunde. */
export const CRF = 24;

/** Directorul de unde pagina citește clipurile. */
export const DIR_CLIPURI = 'public/reels';

/**
 * Slug-ul devine nume de fișier, deci e și o cale. Fără garda asta, un `../`
 * strecurat în argument ar scrie în afara directorului de clipuri.
 */
const SLUG_VALID = /^[a-z0-9][a-z0-9-]{1,40}$/;

export const slugValid = (slug: string): boolean => SLUG_VALID.test(slug);

type ArgsVideo = {
  master: string;
  iesire: string;
  secunde?: number;
  crf?: number;
};

/**
 * Argumentele pentru clipul livrabil.
 *
 * `-an` scoate pista audio: banda e mută prin construcție, iar un clip fără
 * sunet e singurul care are voie să pornească singur în toate browserele.
 * `-movflags +faststart` mută metadatele la începutul fișierului, ca redarea să
 * pornească înainte de descărcarea completă — fără el, browserul așteaptă tot.
 */
export const argumenteVideo = ({
  master,
  iesire,
  secunde = SECUNDE_IMPLICIT,
  crf = CRF,
}: ArgsVideo): string[] => [
  '-y',
  '-i',
  master,
  '-t',
  String(secunde),
  '-an',
  '-vf',
  'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920',
  '-c:v',
  'libx264',
  '-profile:v',
  'high',
  '-crf',
  String(crf),
  '-preset',
  'slow',
  '-pix_fmt',
  'yuv420p',
  '-movflags',
  '+faststart',
  iesire,
];

/** Primul cadru, ca poster. Cardul nu are voie să fie o casetă goală. */
export const argumentePoster = (video: string, iesire: string): string[] => [
  '-y',
  '-i',
  video,
  '-vframes',
  '1',
  '-q:v',
  '3',
  iesire,
];

export type Verdict = 'ok' | 'prea-mare';

/** Verdictul față de plafon. Semnalat vizibil, nu scris tăcut. */
export const verdictMarime = (octeti: number, plafonMb = PLAFON_MB): Verdict =>
  octeti > plafonMb * 1024 * 1024 ? 'prea-mare' : 'ok';

const mb = (octeti: number): string => (octeti / 1024 / 1024).toFixed(1);

const main = (): void => {
  const [master, slug, secundeBrut] = process.argv.slice(2);

  if (!master || !slug) {
    console.error('Folosire: npm run reel -- <master.mp4> <slug> [secunde]');
    process.exit(1);
  }

  if (!slugValid(slug)) {
    console.error(
      `Slug invalid: „${slug}". Doar litere mici, cifre și liniuțe, între 2 și 41 de caractere.`
    );
    process.exit(1);
  }

  if (!existsSync(master)) {
    console.error(`Masterul nu există: ${master}`);
    process.exit(1);
  }

  const secunde = secundeBrut ? Number(secundeBrut) : SECUNDE_IMPLICIT;
  if (!Number.isFinite(secunde) || secunde <= 0) {
    console.error(`Durata trebuie să fie un număr pozitiv de secunde, nu „${secundeBrut}".`);
    process.exit(1);
  }

  mkdirSync(DIR_CLIPURI, { recursive: true });
  const video = resolve(DIR_CLIPURI, `${slug}.mp4`);
  const poster = resolve(DIR_CLIPURI, `${slug}.jpg`);

  execFileSync('ffmpeg', ['-loglevel', 'error', ...argumenteVideo({ master, iesire: video, secunde })], {
    stdio: 'inherit',
  });
  execFileSync('ffmpeg', ['-loglevel', 'error', ...argumentePoster(video, poster)], {
    stdio: 'inherit',
  });

  const octeti = statSync(video).size;
  const verdict = verdictMarime(octeti);

  console.log(`✓ ${DIR_CLIPURI}/${slug}.mp4 — ${mb(octeti)} MB`);
  console.log(`✓ ${DIR_CLIPURI}/${slug}.jpg`);

  if (verdict === 'prea-mare') {
    console.error(
      `\n⚠ Clipul depășește plafonul de ${PLAFON_MB} MB. Scurtează bucla sau urcă CRF-ul peste ${CRF}.`
    );
    process.exit(1);
  }

  console.log(`
Mai departe, în /admin → Setup → Clipuri → „Adaugă în bandă":

  Calea clipului    /reels/${slug}.mp4
  Calea posterului  /reels/${slug}.jpg

Legenda și linkul postării se completează acolo. Fișierele de mai sus intră pe
site printr-un commit; ordinea și legendele se schimbă din admin, fără deploy.`);
};

// Rulat ca script, nu importat de teste.
if (process.argv[1]?.endsWith('encode-reel.ts')) main();
