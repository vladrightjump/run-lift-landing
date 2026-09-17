import { describe, it, expect } from 'vitest';
import { eventVars, fillEventVars } from '../../src/content/format';
import { SNAPSHOT_CONFIG } from '../../src/content/eventConfig';

/**
 * Variabilele de eveniment din șabloanele de email.
 *
 * Până acum substituția cunoștea doar date despre PERSOANĂ ({nume}, {prenume},
 * …), deci data și locul cursei erau text literal, tastat de mână în șablon.
 * Publicarea unei ediții noi schimba site-ul și lăsa emailurile în urmă — un
 * participant real primea confirmarea cu data ediției trecute.
 *
 * Contractul păzit aici: variabilele se derivă din ACELAȘI config publicat din
 * care se derivă și textele de pe site, deci cele două nu se pot contrazice.
 */

const config = { ...SNAPSHOT_CONFIG };

describe('variabilele derivate din configul publicat', () => {
  it('acoperă exact rândurile scrise azi de mână în șabloane', () => {
    const v = eventVars(config);
    // „• Când: sâmbătă, 22 august 2026, ora 07:00" — rândul din confirmare.
    // `\w` nu prinde diacriticele românești; de aici clasa explicită.
    expect(v['{data_cursei}']).toMatch(/^[\p{L}]+, \d{1,2} [\p{L}]+ \d{4}$/u);
    expect(v['{ora_start}']).toMatch(/^\d{2}:\d{2}$/);
    // „• Unde: Scările de Granit, Valea Morilor".
    expect(v['{locul}']).toBe(config.venue.name + ', ' + config.venue.city);
    expect(v['{numele_cursei}']).toBe(config.eventName);
    expect(v['{ora_checkin}']).toBe(config.checkinFrom);
    expect(v['{editia}']).toBe(String(config.number));
  });

  it('data scurtă e cea pentru subiect, fără an', () => {
    // „Confirmare înscriere — Hyrox Trial, 22 august".
    const v = eventVars(config);
    expect(v['{data_scurta}']).not.toMatch(/\d{4}/);
    expect(v['{data_cursei}']).toContain(v['{data_scurta}']);
  });

  it('spun același lucru ca textele de pe site', () => {
    // Dacă cele două s-ar deriva separat, emailul și pagina ar putea ajunge să
    // anunțe ore diferite pentru aceeași cursă.
    const v = eventVars(config);
    expect(v['{data_cursei}'].toLowerCase()).toContain(
      String(config.start.slice(8, 10)).replace(/^0/, '')
    );
    expect(v['{ora_start}']).toBe(config.start.slice(11, 16));
  });
});

describe('substituția în textul șablonului', () => {
  const sablon =
    'Salut, {prenume}!\n\n• Când: {data_cursei}, ora {ora_start}\n• Unde: {locul}\n\nNe vedem!';

  it('înlocuiește variabilele de eveniment și le lasă pe cele de persoană', () => {
    const out = fillEventVars(sablon, config);
    expect(out).toContain('{prenume}'); // rămâne pentru pasul următor
    expect(out).not.toContain('{data_cursei}');
    expect(out).not.toContain('{ora_start}');
    expect(out).not.toContain('{locul}');
    expect(out).toContain(config.venue.name);
  });

  it('înlocuiește toate aparițiile aceleiași variabile', () => {
    expect(fillEventVars('{editia}-{editia}', config)).toBe(
      `${config.number}-${config.number}`
    );
  });

  it('un text fără variabile rămâne neatins', () => {
    expect(fillEventVars('Ne vedem la start!', config)).toBe('Ne vedem la start!');
  });

  it('fără config, variabilele rămân literale — nu inventăm o dată', () => {
    // Un email care spune „• Când: , ora " arată intenționat; unul care spune
    // „{data_cursei}" arată stricat, deci cineva îl raportează. Iar o dată
    // greșită e cea mai rea dintre cele trei.
    const out = fillEventVars(sablon, null);
    expect(out).toContain('{data_cursei}');
    expect(out).toBe(sablon);
  });
});
