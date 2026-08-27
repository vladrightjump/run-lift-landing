import { EDITION } from '../content/edition';

/**
 * Ținerea vizitatorilor pe domeniul de producție.
 *
 * Deployment-ul de producție e accesibil și pe URL-ul lui de pe `*.vercel.app`,
 * nu doar pe `parktraining.fit`. Un astfel de link scapă ușor mai departe —
 * dintr-un istoric de browser, dintr-un mesaj, dintr-un bookmark vechi — și
 * ajunge pe o pagină pe jumătate funcțională: funcția de email are
 * `Access-Control-Allow-Origin: https://parktraining.fit`, deci înscrierile
 * trimise de acolo sunt refuzate de CORS. Iar ce se distribuie mai departe de
 * pe pagina aia arată un domeniu care nu e al evenimentului.
 *
 * DOAR de pe producție. Preview-urile de PR trebuie să rămână unde sunt —
 * altfel n-ar mai exista niciun fel de a verifica o schimbare înainte de merge.
 * Deosebirea vine din `VERCEL_ENV`, ștampilat la build (vezi `vite.config.ts`).
 */

/** Hostul canonic, derivat din URL-ul de brand — nu scris a doua oară aici. */
export const HOST_CANONIC = new URL(EDITION.urls.site).host;

export type ContextRedirect = {
  /** `VERCEL_ENV` de la build: 'production' | 'preview' | 'development'. */
  env: string;
  /** `window.location.href` al paginii curente. */
  href: string;
};

/**
 * URL-ul spre care trebuie mutat vizitatorul, sau `null` dacă e deja unde
 * trebuie (sau dacă nu suntem pe producție).
 *
 * Destinația se COMPUNE din originea canonică plus calea curentă — nu se
 * preia din `href`. Un URL construit din ce vine de la client ar fi exact
 * forma unui open redirect; aici originea e o constantă, deci nu se poate
 * ajunge nicăieri altundeva.
 */
export const redirectCanonic = ({ env, href }: ContextRedirect): string | null => {
  // Preview și dev rămân pe loc.
  if (env !== 'production') return null;

  let curent: URL;
  try {
    curent = new URL(href);
  } catch {
    return null;
  }

  if (curent.host === HOST_CANONIC) return null;

  // Calea, query-ul și ancora se păstrează: un link către /despre-noi?x=1#y
  // trebuie să ajungă în același loc, pe domeniul bun.
  return `https://${HOST_CANONIC}${curent.pathname}${curent.search}${curent.hash}`;
};
