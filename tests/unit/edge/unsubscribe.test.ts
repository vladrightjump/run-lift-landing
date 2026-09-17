// @vitest-environment node
import { describe, it, expect, afterEach, vi } from 'vitest';
import { incarcaFunctieEdge, raspunde, type Ruta } from './harness';

/**
 * `unsubscribe` — dezabonarea one-click (RFC 8058) promisă prin headerul
 * `List-Unsubscribe`. Gmail și Yahoo o cer de la expeditorii în masă, iar de
 * corectitudinea ei atârnă și partea legală: „nu-mi mai scrieți" trebuie să
 * ajungă în baza de date, nu doar să pară că a ajuns.
 */

const ENV = {
  SUPABASE_URL: 'https://proiect.supabase.co',
  RUNLIFT_SERVICE_KEY: 'sb_secret_test',
  DB_SCHEMA: 'runlift',
};

const RPC = '/rest/v1/rpc/unsubscribe';
const OK: Ruta[] = [(c) => (c.url.includes(RPC) ? raspunde(200, 'dezabonat') : null)];

const incarca = (rute: Ruta[] = OK) =>
  incarcaFunctieEdge(() => import('../../../supabase/functions/unsubscribe/index.ts'), {
    env: ENV,
    rute,
  });

const cerere = (metoda: string, token?: string) =>
  new Request(
    `https://proiect.supabase.co/functions/v1/unsubscribe${token ? `?token=${token}` : ''}`,
    { method: metoda }
  );

const TOKEN = '11111111-2222-3333-4444-555555555555';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('POST — one-click, cum îl face Gmail', () => {
  it('dezabonează tokenul și răspunde 200', async () => {
    const f = await incarca();
    const res = await f.cheama(cerere('POST', TOKEN));
    expect(res.status).toBe(200);
    expect(f.catre(RPC)).toHaveLength(1);
    expect(f.catre(RPC)[0].body).toEqual({ p_token: TOKEN });
  });

  it('cheamă RPC-ul în schema runlift', async () => {
    const f = await incarca();
    await f.cheama(cerere('POST', TOKEN));
    const headers = f.catre(RPC)[0].init.headers as Record<string, string>;
    expect(headers['Content-Profile']).toBe('runlift');
  });

  it('fără token nu cheamă nimic, dar nu se plânge providerului', async () => {
    const f = await incarca();
    const res = await f.cheama(cerere('POST'));
    expect(res.status).toBe(200);
    expect(f.catre(RPC)).toHaveLength(0);
  });

  it('un RPC căzut nu transformă dezabonarea într-o eroare pentru provider', async () => {
    const f = await incarca([
      (c) => {
        if (!c.url.includes(RPC)) return null;
        throw new Error('DB down');
      },
    ]);
    expect((await f.cheama(cerere('POST', TOKEN))).status).toBe(200);
  });
});

describe('GET — navigare umană', () => {
  /**
   * Regula care contează: un scanner de linkuri (antivirusul din Outlook,
   * previzualizarea din WhatsApp) deschide URL-uri fără ca omul să ceară ceva.
   * Dacă GET-ul ar dezabona, l-ar dezabona pe el, tăcut.
   */
  it('NU dezabonează — doar duce la pagina brandată', async () => {
    const f = await incarca();
    const res = await f.cheama(cerere('GET', TOKEN));
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe(
      `https://parktraining.fit/unsubscribe?token=${TOKEN}`
    );
    expect(f.catre(RPC)).toHaveLength(0);
  });

  it('fără token duce tot la pagină, fără parametru gol', async () => {
    const f = await incarca();
    const res = await f.cheama(cerere('GET'));
    expect(res.headers.get('Location')).toBe('https://parktraining.fit/unsubscribe');
  });

  it('un token cu caractere ciudate e encodat, nu concatenat', async () => {
    const f = await incarca();
    const res = await f.cheama(cerere('GET', 'a%20b%26c=d'));
    const location = res.headers.get('Location')!;
    expect(new URL(location).searchParams.get('token')).toBe('a b&c=d');
    expect(location.startsWith('https://parktraining.fit/unsubscribe?token=')).toBe(true);
  });
});

describe('restul metodelor', () => {
  it('OPTIONS primește CORS', async () => {
    const f = await incarca();
    const res = await f.cheama(cerere('OPTIONS'));
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });

  it.each(['PUT', 'DELETE'])('%s → 405, fără efect', async (metoda) => {
    const f = await incarca();
    const res = await f.cheama(cerere(metoda, TOKEN));
    expect(res.status).toBe(405);
    expect(f.catre(RPC)).toHaveLength(0);
  });
});
