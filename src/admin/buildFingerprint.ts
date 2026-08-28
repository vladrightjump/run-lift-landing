import type { EventConfig } from '../content/eventConfig';

/**
 * Compararea build-ului deployat cu configul publicat.
 *
 * De ce există: meta de share (title/description/Open Graph) se injectează în
 * HTML la BUILD, pentru că scraper-ele de WhatsApp/Facebook nu rulează JS.
 * Restul paginii citește configul publicat la runtime. Deci după o publicare din
 * admin, cardul de share rămâne pe datele build-ului până la următorul deploy.
 *
 * Asta NU e un bug de reparat, e o consecință a felului în care funcționează
 * scraper-ele. Ce se poate repara e tăcerea: backoffice-ul o spune, numind exact
 * câmpurile care diferă, în loc să lase organizatorul să afle din primul link
 * trimis pe WhatsApp.
 */

export type BuildInfo = {
  commit: string;
  builtAt: string;
  editie: number;
  meta: {
    eventName: string;
    start: string;
    venueName: string;
    venueCity: string;
    ogImageVersion: number;
  };
};

export type CampVechi = { camp: string; inBuild: string; publicat: string };

/** Etichete citibile, în ordinea în care contează pentru cardul de share. */
const ETICHETE: Record<keyof BuildInfo['meta'], string> = {
  eventName: 'numele evenimentului',
  start: 'data startului',
  venueName: 'numele locului',
  venueCity: 'orașul/zona',
  ogImageVersion: 'versiunea imaginii de share',
};

export const parseBuildInfo = (raw: unknown): BuildInfo | null => {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const m = r.meta as Record<string, unknown> | undefined;
  if (
    typeof r.commit !== 'string' ||
    typeof r.editie !== 'number' ||
    typeof m !== 'object' ||
    m === null ||
    typeof m.eventName !== 'string' ||
    typeof m.start !== 'string' ||
    typeof m.venueName !== 'string' ||
    typeof m.venueCity !== 'string' ||
    typeof m.ogImageVersion !== 'number'
  ) {
    return null;
  }
  return {
    commit: r.commit,
    builtAt: typeof r.builtAt === 'string' ? r.builtAt : '',
    editie: r.editie,
    meta: {
      eventName: m.eventName,
      start: m.start,
      venueName: m.venueName,
      venueCity: m.venueCity,
      ogImageVersion: m.ogImageVersion,
    },
  };
};

/**
 * Câmpurile în care build-ul deployat rămâne în urma configului publicat.
 *
 * Lista goală = share preview-ul e la zi. `ogImageVersion` nu se compară cu
 * configul (nu trăiește acolo — e a build-ului), deci nu apare niciodată aici.
 */
export const campuriVechiInBuild = (build: BuildInfo, publicat: EventConfig): CampVechi[] => {
  const perechi: [keyof BuildInfo['meta'], string, string][] = [
    ['eventName', build.meta.eventName, publicat.eventName],
    ['start', build.meta.start, publicat.start],
    ['venueName', build.meta.venueName, publicat.venue.name],
    ['venueCity', build.meta.venueCity, publicat.venue.city],
  ];

  return perechi
    .filter(([, inBuild, pub]) => inBuild !== pub)
    .map(([camp, inBuild, publicatVal]) => ({
      camp: ETICHETE[camp],
      inBuild,
      publicat: publicatVal,
    }));
};

/** Build-ul deployat, din `/version.json`. `null` dacă lipsește sau e stricat. */
export const fetchBuildInfo = async (signal?: AbortSignal): Promise<BuildInfo | null> => {
  try {
    const res = await fetch('/version.json', { cache: 'no-store', signal });
    if (!res.ok) return null;
    return parseBuildInfo(await res.json());
  } catch {
    // În dev nu există `dist/version.json` — absența nu e o eroare de raportat.
    return null;
  }
};
