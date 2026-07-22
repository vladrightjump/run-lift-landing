import { describe, it, expect } from 'vitest';
import {
  SHOW_COMING_SOON,
  LAUNCH_DATE,
  EVENT_DATE,
  CURRENT_EDITION,
  CURRENT_LAUNCH_EDITION,
  TOTAL_SLOTS,
  WAITLIST_SLOTS,
  INSTAGRAM_URL,
  INSTAGRAM_HANDLE,
  SUPABASE,
  isBackendConfigured,
} from '../../src/lib/config';

describe('date și ore', () => {
  it('toate datele sunt valide', () => {
    for (const d of [LAUNCH_DATE, EVENT_DATE]) {
      expect(Number.isNaN(d.getTime())).toBe(false);
    }
  });

  it('LAUNCH_DATE e fixată pe fusul Chișinăului, nu pe cel local', () => {
    // 22 iulie 2026, 18:00 la UTC+3 => 15:00 UTC. Testul pică dacă cineva
    // scrie data fără offset și se bazează pe fusul mașinii de build.
    expect(LAUNCH_DATE.toISOString()).toBe('2026-07-22T15:00:00.000Z');
  });

  it('lansarea (anunțul ediției 3) e înainte de eveniment', () => {
    // Anunțăm ediția a treia pe 22 iulie; evenimentul ei are loc pe 25 iulie.
    // La expirarea LAUNCH_DATE, Coming Soon lasă loc landing-ului ediției 3.
    expect(LAUNCH_DATE.getTime()).toBeLessThan(EVENT_DATE.getTime());
  });
});

describe('ediții', () => {
  it('sunt numere întregi pozitive', () => {
    for (const e of [CURRENT_EDITION, CURRENT_LAUNCH_EDITION]) {
      expect(Number.isInteger(e)).toBe(true);
      expect(e).toBeGreaterThan(0);
    }
  });

  it('ediția de lansare e cel puțin egală cu cea a evenimentului', () => {
    // Lista de notificări se strânge pentru ediția care urmează.
    expect(CURRENT_LAUNCH_EDITION).toBeGreaterThanOrEqual(CURRENT_EDITION);
  });
});

describe('locuri', () => {
  it('sunt pozitive', () => {
    expect(TOTAL_SLOTS).toBeGreaterThan(0);
    expect(WAITLIST_SLOTS).toBeGreaterThan(0);
  });
});

describe('Instagram', () => {
  it('handle-ul începe cu @', () => {
    expect(INSTAGRAM_HANDLE.startsWith('@')).toBe(true);
  });

  it('URL-ul e https și se potrivește cu handle-ul', () => {
    expect(INSTAGRAM_URL.startsWith('https://')).toBe(true);
    expect(INSTAGRAM_URL).toContain(INSTAGRAM_HANDLE.slice(1));
  });
});

describe('Supabase', () => {
  it('are URL https și cheie publicabilă', () => {
    expect(SUPABASE.url.startsWith('https://')).toBe(true);
    expect(SUPABASE.publishableKey.length).toBeGreaterThan(0);
    expect(isBackendConfigured()).toBe(true);
  });

  it('cheia e publicabilă, nu una secretă', () => {
    // O cheie service_role în bundle-ul client ar fi o breșă gravă.
    expect(SUPABASE.publishableKey).toMatch(/^sb_publishable_/);
    expect(SUPABASE.publishableKey).not.toMatch(/service_role|secret/i);
  });
});

describe('starea paginii', () => {
  it('SHOW_COMING_SOON e boolean', () => {
    expect(typeof SHOW_COMING_SOON).toBe('boolean');
  });
});
