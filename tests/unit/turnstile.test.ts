// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Clientul Turnstile. Cheia publică se citește la încărcarea modulului, deci
 * fiecare scenariu reimportă modulul după ce a fixat variabila de mediu.
 */

type Opts = Record<string, (token?: string) => void> & { sitekey?: string };

/** Un `window.turnstile` fals, ca `loadApi` să nu mai încerce să aducă api.js. */
const fakeApi = () => {
  const state: { opts: Opts | null; renders: number; resets: number; executes: number } = {
    opts: null,
    renders: 0,
    resets: 0,
    executes: 0,
  };
  const api = {
    render: (_el: HTMLElement, opts: Opts) => {
      state.opts = opts;
      state.renders++;
      return 'widget-1';
    },
    reset: () => {
      state.resets++;
    },
    execute: () => {
      state.executes++;
    },
  };
  return { api, state };
};

const importCu = async (siteKey: string) => {
  vi.stubEnv('VITE_TURNSTILE_SITE_KEY', siteKey);
  vi.resetModules();
  return await import('../../src/lib/turnstile');
};

beforeEach(() => {
  delete (window as { turnstile?: unknown }).turnstile;
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe('fără cheie publică (dev local)', () => {
  it('Turnstile e dezactivat, iar token-ul e string gol', async () => {
    // Ca fluxul să meargă nemodificat pe mediile fără Cloudflare configurat.
    // În PRODUCȚIE lipsa cheii oprește build-ul (scripts/check-deploy-config.ts).
    const mod = await importCu('');
    expect(mod.isTurnstileEnabled()).toBe(false);
    await expect(mod.getTurnstileToken()).resolves.toBe('');
  });

  it('nu injectează niciun script extern', async () => {
    const mod = await importCu('');
    await mod.getTurnstileToken();
    expect(document.querySelector('script[src*="challenges.cloudflare.com"]')).toBeNull();
  });
});

describe('cu cheie publică', () => {
  it('întoarce token-ul primit din callback', async () => {
    const { api, state } = fakeApi();
    (window as { turnstile?: unknown }).turnstile = api;
    const mod = await importCu('0x4AAA-test');

    const promisiune = mod.getTurnstileToken();
    await vi.waitFor(() => expect(state.executes).toBe(1));
    state.opts?.callback('tok-abc');

    await expect(promisiune).resolves.toBe('tok-abc');
    expect(state.opts?.sitekey).toBe('0x4AAA-test');
  });

  it('al doilea submit refolosește widgetul, dar cere un token nou', async () => {
    // Token-urile sunt de unică folosință: fără `reset()` + `execute()`, a doua
    // înscriere din aceeași sesiune ar trimite un token deja consumat.
    const { api, state } = fakeApi();
    (window as { turnstile?: unknown }).turnstile = api;
    const mod = await importCu('0x4AAA-test');

    const primul = mod.getTurnstileToken();
    await vi.waitFor(() => expect(state.executes).toBe(1));
    state.opts?.callback('tok-1');
    await primul;

    const alDoilea = mod.getTurnstileToken();
    await vi.waitFor(() => expect(state.executes).toBe(2));
    state.opts?.callback('tok-2');

    await expect(alDoilea).resolves.toBe('tok-2');
    expect(state.renders).toBe(1);
    expect(state.resets).toBe(1);
  });

  it('challenge-ul eșuat dă TurnstileError, nu un token gol', async () => {
    // Un token gol ar ajunge la server ca „missing_token" și omul ar vedea o
    // eroare de rețea derutantă în loc de mesajul despre verificare.
    const { api, state } = fakeApi();
    (window as { turnstile?: unknown }).turnstile = api;
    const mod = await importCu('0x4AAA-test');

    const promisiune = mod.getTurnstileToken();
    await vi.waitFor(() => expect(state.executes).toBe(1));
    state.opts?.['error-callback']();

    const err = await promisiune.catch((e) => e);
    expect(mod.isTurnstileError(err)).toBe(true);
  });

  it('token-ul expirat între randare și submit e tratat ca eroare', async () => {
    const { api, state } = fakeApi();
    (window as { turnstile?: unknown }).turnstile = api;
    const mod = await importCu('0x4AAA-test');

    const promisiune = mod.getTurnstileToken();
    await vi.waitFor(() => expect(state.executes).toBe(1));
    state.opts?.['expired-callback']();

    const err = await promisiune.catch((e) => e);
    expect(mod.isTurnstileError(err)).toBe(true);
  });

  it('containerul NU e display:none — Turnstile refuză să randeze ascuns', async () => {
    const { api } = fakeApi();
    (window as { turnstile?: unknown }).turnstile = api;
    const mod = await importCu('0x4AAA-test');
    void mod.getTurnstileToken().catch(() => {});

    const el = await vi.waitFor(() => {
      const found = document.getElementById('turnstile-container');
      expect(found).not.toBeNull();
      return found as HTMLElement;
    });
    expect(el.style.display).not.toBe('none');
    expect(el.getAttribute('aria-hidden')).toBe('true');
  });
});

describe('isTurnstileError', () => {
  it('nu confundă alte erori cu una de verificare', async () => {
    const mod = await importCu('0x4AAA-test');
    expect(mod.isTurnstileError(new Error('network'))).toBe(false);
    expect(mod.isTurnstileError(null)).toBe(false);
    expect(mod.isTurnstileError(new mod.TurnstileError('x'))).toBe(true);
  });
});
