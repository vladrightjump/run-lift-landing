import { HttpResponse } from 'msw';
import { server } from './vitest.setup';
import { rpcHandler } from './handlers';

/** Un token care trece de verificarea de format (UUID v4). */
export const TOKEN = '123e4567-e89b-42d3-a456-426614174000';

/** Deschide pagina ca din linkul de email: `?token=` în adresă. */
export const linkCuToken = (cale: string, token: string | null = TOKEN) =>
  window.history.replaceState(null, '', token === null ? cale : `${cale}?token=${encodeURIComponent(token)}`);

/**
 * Răspunsul RPC-ului unei pagini din link și câte cereri a primit. `body` e
 * trimis ca JSON; `brut` trimite textul așa cum e (un răspuns stricat).
 */
export const raspunde = (rpc: string, raspuns: { body?: unknown; status?: number; brut?: string; retea?: boolean; asteapta?: Promise<void> }) => {
  const cereri = { numar: 0, corpuri: [] as unknown[], semnale: [] as AbortSignal[] };
  server.use(
    rpcHandler(rpc, async ({ request }) => {
      cereri.numar += 1;
      cereri.semnale.push(request.signal);
      cereri.corpuri.push(await request.json().catch(() => null));
      if (raspuns.asteapta) await raspuns.asteapta;
      if (raspuns.retea) return HttpResponse.error();
      return new HttpResponse(raspuns.brut ?? JSON.stringify(raspuns.body ?? null), {
        status: raspuns.status ?? 200,
        headers: { 'Content-Type': 'application/json' },
      });
    })
  );
  return cereri;
};
