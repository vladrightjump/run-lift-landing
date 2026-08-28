import { describe, it, expect } from 'vitest';
import { EDITION } from '../../src/content/edition';
import { SNAPSHOT_CONFIG } from '../../src/content/eventConfig';
import { deriveEditionDates, INSTAGRAM_URL, INSTAGRAM_HANDLE } from '../../src/lib/config';

/**
 * Gardă anti-drift — cu direcția INVERSATĂ față de cum arăta înainte.
 *
 * Până la mutarea configului în DB, testul ăsta verifica că `config.ts` derivă
 * corect din `EDITION`, pentru că `EDITION` era sursa de adevăr. Acum sursa e
 * rândul `published` din `event_config`, iar `EDITION` a rămas INSTANTANEUL de
 * build. Ce trebuie păzit s-a schimbat odată cu ea:
 *
 *  1. instantaneul transcrie fidel `EDITION` (altfel primul cadru randează altceva
 *     decât ediția deployată) — vezi și `eventConfig.test.ts`;
 *  2. regula de derivare a momentelor absolute e corectă pentru ORICE config,
 *     nu doar pentru cel din cod;
 *  3. ce a rămas deliberat în cod (social) nu a plecat din greșeală în document.
 */

const at = (local: string, tz: string): string => new Date(`${local}${tz}`).toISOString();

describe('instantaneul de build transcrie EDITION', () => {
  it('ediții', () => {
    expect(SNAPSHOT_CONFIG.number).toBe(EDITION.number);
    expect(SNAPSHOT_CONFIG.launchNumber).toBe(EDITION.launchNumber);
  });

  it('locuri', () => {
    expect(SNAPSHOT_CONFIG.slots.total).toBe(EDITION.slots.total);
    expect(SNAPSHOT_CONFIG.slots.waitlist).toBe(EDITION.slots.waitlist);
    expect(SNAPSHOT_CONFIG.slots.occupiedFallback).toBe(EDITION.slots.occupiedFallback);
  });

  it('starea paginii', () => {
    expect(SNAPSHOT_CONFIG.showComingSoon).toBe(EDITION.showComingSoon);
  });
});

describe('deriveEditionDates compune momentele cu fusul configului', () => {
  const d = deriveEditionDates(SNAPSHOT_CONFIG);

  it('date/ore compuse cu fusul ediției', () => {
    expect(d.EVENT_DATE.toISOString()).toBe(at(EDITION.start, EDITION.tz));
    expect(d.REGISTRATION_DEADLINE.toISOString()).toBe(
      at(EDITION.registrationDeadline, EDITION.tz)
    );
    expect(d.LAUNCH_DATE.toISOString()).toBe(at(EDITION.launchAt, EDITION.tz));
    expect(d.NEXT_EDITION_DATE.toISOString()).toBe(at(EDITION.nextEditionAt, EDITION.tz));
  });

  it('EVENT_END_DATE = start + durată', () => {
    expect(d.EVENT_END_DATE.getTime()).toBe(
      d.EVENT_DATE.getTime() + EDITION.durationHours * 60 * 60 * 1000
    );
  });

  it('LEADERBOARD_DATE = start − avansul configurat', () => {
    expect(d.LEADERBOARD_DATE.getTime()).toBe(
      d.EVENT_DATE.getTime() - EDITION.leaderboardLeadHours * 60 * 60 * 1000
    );
  });

  it('regula ține pentru orice config, nu doar pentru cel din cod', () => {
    const altul = deriveEditionDates({
      ...SNAPSHOT_CONFIG,
      tz: '+02:00',
      start: '2027-03-14T10:00:00',
      durationHours: 3,
      leaderboardLeadHours: 2,
    });
    expect(altul.EVENT_DATE.toISOString()).toBe(new Date('2027-03-14T10:00:00+02:00').toISOString());
    expect(altul.EVENT_END_DATE.toISOString()).toBe(
      new Date('2027-03-14T13:00:00+02:00').toISOString()
    );
    expect(altul.LEADERBOARD_DATE.toISOString()).toBe(
      new Date('2027-03-14T08:00:00+02:00').toISOString()
    );
  });
});

describe('ce rămâne în cod nu pleacă în document', () => {
  it('social vine tot din EDITION.urls', () => {
    expect(INSTAGRAM_URL).toBe(EDITION.urls.instagram);
    expect(INSTAGRAM_HANDLE).toBe(EDITION.urls.instagramHandle);
  });

  it('documentul nu cară antrenamentele, URL-urile sau brandul', () => {
    expect(SNAPSHOT_CONFIG).not.toHaveProperty('training');
    expect(SNAPSHOT_CONFIG).not.toHaveProperty('urls');
    expect(SNAPSHOT_CONFIG).not.toHaveProperty('brand');
  });
});
