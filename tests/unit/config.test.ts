import { describe, it, expect } from 'vitest';
import {
  SHOW_COMING_SOON,
  LAUNCH_DATE,
  EVENT_DATE,
  EVENT_END_DATE,
  LEADERBOARD_DATE,
  NEXT_EDITION_DATE,
  CURRENT_EDITION,
  CURRENT_LAUNCH_EDITION,
  TOTAL_SLOTS,
  WAITLIST_SLOTS,
  INSTAGRAM_URL,
  INSTAGRAM_HANDLE,
  SUPABASE,
  isBackendConfigured,
} from '../../src/lib/config';
import { EDITION } from '../../src/content/edition';

describe('date și ore', () => {
  it('toate datele sunt valide', () => {
    for (const d of [LAUNCH_DATE, EVENT_DATE]) {
      expect(Number.isNaN(d.getTime())).toBe(false);
    }
  });

  it('LAUNCH_DATE e fixată pe fusul Chișinăului, nu pe cel local', () => {
    // Compusă din EDITION.launchAt + EDITION.tz — testul pică dacă cineva scrie
    // data fără offset și se bazează pe fusul mașinii de build. Drift-proof: derivă
    // din EDITION, nu dintr-o dată hardcodată.
    expect(LAUNCH_DATE.toISOString()).toBe(
      new Date(`${EDITION.launchAt}${EDITION.tz}`).toISOString()
    );
  });

  // Faza B (înscrieri deschise, showComingSoon=false): evenimentul e după anunțul
  // de lansare. În Faza A (Coming Soon) numărăm spre anunț (launchAt), iar data
  // cursei (EDITION.start) poate fi încă TBD → invariantul nu se aplică, sărim testul.
  it.skipIf(SHOW_COMING_SOON)('Faza B: evenimentul e după anunțul de lansare', () => {
    expect(EVENT_DATE.getTime()).toBeGreaterThan(LAUNCH_DATE.getTime());
  });
});

describe('fazele zilei de eveniment', () => {
  it('LEADERBOARD_DATE = startul minus avansul configurat', () => {
    expect(LEADERBOARD_DATE.getTime()).toBe(
      EVENT_DATE.getTime() - EDITION.leaderboardLeadHours * 60 * 60 * 1000
    );
  });

  it('NEXT_EDITION_DATE e fixată pe fusul Chișinăului, nu pe cel local', () => {
    // Aceeași garanție ca la LAUNCH_DATE: countdown-ul spre următorul antrenament
    // trebuie să arate același moment absolut din orice fus.
    expect(NEXT_EDITION_DATE.toISOString()).toBe(
      new Date(`${EDITION.nextEditionAt}${EDITION.tz}`).toISOString()
    );
  });

  // Garda care prinde ediția următoare configurată pe jumătate: cineva mută
  // `start` și uită `nextEditionAt`, iar countdown-ul de după cursă ar porni
  // deja expirat. Ordinea celor patru momente e invariantul care nu se negociază.
  it('cele patru momente sunt strict ordonate', () => {
    const momente = [LEADERBOARD_DATE, EVENT_DATE, EVENT_END_DATE, NEXT_EDITION_DATE];
    for (let i = 1; i < momente.length; i++) {
      expect(momente[i].getTime()).toBeGreaterThan(momente[i - 1].getTime());
    }
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
