// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Flagul „s-a înscris chiar acum" trece de pe /inscriere pe landing prin
 * sessionStorage. Două reguli contează:
 *  · în aceeași încărcare de pagină, citirea e idempotentă — `<StrictMode>`
 *    montează componenta de două ori în dev, iar a doua montare nu are voie să
 *    primească `null`;
 *  · la o încărcare NOUĂ de pagină, flagul e deja șters, deci bannerul nu revine.
 *
 * `vi.resetModules()` + import dinamic simulează exact „o încărcare nouă de
 * pagină": modulul primește un cache curat, ca la un reload real.
 */

const KEY = 'runlift_abia_inscris';
const PAYLOAD = { prenume: 'Vlad', loc: 13, waitlist: false };

/** O „încărcare de pagină": modul proaspăt, cu cache-ul golit. */
const incarcaPagina = async () => {
  vi.resetModules();
  return import('../../src/lib/justSignedUp');
};

beforeEach(() => {
  sessionStorage.clear();
});

describe('markJustSignedUp / consumeJustSignedUp', () => {
  it('întoarce ce s-a scris', async () => {
    const { markJustSignedUp, consumeJustSignedUp } = await incarcaPagina();
    markJustSignedUp(PAYLOAD);
    expect(consumeJustSignedUp()).toEqual(PAYLOAD);
  });

  // Regresia din StrictMode: a doua montare trebuie să vadă aceeași valoare.
  it('în aceeași încărcare, a doua citire dă același rezultat', async () => {
    const { markJustSignedUp, consumeJustSignedUp } = await incarcaPagina();
    markJustSignedUp(PAYLOAD);
    expect(consumeJustSignedUp()).toEqual(PAYLOAD);
    expect(consumeJustSignedUp()).toEqual(PAYLOAD);
  });

  it('flagul e șters din storage la prima citire', async () => {
    const { markJustSignedUp, consumeJustSignedUp } = await incarcaPagina();
    markJustSignedUp(PAYLOAD);
    consumeJustSignedUp();
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });

  // Reload: modul nou + storage gol => bannerul nu mai apare.
  it('la o încărcare nouă de pagină nu mai întoarce nimic', async () => {
    const prima = await incarcaPagina();
    prima.markJustSignedUp(PAYLOAD);
    expect(prima.consumeJustSignedUp()).toEqual(PAYLOAD);

    const dupaReload = await incarcaPagina();
    expect(dupaReload.consumeJustSignedUp()).toBeNull();
  });

  it('fără flag scris, întoarce null', async () => {
    const { consumeJustSignedUp } = await incarcaPagina();
    expect(consumeJustSignedUp()).toBeNull();
  });

  it('păstrează varianta de listă de așteptare', async () => {
    const { markJustSignedUp, consumeJustSignedUp } = await incarcaPagina();
    markJustSignedUp({ prenume: 'Ana', loc: null, waitlist: true });
    expect(consumeJustSignedUp()).toEqual({ prenume: 'Ana', loc: null, waitlist: true });
  });

  it('JSON stricat nu aruncă — întoarce null', async () => {
    const { consumeJustSignedUp } = await incarcaPagina();
    sessionStorage.setItem(KEY, '{nu e json');
    expect(consumeJustSignedUp()).toBeNull();
  });

  it('câmpuri lipsă capătă valori sigure', async () => {
    const { consumeJustSignedUp } = await incarcaPagina();
    sessionStorage.setItem(KEY, '{}');
    expect(consumeJustSignedUp()).toEqual({ prenume: 'atlet', loc: null, waitlist: false });
  });

  // Private mode: storage-ul aruncă la scriere. Redirectul trebuie să meargă
  // mai departe, doar bannerul lipsește.
  it('storage indisponibil nu aruncă la scriere', async () => {
    const { markJustSignedUp } = await incarcaPagina();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    expect(() => markJustSignedUp(PAYLOAD)).not.toThrow();
  });
});
