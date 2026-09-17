import { vi } from 'vitest';

/**
 * Încarcă o funcție Edge REALĂ (fișierul care se deployează) într-un vitest.
 *
 * Funcțiile rulează pe Deno și se deployează separat, deci n-au fost niciodată
 * acoperite de suită: singura verificare era o probă manuală după deploy. Aici
 * nu se rescrie nimic din ele — se înlocuiește doar lumea din jur: `Deno.env`,
 * `Deno.serve` și `fetch`. Ce se testează e exact codul care pleacă în producție.
 *
 * `Deno.serve` primește handlerul la import, deci mediul trebuie pus ÎNAINTE.
 * De aceea modulul se încarcă printr-un `import()` întârziat, după `resetModules`
 * — altfel constantele citite din env la import ar rămâne cele ale primului test.
 */

export type CerereInterceptata = { url: string; init: RequestInit; body: unknown };

/** Răspunde în locul rețelei. `null` = cerere neprevăzută (testul o va semnala). */
export type Ruta = (cerere: CerereInterceptata) => Response | null;

export type FunctieEdge = {
  /** Handlerul dat lui `Deno.serve`. */
  cheama: (req: Request) => Promise<Response>;
  /** Cererile de rețea încercate, în ordine. */
  cereri: CerereInterceptata[];
  /** Cererile spre o anumită cale (potrivire pe subșir din URL). */
  catre: (fragment: string) => CerereInterceptata[];
  erori: unknown[][];
};

const corpul = (init: RequestInit): unknown => {
  const b = init.body;
  if (typeof b !== 'string') return b;
  try {
    return JSON.parse(b);
  } catch {
    return b;
  }
};

export const incarcaFunctieEdge = async (
  importa: () => Promise<unknown>,
  optiuni: { env?: Record<string, string>; rute?: Ruta[] } = {}
): Promise<FunctieEdge> => {
  const env = optiuni.env ?? {};
  const cereri: CerereInterceptata[] = [];
  const erori: unknown[][] = [];
  let handler: ((req: Request) => Promise<Response>) | null = null;

  const deno = {
    env: { get: (cheie: string) => env[cheie] },
    serve: (h: (req: Request) => Promise<Response>) => {
      handler = h;
    },
  };
  vi.stubGlobal('Deno', deno);

  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = typeof input === 'string' ? input : input.toString();
    const cerere = { url, init, body: corpul(init) };
    cereri.push(cerere);
    for (const ruta of optiuni.rute ?? []) {
      const r = ruta(cerere);
      if (r) return r;
    }
    // O cerere neprevăzută e un eșec de test, nu o rețea căzută: altfel un apel
    // nou, neintenționat, ar trece drept „fail-open".
    throw new Error(`cerere neprevăzută spre ${url}`);
  });

  // `console.error`/`warn` sunt calea de raportare a funcțiilor; le strângem ca
  // testele să poată verifica ce s-a semnalat, fără zgomot în ieșirea suitei.
  vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => void erori.push(a));
  vi.spyOn(console, 'warn').mockImplementation((...a: unknown[]) => void erori.push(a));

  vi.resetModules();
  await importa();
  if (!handler) throw new Error('funcția nu a chemat Deno.serve');

  return {
    cheama: handler,
    cereri,
    catre: (fragment) => cereri.filter((c) => c.url.includes(fragment)),
    erori,
  };
};

/** Un răspuns JSON, pentru rute. */
export const raspunde = (status: number, body: unknown = {}): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** Cerere POST cu JSON, ca cea venită din browser. */
export const post = (body: unknown, headers: Record<string, string> = {}): Request =>
  new Request('https://proiect.supabase.co/functions/v1/f', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
