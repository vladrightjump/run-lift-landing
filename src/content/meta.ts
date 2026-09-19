/**
 * Meta pentru share/SEO — derivată din `EDITION`, injectată în `index.html` la
 * build printr-un plugin Vite (`transformIndexHtml` din `vite.config.ts`).
 *
 * De ce build-time și nu runtime: scraper-ele de share (Facebook/WhatsApp/X)
 * citesc HTML-ul STATIC, fără să ruleze JS. Deci Open Graph trebuie să fie deja
 * în HTML la momentul servirii — de asta injectăm la build, nu din React.
 *
 * Proza de marketing (prefix/sufix) e statică; doar data/locația/versiunea og vin
 * din `EDITION`.
 */
import { EDITION } from './edition';
import { formatRoDate, weekdayRo, timeOf, deriveEventStrings } from './format';
import { SNAPSHOT_CONFIG } from './eventConfig';

const when = `${weekdayRo(EDITION.start, true)}, ${formatRoDate(EDITION.start)}`;
/**
 * Locul cursei, derivat din INSTANTANEUL de build — nu din configul publicat.
 * Meta se injectează în HTML la build, iar scraper-ele de share nu rulează JS,
 * deci aici nu există „runtime" de citit. O schimbare de locație din admin se
 * vede în share preview abia la următorul deploy; admin-ul o spune explicit.
 */
const place = deriveEventStrings(SNAPSHOT_CONFIG).EVENT_WHERE;

export const META = {
  /** „Run + Lift — Hyrox Trial · 8 august 2026". */
  title: `${EDITION.brand} — ${EDITION.eventName} · ${formatRoDate(EDITION.start)}`,

  /** Descrierea de share/SEO. */
  description:
    `Cursă în stil HYROX în aer liber — alergare + stații funcționale, contra cronometru. ` +
    `${when}, ${timeOf(EDITION.start)}, ${place}. Înscrie-te — locuri limitate.`,

  /** URL canonic / og:url. */
  url: EDITION.urls.site,

  /** Imaginea de share, cu bump de versiune per ediție (anti-cache). */
  ogImage: `${EDITION.urls.site}/og.png?v=${EDITION.ogImageVersion}`,

  /** Alt-textul imaginii de share. */
  ogImageAlt: `${EDITION.brand} — ${EDITION.eventName}. ${when}, ${place}.`,
} as const;

/**
 * Meta pentru `/antrenament` — FIXĂ, nedirivată din ediție.
 *
 * Pagina are shell-ul ei de build tocmai ca să poată avea cardul ăsta: linkul
 * lipit în story sau în Telegram arăta altfel cardul ediției, cu o dată care
 * putea fi deja trecută. Un card corect în fel, chiar dacă nu spune
 * antrenamentul săptămânii curente, e mai bun decât unul corect în detaliu
 * despre altceva.
 *
 * Nu urmărește conținutul săptămânii, deliberat: asta ar fi cerut randare per
 * cerere, adică infrastructură nouă pentru un card. Meta rămâne injectată
 * static, cum o cer scraperele de share, care nu rulează JS.
 */
export const META_ANTRENAMENT = {
  title: `Antrenamentul săptămânii — ${EDITION.brand}`,
  description:
    'Antrenamentul de alergare al săptămânii, așa cum îl facem la Run + Lift. ' +
    'Se schimbă în fiecare săptămână, la aceeași adresă.',
  url: `${EDITION.urls.site}/antrenament`,
  // Aceeași imagine ca pagina principală: e despre același eveniment, iar un
  // asset separat ar fi cerut un deploy pentru fiecare schimbare de poster.
  ogImage: `${EDITION.urls.site}/og.png?v=${EDITION.ogImageVersion}`,
  ogImageAlt: `${EDITION.brand} — antrenamentul săptămânii.`,
} as const;

/** Mapare placeholder → valoare, folosită de plugin-ul Vite din `vite.config.ts`. */
export const META_PLACEHOLDERS: Record<string, string> = {
  '%META_TITLE%': META.title,
  '%META_DESCRIPTION%': META.description,
  '%META_URL%': META.url,
  '%META_OG_IMAGE%': META.ogImage,
  '%META_OG_IMAGE_ALT%': META.ogImageAlt,
};

/** Aceleași placeholdere, valorile paginii de antrenament. */
export const META_PLACEHOLDERS_ANTRENAMENT: Record<string, string> = {
  '%META_TITLE%': META_ANTRENAMENT.title,
  '%META_DESCRIPTION%': META_ANTRENAMENT.description,
  '%META_URL%': META_ANTRENAMENT.url,
  '%META_OG_IMAGE%': META_ANTRENAMENT.ogImage,
  '%META_OG_IMAGE_ALT%': META_ANTRENAMENT.ogImageAlt,
};

/**
 * Ce set de valori primește fiecare shell. Cheia e numele fișierului, pentru că
 * exact asta primește plugin-ul Vite.
 */
export const META_PER_SHELL: Record<string, Record<string, string>> = {
  'index.html': META_PLACEHOLDERS,
  'antrenament.html': META_PLACEHOLDERS_ANTRENAMENT,
};
