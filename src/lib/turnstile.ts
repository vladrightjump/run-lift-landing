/**
 * Cloudflare Turnstile — captcha invizibil pentru formularele publice.
 *
 * De ce există: până acum formularele făceau INSERT direct în PostgREST cu cheia
 * publishable, care e vizibilă în bundle. Un bot nu deschide site-ul, ci dă `curl`
 * pe endpoint. Token-ul de aici e verificat SERVER-SIDE, în funcția Edge
 * `submit-form` (vezi `supabase/functions/submit-form/index.ts`); RLS nu mai
 * permite insert direct din `anon`. Widgetul din client e doar generatorul de
 * token — securitatea stă în verificarea de pe server.
 *
 * Mod de operare: `appearance: 'interaction-only'` (widgetul e invizibil dacă
 * Cloudflare nu cere interacțiune) + `execution: 'execute'`, ca să cerem un token
 * PROASPĂT la fiecare submit. Token-urile Turnstile sunt de unică folosință și
 * expiră în ~5 minute, deci unul luat la montarea formularului ar fi deja mort
 * pentru un utilizator care completează pe îndelete.
 */

/** Cheia publică (site key). Goală = Turnstile dezactivat (dev local). */
export const TURNSTILE_SITE_KEY: string = import.meta.env.VITE_TURNSTILE_SITE_KEY ?? '';

export const isTurnstileEnabled = (): boolean => TURNSTILE_SITE_KEY.length > 0;

const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
/** Cât așteptăm un token înainte să renunțăm (challenge-urile grele pot dura). */
const EXECUTE_TIMEOUT_MS = 25_000;
/** Cât așteptăm `api.js`. Separat de cel de sus: se aplică înainte de challenge. */
const LOAD_TIMEOUT_MS = 10_000;

/**
 * Verificarea anti-bot nu s-a putut face în client (script blocat de un adblocker,
 * Cloudflare indisponibil, challenge eșuat). Distinctă de erorile de rețea ale
 * submit-ului, ca UI-ul să poată da un mesaj util („dezabilitează blocantul").
 */
export class TurnstileError extends Error {
  constructor(motiv: string) {
    super(`turnstile: ${motiv}`);
    this.name = 'TurnstileError';
  }
}

export const isTurnstileError = (err: unknown): boolean => err instanceof TurnstileError;

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  execute: (id: string | HTMLElement, opts?: Record<string, unknown>) => void;
  reset: (id?: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptPromise: Promise<TurnstileApi> | null = null;
let widgetId: string | null = null;
let container: HTMLDivElement | null = null;

/** Încarcă api.js o singură dată; reîncercabil dacă a eșuat (resetăm promisiunea). */
const loadApi = (): Promise<TurnstileApi> => {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_URL;
    script.async = true;
    script.defer = true;
    // Termen limită pe ÎNCĂRCARE. `onerror` prinde un refuz (adblock, DNS), dar
    // NU o cerere care atârnă: acolo nu se declanșează niciodată nimic, iar
    // cronometrul de 25s de mai jos nici măcar nu e armat încă — se armează
    // abia după ce `loadApi()` se rezolvă. Fără asta, un `api.js` care nu
    // răspunde lasă formularul în „se trimite" la nesfârșit.
    const timer = window.setTimeout(() => {
      script.remove();
      reject(new TurnstileError('api.js nu a răspuns la timp'));
    }, LOAD_TIMEOUT_MS);
    const done = () => window.clearTimeout(timer);
    script.onload = () => {
      done();
      if (window.turnstile) resolve(window.turnstile);
      else reject(new TurnstileError('api.js încărcat, dar window.turnstile lipsește'));
    };
    script.onerror = () => {
      done();
      script.remove();
      reject(new TurnstileError('api.js nu s-a putut încărca'));
    };
    document.head.appendChild(script);
  }).catch((err) => {
    // Permite o nouă încercare la următorul submit (rețea revenită, adblock oprit).
    scriptPromise = null;
    throw err;
  });

  return scriptPromise;
};

/**
 * Containerul widgetului. NU e `display:none`: Turnstile refuză să randeze
 * într-un element ascuns. Îl scoatem din flux și din arborele de accesibilitate;
 * când Cloudflare chiar cere interacțiune, widgetul apare ca overlay propriu.
 */
const ensureContainer = (): HTMLDivElement => {
  if (container?.isConnected) return container;
  container = document.createElement('div');
  container.id = 'turnstile-container';
  container.setAttribute('aria-hidden', 'true');
  container.style.position = 'fixed';
  container.style.bottom = '0';
  container.style.left = '0';
  container.style.width = '0';
  container.style.height = '0';
  container.style.overflow = 'hidden';
  document.body.appendChild(container);
  return container;
};

type Pending = { resolve: (token: string) => void; reject: (err: Error) => void };
let pending: Pending | null = null;

const settle = (fn: (p: Pending) => void) => {
  const p = pending;
  pending = null;
  if (p) fn(p);
};

/**
 * Un token proaspăt pentru submit-ul curent.
 *
 * Întoarce `''` dacă Turnstile e dezactivat (fără site key — dev local), ca
 * fluxul să meargă nemodificat pe mediile fără configurare. Aruncă
 * `TurnstileError` dacă e activat dar verificarea nu s-a putut face: preferăm un
 * mesaj clar către utilizator în locul unui submit care ar fi respins de server.
 */
export const getTurnstileToken = async (): Promise<string> => {
  if (!isTurnstileEnabled()) return '';

  const api = await loadApi();
  const el = ensureContainer();

  // Un submit în curs e abandonat: contează doar token-ul cel mai recent.
  settle((p) => p.reject(new TurnstileError('înlocuit de un submit nou')));

  if (widgetId === null) {
    widgetId = api.render(el, {
      sitekey: TURNSTILE_SITE_KEY,
      appearance: 'interaction-only',
      execution: 'execute',
      retry: 'never',
      callback: (token: string) => settle((p) => p.resolve(token)),
      'error-callback': () => {
        settle((p) => p.reject(new TurnstileError('challenge eșuat')));
        return true; // gestionăm noi eroarea; nu lăsăm widgetul să o afișeze
      },
      'timeout-callback': () => settle((p) => p.reject(new TurnstileError('challenge expirat'))),
      'expired-callback': () => settle((p) => p.reject(new TurnstileError('token expirat'))),
    });
  } else {
    api.reset(widgetId);
  }

  return new Promise<string>((resolve, reject) => {
    const timer = window.setTimeout(
      () => settle((p) => p.reject(new TurnstileError('fără răspuns'))),
      EXECUTE_TIMEOUT_MS
    );
    const done = () => window.clearTimeout(timer);
    pending = {
      resolve: (t) => {
        done();
        resolve(t);
      },
      reject: (e) => {
        done();
        reject(e);
      },
    };
    api.execute(widgetId as string);
  });
};

/** Doar pentru teste — repune modulul în starea inițială. */
export const __resetTurnstileForTests = (): void => {
  scriptPromise = null;
  widgetId = null;
  container?.remove();
  container = null;
  pending = null;
};
