import { describe, it, expect } from 'vitest';
import {
  validateLaunchDraft,
  LAUNCH_MESSAGES,
  EMPTY_LAUNCH_DRAFT,
} from '../../src/lib/launchForm';

const valid = { nume: 'Popescu', prenume: 'Andrei', email: 'a@b.ro', telefon: '069 123 456' };

describe('validateLaunchDraft', () => {
  it('nu raportează nimic pentru un draft valid (telefonul cu spații se normalizează)', () => {
    expect(validateLaunchDraft(valid)).toEqual({});
  });

  it('marchează numele și prenumele prea scurte', () => {
    expect(validateLaunchDraft({ ...valid, nume: 'P', prenume: 'A' })).toEqual({
      nume: true,
      prenume: true,
    });
  });

  it('marchează emailul invalid', () => {
    expect(validateLaunchDraft({ ...valid, email: 'nu-e-email' }).email).toBe(true);
  });

  it('marchează telefonul invalid', () => {
    expect(validateLaunchDraft({ ...valid, telefon: '123' }).telefon).toBe(true);
  });

  it('draftul gol e integral invalid', () => {
    expect(validateLaunchDraft(EMPTY_LAUNCH_DRAFT)).toEqual({
      nume: true,
      prenume: true,
      email: true,
      telefon: true,
    });
  });
});

describe('LAUNCH_MESSAGES', () => {
  it('conține cele 4 mesaje de feedback', () => {
    expect(Object.keys(LAUNCH_MESSAGES).sort()).toEqual([
      'generic',
      'offline',
      'timeout',
      'validation',
    ]);
  });
});
