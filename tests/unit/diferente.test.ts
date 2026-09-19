import { describe, it, expect } from 'vitest';
import {
  diferenteFataDePublicat,
  esteComparabil,
  type Diferenta,
} from '../../src/admin/eventTab/diferente';
import { SNAPSHOT_CONFIG, type EventConfig } from '../../src/content/eventConfig';

/**
 * Ce se schimbă pe site la publicare.
 *
 * Contractul păzit: lista conține EXACT câmpurile care diferă, scrise cum le
 * scrie formularul — nu chei de JSON, nu indici de listă.
 */

const ETICHETE = {
  format: 'Formatul',
  venue: 'Locația',
  registration: 'Înscriere',
  participants: 'Cine vine',
  reels: 'Instagram',
};

const publicat = SNAPSHOT_CONFIG;
const dif = (ciorna: EventConfig): Diferenta[] =>
  diferenteFataDePublicat(publicat, ciorna, ETICHETE);
const etichete = (lista: Diferenta[]): string[] => lista.map((d) => d.eticheta);

describe('diferenteFataDePublicat', () => {
  it('un document identic nu produce nicio diferență', () => {
    expect(dif({ ...publicat })).toEqual([]);
  });

  it('un singur câmp schimbat produce o singură diferență, cu ambele valori', () => {
    const lista = dif({ ...publicat, eventName: 'Altceva' });
    expect(lista).toHaveLength(1);
    expect(lista[0]).toEqual({
      eticheta: 'Numele evenimentului',
      inainte: publicat.eventName,
      acum: 'Altceva',
    });
  });

  it('momentele se scriu citibil, nu ca ISO', () => {
    const lista = dif({ ...publicat, start: '2026-12-05T08:30:00' });
    expect(lista).toHaveLength(1);
    expect(lista[0].acum).not.toContain('T08:30:00');
    // „sâmbătă, 5 dec · 08:30" — ziua săptămânii e chiar ce se verifică.
    expect(lista[0].acum).toMatch(/\d{2}:\d{2}/);
    expect(lista[0].acum.toLowerCase()).toContain('sâmbătă');
  });

  it('câmpurile adânci apar cu eticheta lor din formular', () => {
    expect(etichete(dif({ ...publicat, venue: { ...publicat.venue, city: 'Bălți' } }))).toEqual([
      'Orașul sau zona',
    ]);
    expect(
      etichete(dif({ ...publicat, slots: { ...publicat.slots, total: 42 } }))
    ).toEqual(['Locuri disponibile']);
  });

  it('reordonarea secțiunilor e o singură diferență, nu cinci', () => {
    const lista = dif({ ...publicat, layout: [...publicat.layout].reverse() });
    expect(etichete(lista)).toEqual(['Secțiunile paginii']);
  });

  it('o secțiune ascunsă se vede în paranteze', () => {
    const lista = dif({
      ...publicat,
      layout: publicat.layout.map((s) =>
        s.key === 'participants' ? { ...s, visible: false } : s
      ),
    });
    expect(lista).toHaveLength(1);
    expect(lista[0].acum).toContain('(Cine vine)');
    expect(lista[0].inainte).toContain('Cine vine');
    expect(lista[0].inainte).not.toContain('(Cine vine)');
  });

  it('un clip adăugat e o diferență pe „Clipurile din bandă"', () => {
    const lista = dif({
      ...publicat,
      reels: {
        ...publicat.reels,
        items: [{ code: 'ABC12345', kind: 'reel', poster: '', caption: '' }],
      },
    });
    expect(etichete(lista)).toEqual(['Clipurile din bandă']);
    expect(lista[0].acum).toContain('ABC12345');
  });

  it('reminderele se scriu în ordinea plecării, cu cele oprite în paranteze', () => {
    const lista = dif({
      ...publicat,
      reminders: [
        { offsetHours: 3, enabled: false, template: 'bulk_participant_reminder_final' },
        { offsetHours: 24, enabled: true, template: 'bulk_participant_reminder' },
      ],
    });
    expect(etichete(lista)).toEqual(['Remindere']);
    // 24h înaintea celui de 3h, iar cel oprit e marcat ca atare.
    expect(lista[0].acum.indexOf('24h')).toBeLessThan(lista[0].acum.indexOf('3h'));
    expect(lista[0].acum).toContain('(3h');
  });

  it('ecranul de pornire se numește cu vorbele din formular', () => {
    const lista = dif({ ...publicat, showComingSoon: !publicat.showComingSoon });
    expect(etichete(lista)).toEqual(['Homepage-ul arată']);
    expect([lista[0].inainte, lista[0].acum]).toContain('Coming Soon');
  });

  it('mai multe schimbări produc mai multe rânduri, în ordinea formularului', () => {
    const lista = dif({
      ...publicat,
      slots: { ...publicat.slots, total: 42 },
      eventName: 'Altceva',
    });
    expect(etichete(lista)).toEqual(['Numele evenimentului', 'Locuri disponibile']);
  });

  it('valoarea de rezervă a ocupării e vizibilă, deși n-avea câmp până acum', () => {
    const lista = dif({
      ...publicat,
      slots: { ...publicat.slots, occupiedFallback: publicat.slots.occupiedFallback + 3 },
    });
    expect(etichete(lista)).toEqual(['Ocupate (valoare de rezervă)']);
  });
});

describe('esteComparabil', () => {
  it('fără nimic publicat nu există cu ce compara', () => {
    expect(esteComparabil(null, publicat)).toBe(false);
    expect(diferenteFataDePublicat(null, publicat, ETICHETE)).toEqual([]);
  });

  it('o ciornă a ALTEI ediții nu e o modificare a celei publicate', () => {
    const urmatoarea = { ...publicat, number: publicat.number + 1 };
    expect(esteComparabil(publicat, urmatoarea)).toBe(false);
    // Fără gardă, fiecare câmp diferit ar apărea ca „schimbat" — o listă de
    // douăzeci de rânduri care nu ajută pe nimeni să verifice nimic.
    expect(dif(urmatoarea)).toEqual([]);
  });

  it('aceeași ediție se compară', () => {
    expect(esteComparabil(publicat, { ...publicat })).toBe(true);
  });
});
