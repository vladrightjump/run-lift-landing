import { describe, it, expect } from 'vitest';
import { esteNesalvat } from '../../src/admin/eventTab/nesalvat';
import { SNAPSHOT_CONFIG } from '../../src/content/eventConfig';

/**
 * Diferențele nesalvate — singura stare din care pleacă toate gărzile tabului
 * „Eveniment" (confirmarea la „Renunță", la schimbarea tabului, avertismentul
 * browserului).
 */

const doc = SNAPSHOT_CONFIG;

describe('esteNesalvat', () => {
  it('fără ciornă deschisă nu există nimic de pierdut', () => {
    expect(esteNesalvat(null, null)).toBe(false);
    expect(esteNesalvat(doc, null)).toBe(false);
  });

  it('o ciornă care n-a ajuns niciodată pe server e nesalvată', () => {
    // Ciorna din dialogul de ediție nouă, sau cea pornită din ediția publicată:
    // există doar în browser.
    expect(esteNesalvat(null, doc)).toBe(true);
  });

  it('documentul identic cu cel salvat nu e o diferență', () => {
    expect(esteNesalvat(doc, { ...doc })).toBe(false);
  });

  it('ordinea cheilor nu e o diferență', () => {
    // `{...publicat, number}` pune `number` la sfârșit; documentul din DB îl are
    // la început. Același document.
    const rearanjat = Object.fromEntries(Object.entries(doc).reverse()) as typeof doc;
    expect(esteNesalvat(doc, rearanjat)).toBe(false);
  });

  it('un câmp schimbat e o diferență', () => {
    expect(esteNesalvat(doc, { ...doc, eventName: 'Altceva' })).toBe(true);
  });

  it('o schimbare adâncă e o diferență', () => {
    expect(
      esteNesalvat(doc, { ...doc, venue: { ...doc.venue, city: 'Bălți' } })
    ).toBe(true);
    expect(esteNesalvat(doc, { ...doc, slots: { ...doc.slots, total: 99 } })).toBe(true);
  });

  it('revenirea manuală la valoarea inițială stinge diferența', () => {
    const editat = { ...doc, eventName: 'Altceva' };
    const revenit = { ...editat, eventName: doc.eventName };
    expect(esteNesalvat(doc, revenit)).toBe(false);
  });

  it('ordinea secțiunilor E informație: reordonarea e o diferență', () => {
    const invers = { ...doc, layout: [...doc.layout].reverse() };
    expect(esteNesalvat(doc, invers)).toBe(true);
  });


  it('un câmp opțional absent și același câmp `undefined` sînt același document', () => {
    // `JSON.stringify` scoate `undefined` la scriere, deci serverul primește
    // același document în ambele cazuri.
    const fara = { ...doc };
    delete (fara as { ordinalOverride?: string | null }).ordinalOverride;
    expect(esteNesalvat(fara, { ...fara, ordinalOverride: undefined })).toBe(false);
  });

  it('dar `null` explicit e o valoare, nu o absență', () => {
    const fara = { ...doc };
    delete (fara as { ordinalOverride?: string | null }).ordinalOverride;
    expect(esteNesalvat(fara, { ...fara, ordinalOverride: null })).toBe(true);
  });
});
