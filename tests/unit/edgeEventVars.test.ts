import { describe, it, expect } from 'vitest';
import { eventVars } from '../../src/content/format';
import { eventVarsDinConfig } from '../../supabase/functions/send-email/eventVars';
import { SNAPSHOT_CONFIG, parseEventConfig } from '../../src/content/eventConfig';
import type { EventConfig } from '../../src/content/eventConfig';

/**
 * Contractul dintre cele două derivări ale variabilelor de eveniment.
 *
 * Site-ul și trimiterile din admin folosesc `src/content/format.ts`. Confirmarea
 * automată pleacă din funcția Edge, care rulează pe Deno, n-are niciun import
 * relativ în afara directorului ei și se deployează separat — deci își ține
 * propria derivare.
 *
 * Două derivări înseamnă că pot deriva. Testul ăsta e singurul lucru care le
 * ține lipite: dacă cineva schimbă formatul într-un loc — luna, ziua săptămânii,
 * ordinea „nume, oraș" — și nu în celălalt, emailul de confirmare ar anunța altă
 * oră decât pagina, pentru aceeași cursă.
 */

const cu = (over: Partial<EventConfig>): EventConfig => ({ ...SNAPSHOT_CONFIG, ...over });

/** Date alese ca să prindă exact locurile unde formatările pot diverge. */
const CAZURI: [string, EventConfig][] = [
  ['instantaneul curent', SNAPSHOT_CONFIG],
  ['iarna, cu zi de o cifră', cu({ start: '2027-01-03T09:00:00', checkinFrom: '08:30' })],
  ['duminică (index 0 în tabelul zilelor)', cu({ start: '2026-08-30T07:00:00' })],
  ['decembrie (ultima lună)', cu({ start: '2026-12-31T18:45:00' })],
  ['martie, zi cu două cifre', cu({ start: '2026-03-14T06:00:00' })],
  [
    'alt loc și altă ediție',
    cu({
      number: 12,
      eventName: 'Winter Trial',
      venue: { ...SNAPSHOT_CONFIG.venue, name: 'Parcul Râșcani', city: 'Chișinău' },
    }),
  ],
];

describe('funcția Edge derivă exact aceleași variabile ca site-ul', () => {
  for (const [nume, config] of CAZURI) {
    it(nume, () => {
      // `parseEventConfig` e poarta prin care trece configul venit din DB, deci
      // partea de Edge primește exact forma pe care i-ar da-o `public_config()`.
      const caEDinDb = parseEventConfig(JSON.parse(JSON.stringify(config)));
      expect(caEDinDb).not.toBeNull();
      expect(eventVarsDinConfig(caEDinDb)).toEqual(eventVars(config));
    });
  }

  it('acoperă aceleași chei, nici una în plus, nici una în minus', () => {
    // O variabilă adăugată doar într-o parte ar fi tăcută: în emailurile din
    // admin s-ar înlocui, în confirmarea automată ar rămâne literală.
    expect(Object.keys(eventVarsDinConfig(SNAPSHOT_CONFIG)).sort()).toEqual(
      Object.keys(eventVars(SNAPSHOT_CONFIG)).sort()
    );
  });
});
