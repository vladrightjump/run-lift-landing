/**
 * Numărătoarea de trafic (Vercel Web Analytics).
 *
 * Două lucruri, separate deliberat: `curataEveniment` e o funcție pură care
 * decide ce URL are voie să plece, iar `pornesteAnalitice` e efectul secundar
 * care pornește scriptul. Aceeași împărțire ca la `deployConfig.ts` ↔
 * `scripts/check-deploy-config.ts`: regula se testează fără browser.
 *
 * DOUĂ decizii merită ținute minte, pentru că amândouă au un motiv care nu se
 * vede din cod:
 *
 * 1. Poarta e `env`, PRIMIT ca parametru, nu `import.meta.env.PROD` citit aici.
 *    `import.meta.env.PROD` e adevărat și sub `vite preview` — exact acolo unde
 *    rulează testele e2e și unde `/_vercel/insights/*` nu există. Scriptul ar
 *    da 404 la fiecare rulare, adică fix motivul pentru care blocurile de
 *    `<script>` au fost scoase din `index.html` în august. Iar parametrul (în
 *    loc de `__VERCEL_ENV__` citit direct) e ca la `redirectCanonic`:
 *    `__VERCEL_ENV__` e un `define` din `vite.config.ts`, iar `vitest.config.ts`
 *    e un config separat, fără `define` — un modul care l-ar citi direct ar
 *    arunca `ReferenceError` în testele unitare.
 *
 * 2. Parametrii de query trec printr-o listă ALBĂ, nu printr-una neagră.
 *    `/confirmare`, `/unsubscribe` și `/renunt` primesc tokenuri de unică
 *    folosință prin URL, iar Vercel stochează URL-ul și parametrii ca atare —
 *    ar ajunge în panoul de URL-uri al dashboard-ului. O listă neagră care
 *    scoate `token` ar rata următorul parametru secret adăugat; lista albă îl
 *    obligă pe cel care-l adaugă să treacă pe aici.
 */
import { inject, type BeforeSendEvent } from '@vercel/analytics';

/** Singurii parametri de query care au voie să plece spre Vercel. */
const PARAMETRI_PERMISI = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'ref',
]);

/**
 * Origine folosită DOAR ca bază pentru `new URL` când primim o cale relativă.
 * Nu ajunge în ce se trimite: din URL-ul rezultat păstrăm doar calea și query-ul.
 */
const BAZA = 'https://parktraining.fit';

/**
 * URL-ul care are voie să plece, sau `null` dacă evenimentul se aruncă.
 *
 * Aruncă `/admin` (backoffice, nu trafic public — l-ar umfla panourile) și taie
 * fragmentul (`#s2`, pus de `Antrenament.tsx` la derulare).
 */
export const curataEveniment = (url: string): string | null => {
  let adresa: URL;
  try {
    adresa = new URL(url, BAZA);
  } catch {
    // Un URL pe care browserul nu-l poate parsa n-are ce căuta în statistici.
    return null;
  }

  const cale = adresa.pathname.replace(/\/+$/, '') || '/';
  if (cale === '/admin' || cale.startsWith('/admin/')) return null;

  const pastrati = new URLSearchParams();
  for (const [cheie, valoare] of adresa.searchParams) {
    if (PARAMETRI_PERMISI.has(cheie)) pastrati.append(cheie, valoare);
  }

  const query = pastrati.toString();
  return query ? `${cale}?${query}` : cale;
};

let pornit = false;
let ultimulUrl: string | null = null;

/**
 * Pornește numărătoarea. Tăcută în orice mediu în afară de producție, și
 * idempotentă — ca `installGlobalMonitoring`.
 *
 * @param env `VERCEL_ENV` de la build: 'production' | 'preview' | 'development'.
 */
export const pornesteAnalitice = (env: string): void => {
  if (env !== 'production' || pornit || typeof window === 'undefined') return;
  pornit = true;

  inject({
    mode: 'production',
    beforeSend: (eveniment: BeforeSendEvent) => {
      const url = curataEveniment(eveniment.url);
      if (url === null) return null;

      // Două evenimente consecutive cu același URL se reduc la unul. Ține în
      // frâu `replaceState`-ul cu fragment din `/antrenament`, care altfel ar
      // putea trimite câte un eveniment la fiecare secțiune derulată.
      if (url === ultimulUrl) return null;
      ultimulUrl = url;

      return { ...eveniment, url };
    },
  });
};

/** Doar pentru teste: readuce modulul la starea de dinainte de pornire. */
export const reseteazaAnaliticePentruTeste = (): void => {
  pornit = false;
  ultimulUrl = null;
};
