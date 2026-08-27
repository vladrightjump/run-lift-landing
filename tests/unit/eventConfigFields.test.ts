import { describe, it, expect } from 'vitest';
import {
  laDatetimeLocal,
  dinDatetimeLocal,
  descrieMoment,
  distantaFataDeAcum,
  problemePeCamp,
  linkHarta,
} from '../../src/admin/eventConfigFields';

/**
 * Traducerile dintre documentul de config și controalele native de dată.
 *
 * De ce contează: documentul ține „2026-08-22T07:00:00", iar un
 * `<input type="datetime-local">` vorbește „2026-08-22T07:00". O traducere
 * greșită nu dă eroare — scrie tăcut o dată puțin diferită în config, iar
 * organizatorul află abia când vede pagina publică.
 */

describe('config → control nativ', () => {
  it('taie secundele, pe care controlul le-ar arăta ca al treilea câmp editabil', () => {
    expect(laDatetimeLocal('2026-08-22T07:00:00')).toBe('2026-08-22T07:00');
  });

  it('un document nerecunoscut lasă câmpul gol, nu inventează o dată', () => {
    // Editat manual în DB, sau salvat de o versiune veche. Câmpul gol + eroarea
    // de validare spun adevărul; o dată plauzibilă ar ascunde problema.
    expect(laDatetimeLocal('22.08.2026')).toBe('');
    expect(laDatetimeLocal('')).toBe('');
  });
});

describe('control nativ → config', () => {
  it('adaugă secundele pe care documentul le cere', () => {
    expect(dinDatetimeLocal('2026-08-22T07:00')).toBe('2026-08-22T07:00:00');
  });

  it('golirea câmpului nu produce o dată plauzibilă', () => {
    // Trebuie să treacă mai departe ca invalid, ca validarea să-l semnaleze.
    expect(dinDatetimeLocal('')).toBe('');
  });

  it('dus-întors nu schimbă valoarea', () => {
    const original = '2026-12-05T18:30:00';
    expect(dinDatetimeLocal(laDatetimeLocal(original))).toBe(original);
  });
});

describe('ecoul în limbaj natural', () => {
  // 1 august 2026, ora 12:00 în fusul +03:00.
  const acum = new Date('2026-08-01T12:00:00+03:00').getTime();

  it('scrie ziua săptămânii cu litere — cea mai ușoară greșeală de prins', () => {
    expect(descrieMoment('2026-08-22T07:00:00', '+03:00', acum)).toContain('sâmbătă');
    expect(descrieMoment('2026-08-22T07:00:00', '+03:00', acum)).toContain('22 august 2026');
    expect(descrieMoment('2026-08-22T07:00:00', '+03:00', acum)).toContain('ora 07:00');
  });

  it('spune și cât mai e până atunci', () => {
    expect(distantaFataDeAcum('2026-08-22T12:00:00', '+03:00', acum)).toBe('peste 3 săptămâni');
  });

  it('un moment trecut se citește ca trecut', () => {
    expect(distantaFataDeAcum('2026-07-27T12:00:00', '+03:00', acum)).toBe('acum 5 zile');
    // `numeric: 'auto'` preferă cuvintele acolo unde româna le are — „ieri" și
    // „alaltăieri" sunt mai clare decât „acum 1 zi" / „acum 2 zile".
    expect(distantaFataDeAcum('2026-07-31T12:00:00', '+03:00', acum)).toBe('ieri');
  });

  it('o valoare invalidă n-are ce confirma', () => {
    expect(descrieMoment('nu-i o dată', '+03:00', acum)).toBe('');
  });
});

describe('problemele pe câmp', () => {
  it('păstrează primul mesaj per câmp', () => {
    // Formatul și relația pot cădea amândouă pe același câmp; cea de format
    // vine prima și e cea care trebuie reparată întâi — a doua n-are sens până
    // atunci.
    const m = problemePeCamp([
      { camp: 'start', mesaj: 'Formatul e greșit.' },
      { camp: 'start', mesaj: 'Startul e după deadline.' },
      { camp: 'tz', mesaj: 'Fusul se scrie ca „+03:00".' },
    ]);
    expect(m.get('start')).toBe('Formatul e greșit.');
    expect(m.get('tz')).toBe('Fusul se scrie ca „+03:00".');
    expect(m.has('venue.name')).toBe(false);
  });
});

describe('verificarea coordonatelor', () => {
  it('un punct valid primește link de verificat', () => {
    expect(linkHarta('47.0182357,28.8213041')).toContain('47.0182357%2C28.8213041');
  });

  it('text căutat pe hartă nu primește link — n-ar verifica nimic', () => {
    expect(linkHarta('Valea Morilor')).toBeNull();
  });
});
