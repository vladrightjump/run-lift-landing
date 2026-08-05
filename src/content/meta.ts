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
import { formatRoDate, weekdayRo, timeOf } from './format';

const when = `${weekdayRo(EDITION.start, true)}, ${formatRoDate(EDITION.start)}`;
const place = `${EDITION.venue.name}, ${EDITION.venue.city}`;

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

/** Mapare placeholder → valoare, folosită de plugin-ul Vite din `vite.config.ts`. */
export const META_PLACEHOLDERS: Record<string, string> = {
  '%META_TITLE%': META.title,
  '%META_DESCRIPTION%': META.description,
  '%META_URL%': META.url,
  '%META_OG_IMAGE%': META.ogImage,
  '%META_OG_IMAGE_ALT%': META.ogImageAlt,
};
