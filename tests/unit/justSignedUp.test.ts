// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { markJustSignedUp, consumeJustSignedUp } from '../../src/lib/justSignedUp';

/**
 * Flagul „s-a înscris chiar acum" trece de pe /inscriere pe landing prin
 * sessionStorage. Regula care contează: se consumă O SINGURĂ dată, altfel
 * bannerul verde ar reapărea la fiecare reload. E pur cosmetic, deci nimic
 * de aici nu are voie să arunce.
 */

const PAYLOAD = { prenume: 'Vlad', loc: 13, waitlist: false };

beforeEach(() => {
  sessionStorage.clear();
});

describe('markJustSignedUp / consumeJustSignedUp', () => {
  it('întoarce ce s-a scris, o singură dată', () => {
    markJustSignedUp(PAYLOAD);
    expect(consumeJustSignedUp()).toEqual(PAYLOAD);
    expect(consumeJustSignedUp()).toBeNull();
  });

  it('fără flag scris, întoarce null', () => {
    expect(consumeJustSignedUp()).toBeNull();
  });

  it('păstrează varianta de listă de așteptare', () => {
    markJustSignedUp({ prenume: 'Ana', loc: null, waitlist: true });
    expect(consumeJustSignedUp()).toEqual({ prenume: 'Ana', loc: null, waitlist: true });
  });

  it('JSON stricat nu aruncă — întoarce null', () => {
    sessionStorage.setItem('runlift_abia_inscris', '{nu e json');
    expect(consumeJustSignedUp()).toBeNull();
  });

  it('câmpuri lipsă capătă valori sigure', () => {
    sessionStorage.setItem('runlift_abia_inscris', '{}');
    expect(consumeJustSignedUp()).toEqual({ prenume: 'atlet', loc: null, waitlist: false });
  });

  // Private mode: storage-ul aruncă la scriere. Redirectul trebuie să meargă
  // mai departe, doar bannerul lipsește.
  it('storage indisponibil nu aruncă la scriere', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    expect(() => markJustSignedUp(PAYLOAD)).not.toThrow();
  });
});
