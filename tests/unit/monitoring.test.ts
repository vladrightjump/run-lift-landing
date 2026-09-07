// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { logClientError, installGlobalMonitoring } from '../../src/lib/monitoring';
import { SubmitHttpError, isNetworkOrCspError } from '../../src/lib/supabase';

/**
 * Monitoringul ușor: garantează că eșecurile lasă o urmă structurată în consolă
 * și, mai ales, că un blocaj CSP (regresia din 4 august) e prins și explicit.
 */

describe('logClientError', () => {
  let spy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    spy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => spy.mockRestore());

  it('logează cu tag-ul de context și mesajul erorii', () => {
    logClientError('registration', new Error('boom'), { endpoint: '/x' });
    expect(spy).toHaveBeenCalledTimes(1);
    const [tag, payload] = spy.mock.calls[0];
    expect(tag).toBe('[runlift:registration]');
    expect(payload).toMatchObject({ name: 'Error', message: 'boom', endpoint: '/x' });
  });

  it('extrage status-ul numeric din SubmitHttpError', () => {
    logClientError('registration', new SubmitHttpError(409, 'dup'));
    expect(spy.mock.calls[0][1]).toMatchObject({ status: 409 });
  });

  it('tratează și valori care nu sunt Error', () => {
    logClientError('x', 'plain string');
    expect(spy.mock.calls[0][1]).toMatchObject({ name: 'NonError', message: 'plain string' });
  });
});

describe('isNetworkOrCspError', () => {
  it('true pentru TypeError „Failed to fetch" (Chrome — rețea sau blocaj CSP)', () => {
    expect(isNetworkOrCspError(new TypeError('Failed to fetch'))).toBe(true);
  });
  it('true pentru TypeError „Load failed" (Safari/iOS — nu conține „fetch")', () => {
    expect(isNetworkOrCspError(new TypeError('Load failed'))).toBe(true);
  });
  it('true pentru TypeError „NetworkError…" (Firefox)', () => {
    expect(
      isNetworkOrCspError(new TypeError('NetworkError when attempting to fetch resource.'))
    ).toBe(true);
  });
  it('false pentru un răspuns HTTP de eroare (SubmitHttpError)', () => {
    expect(isNetworkOrCspError(new SubmitHttpError(500, 'x'))).toBe(false);
  });
  it('false pentru o eroare oarecare', () => {
    expect(isNetworkOrCspError(new Error('altceva'))).toBe(false);
  });
});

describe('installGlobalMonitoring', () => {
  it('prinde violările CSP și le logează explicit', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    installGlobalMonitoring();

    const e = new Event('securitypolicyviolation');
    Object.assign(e, {
      blockedURI: 'https://whyndrjcezmtajbykeil.supabase.co/rest/v1/registrations',
      violatedDirective: 'connect-src',
      effectiveDirective: 'connect-src',
    });
    document.dispatchEvent(e);

    const cspCall = spy.mock.calls.find((c) => c[0] === '[runlift:csp-violation]');
    expect(cspCall).toBeTruthy();
    expect(cspCall?.[1]).toMatchObject({
      blockedURI: 'https://whyndrjcezmtajbykeil.supabase.co/rest/v1/registrations',
      effectiveDirective: 'connect-src',
    });
    spy.mockRestore();
  });

  it('e idempotent (nu atașează listenerele de două ori)', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    installGlobalMonitoring();
    installGlobalMonitoring(); // al doilea apel e no-op

    const e = new Event('securitypolicyviolation');
    Object.assign(e, { blockedURI: 'x', violatedDirective: 'img-src', effectiveDirective: 'img-src' });
    document.dispatchEvent(e);

    const cspCalls = spy.mock.calls.filter((c) => c[0] === '[runlift:csp-violation]');
    expect(cspCalls).toHaveLength(1);
    spy.mockRestore();
  });
});

/**
 * Pragul de escaladare, văzut dinspre client.
 *
 * `IDEI.md` pornea de la faptul că `monitoring.ts` prinde erorile de client —
 * corect ca observație, greșit ca punct de plecare. Anomaliile care merită un
 * email sunt evenimente de SERVER; un client care poate cere trimiterea unui
 * email e un releu de spam deschis către oricine deschide pagina. În plus,
 * erorile de client vin și de la extensii de browser și de la roboți: fără
 * filtrare l-ai antrena pe operator să ignore exact canalul construit.
 *
 * Testul păzește granița în singura direcție care contează: nimic din monitoring
 * nu părăsește clientul.
 */
describe('pragul de escaladare — clientul nu trimite nimic nicăieri', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('o eroare de JS de client nu produce nicio cerere de rețea', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    logClientError('window-error', new Error('ceva a picat'));
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('o violare de CSP nu produce nicio cerere de rețea', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    logClientError('csp-violation', new Error('blocat'), { blockedURI: 'https://x.example' });
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('semnalul rămâne în consolă — acolo e, și acolo rămâne', () => {
    logClientError('window-error', new Error('ceva a picat'));
    expect(console.error).toHaveBeenCalled();
  });
});
