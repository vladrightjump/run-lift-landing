import { describe, it, expect } from 'vitest';
import { EDITION } from '../../src/content/edition';
import {
  CURRENT_EDITION,
  CURRENT_LAUNCH_EDITION,
  TOTAL_SLOTS,
  WAITLIST_SLOTS,
  OCCUPIED_SLOTS,
  EVENT_DATE,
  EVENT_END_DATE,
  REGISTRATION_DEADLINE,
  LAUNCH_DATE,
  SHOW_COMING_SOON,
  INSTAGRAM_URL,
  INSTAGRAM_HANDLE,
} from '../../src/lib/config';

/**
 * Gardă anti-drift: `config.ts` trebuie să DERIVE corect din `EDITION` (SSOT).
 * Dacă cineva strică derivarea (sau scrie iar valori de mână în config), testul pică.
 * La ediție nouă se editează DOAR `content/edition.ts` — testele astea trec automat.
 */

const at = (local: string): string => new Date(`${local}${EDITION.tz}`).toISOString();

describe('config.ts derivă din EDITION', () => {
  it('ediții', () => {
    expect(CURRENT_EDITION).toBe(EDITION.number);
    expect(CURRENT_LAUNCH_EDITION).toBe(EDITION.launchNumber);
  });

  it('locuri', () => {
    expect(TOTAL_SLOTS).toBe(EDITION.slots.total);
    expect(WAITLIST_SLOTS).toBe(EDITION.slots.waitlist);
    expect(OCCUPIED_SLOTS).toBe(EDITION.slots.occupiedFallback);
  });

  it('date/ore compuse cu fusul ediției', () => {
    expect(EVENT_DATE.toISOString()).toBe(at(EDITION.start));
    expect(REGISTRATION_DEADLINE.toISOString()).toBe(at(EDITION.registrationDeadline));
    expect(LAUNCH_DATE.toISOString()).toBe(at(EDITION.launchAt));
  });

  it('EVENT_END_DATE = start + durată', () => {
    expect(EVENT_END_DATE.getTime()).toBe(
      EVENT_DATE.getTime() + EDITION.durationHours * 60 * 60 * 1000
    );
  });

  it('flags + social', () => {
    expect(SHOW_COMING_SOON).toBe(EDITION.showComingSoon);
    expect(INSTAGRAM_URL).toBe(EDITION.urls.instagram);
    expect(INSTAGRAM_HANDLE).toBe(EDITION.urls.instagramHandle);
  });
});
