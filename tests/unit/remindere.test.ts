import { describe, it, expect } from 'vitest';
import { remindereleProgramate, urmatorulReminder } from '../../src/admin/remindere';
import {
  adaugaReminder,
  stergeReminder,
  seteazaReminder,
  remindereCronologic,
  validateEventConfig,
  avertismenteEventConfig,
} from '../../src/admin/eventConfigForm';
import {
  parseEventConfig,
  SNAPSHOT_CONFIG,
  DEFAULT_REMINDERS,
  MAX_REMINDERS,
  REMINDER_GRACE_HOURS,
  type EventConfig,
  type ReminderEntry,
} from '../../src/content/eventConfig';

/**
 * Orarul reminderelor: când pleacă fiecare, când NU mai pleacă, și ce spune
 * despre asta formularul.
 *
 * Miza e a doua parte. Regula de declanșare trăiește în DB
 * (`runlift.maybe_send_reminder`), unde nimeni n-o vede; dacă traducerea ei în
 * admin e greșită, organizatorul citește „cu 72h înainte" pe un email care nu
 * pleacă niciodată. `acum` e parametru peste tot — testele nu depind de ziua în
 * care rulează.
 */

const ORA = 3_600_000;

/** Startul ediției din instantaneu, ca moment absolut. */
const START = new Date(`${SNAPSHOT_CONFIG.start}${SNAPSHOT_CONFIG.tz}`).getTime();

const cuRemindere = (reminders: ReminderEntry[]): EventConfig => ({
  ...SNAPSHOT_CONFIG,
  reminders,
});

const rem = (offsetHours: number, enabled = true): ReminderEntry => ({
  offsetHours,
  enabled,
  template: 'bulk_participant_reminder',
});

describe('remindereleProgramate — regula din DB, tradusă în stare vizibilă', () => {
  it('înainte de scadență: programat, cu distanța până la el', () => {
    const [r] = remindereleProgramate(cuRemindere([rem(24)]), START - 30 * ORA);
    expect(r.stare).toBe('programat');
    expect(r.distanta).toBe('peste 6 ore');
    expect(r.nota).toBeUndefined();
  });

  it('exact la scadență: iminent — pleacă la următoarea rulare de cron', () => {
    const [r] = remindereleProgramate(cuRemindere([rem(24)]), START - 24 * ORA);
    expect(r.stare).toBe('iminent');
  });

  it('în fereastra de grație: încă iminent', () => {
    const acum = START - 24 * ORA + (REMINDER_GRACE_HOURS - 0.5) * ORA;
    expect(remindereleProgramate(cuRemindere([rem(24)]), acum)[0].stare).toBe('iminent');
  });

  /**
   * Cazul concret pentru care există fereastra de grație: cu regula veche
   * ([start − offset, start] întreagă), un cron armat cu trei ore înainte de
   * start ar fi trimis „mâine alergăm" oamenilor aflați în drum spre cursă.
   */
  it('după grație, dar înainte de start: RATAT — nu mai pleacă', () => {
    const acum = START - 24 * ORA + (REMINDER_GRACE_HOURS + 1) * ORA;
    const [r] = remindereleProgramate(cuRemindere([rem(24)]), acum);
    expect(r.stare).toBe('ratat');
    expect(r.nota).toContain('NU mai pleacă');
  });

  it('după start: trecut, indiferent de avans', () => {
    const programate = remindereleProgramate(cuRemindere([rem(72), rem(3)]), START + ORA);
    expect(programate.map((r) => r.stare)).toEqual(['trecut', 'trecut']);
  });

  it('reminder oprit: nu pleacă nici în fereastra lui', () => {
    const [r] = remindereleProgramate(cuRemindere([rem(24, false)]), START - 24 * ORA);
    expect(r.stare).toBe('oprit');
  });

  it('rândurile ies în ordinea în care pleacă emailurile, nu în cea din document', () => {
    const programate = remindereleProgramate(cuRemindere([rem(3), rem(72), rem(24)]), START - 100 * ORA);
    expect(programate.map((r) => r.intrare.offsetHours)).toEqual([72, 24, 3]);
  });

  /**
   * Rândurile se afișează sortat, dar se EDITEAZĂ prin `index`, care e poziția
   * din document. Dacă indexul ar urma sortarea, o modificare pe primul rând
   * afișat ar rescrie alt reminder decât cel atins.
   */
  it('indexul rămâne poziția din document, nu cea din afișare', () => {
    const programate = remindereleProgramate(cuRemindere([rem(3), rem(72)]), START - 100 * ORA);
    expect(programate[0].intrare.offsetHours).toBe(72);
    expect(programate[0].index).toBe(1);
  });

  it('start stricat → listă goală, nu ore derivate din NaN', () => {
    const stricat = { ...cuRemindere([rem(24)]), start: 'mâine dimineață' };
    expect(remindereleProgramate(stricat, START)).toEqual([]);
  });
});

describe('urmatorulReminder — rezumatul de deasupra listei', () => {
  it('sare peste cele ratate și oprite și îl dă pe primul care chiar pleacă', () => {
    // La 20h înainte de start: cel de 72h e demult ratat, cel de 24h la fel
    // (grația a expirat), deci următorul real e cel de 3h.
    const programate = remindereleProgramate(
      cuRemindere([rem(72), rem(24), rem(3)]),
      START - 20 * ORA
    );
    expect(urmatorulReminder(programate)?.intrare.offsetHours).toBe(3);
  });

  it('null când niciunul nu mai pleacă — starea care trebuie văzută', () => {
    const programate = remindereleProgramate(cuRemindere([rem(72), rem(24)]), START - ORA);
    expect(urmatorulReminder(programate)).toBeNull();
  });
});

describe('validarea orarului oglindește event_config_validate', () => {
  const campuri = (c: EventConfig) => validateEventConfig(c).map((p) => p.camp);

  it('orarul implicit e valid', () => {
    expect(validateEventConfig(SNAPSHOT_CONFIG)).toEqual([]);
  });

  it('avans zero sau negativ', () => {
    expect(campuri(cuRemindere([rem(0)]))).toContain('reminders.0.offsetHours');
    expect(campuri(cuRemindere([rem(-5)]))).toContain('reminders.0.offsetHours');
  });

  it('avans peste 30 de zile — nu mai e reminder, e anunț', () => {
    expect(campuri(cuRemindere([rem(721)]))).toContain('reminders.0.offsetHours');
    expect(campuri(cuRemindere([rem(720)]))).not.toContain('reminders.0.offsetHours');
  });

  it('avans fracționar', () => {
    expect(campuri(cuRemindere([rem(2.5)]))).toContain('reminders.0.offsetHours');
  });

  /**
   * Cheia de idempotență din DB e (ediție, avans), deci al doilea reminder cu
   * același avans n-ar pleca NICIODATĂ. Un rând inert e mai rău decât unul
   * refuzat: arată programat.
   */
  it('două remindere la același avans', () => {
    expect(campuri(cuRemindere([rem(24), rem(24)]))).toContain('reminders');
  });

  it('peste plafon', () => {
    const prea = Array.from({ length: MAX_REMINDERS + 1 }, (_, i) => rem(i + 1));
    expect(campuri(cuRemindere(prea))).toContain('reminders');
  });

  it('șablon inexistent', () => {
    const gresit = [{ ...rem(24), template: 'inventat' }] as unknown as ReminderEntry[];
    expect(campuri(cuRemindere(gresit))).toContain('reminders.0.template');
  });
});

describe('avertismente', () => {
  it('orar gol — nimeni nu primește nimic înainte de cursă', () => {
    const av = avertismenteEventConfig(cuRemindere([]));
    expect(av.some((a) => a.mesaj.includes('Nu e programat niciun reminder'))).toBe(true);
  });

  it('toate oprite — la fel de tăcut, dar mai ușor de produs din greșeală', () => {
    const av = avertismenteEventConfig(cuRemindere([rem(24, false)]));
    expect(av.some((a) => a.mesaj.includes('Toate reminderele sunt oprite'))).toBe(true);
  });

  it('un reminder activ — fără avertisment', () => {
    expect(avertismenteEventConfig(cuRemindere([rem(24)]))).toEqual([]);
  });
});

describe('helperii de listă', () => {
  it('adaugă propune un avans liber, nu un duplicat invalid', () => {
    expect(adaugaReminder([rem(24)])[1].offsetHours).toBe(72);
    expect(adaugaReminder([rem(24), rem(72)])[2].offsetHours).toBe(3);
  });

  it('adaugă se oprește la plafon', () => {
    const plin = Array.from({ length: MAX_REMINDERS }, (_, i) => rem(i + 1));
    expect(adaugaReminder(plin)).toHaveLength(MAX_REMINDERS);
  });

  it('șterge scoate exact rândul cerut', () => {
    expect(stergeReminder([rem(72), rem(24), rem(3)], 1).map((r) => r.offsetHours)).toEqual([72, 3]);
  });

  it('setează nu atinge restul listei', () => {
    const lista = [rem(72), rem(24)];
    const nou = seteazaReminder(lista, 1, 'enabled', false);
    expect(nou[1].enabled).toBe(false);
    expect(nou[0]).toBe(lista[0]);
  });

  it('cronologic e o copie sortată, nu o mutație', () => {
    const lista = [rem(3), rem(72)];
    expect(remindereCronologic(lista).map((r) => r.offsetHours)).toEqual([72, 3]);
    expect(lista.map((r) => r.offsetHours)).toEqual([3, 72]);
  });
});

describe('parseEventConfig — orarul venit de pe rețea', () => {
  const doc = (reminders: unknown): unknown => {
    const { reminders: _, ...rest } = SNAPSHOT_CONFIG;
    return reminders === undefined ? rest : { ...rest, reminders };
  };

  /**
   * Distincția care contează: cheia LIPSĂ e un document publicat înainte de
   * orarul configurabil, care are un reminder deja promis. `[]` e o decizie.
   */
  it('cheia lipsă cade pe implicit, nu pe „niciun reminder"', () => {
    expect(parseEventConfig(doc(undefined))?.reminders).toEqual(DEFAULT_REMINDERS);
  });

  it('lista goală se respectă — organizatorul le-a șters', () => {
    expect(parseEventConfig(doc([]))?.reminders).toEqual([]);
  });

  it('o intrare stricată cade, restul orarului rămâne', () => {
    const parsat = parseEventConfig(
      doc([rem(72), { offsetHours: 'curând' }, rem(24)])
    );
    expect(parsat?.reminders.map((r) => r.offsetHours)).toEqual([72, 24]);
  });

  it('duplicatele scurse printr-o scriere directă în DB cad', () => {
    expect(parseEventConfig(doc([rem(24), rem(24)]))?.reminders).toHaveLength(1);
  });

  it('un șablon necunoscut cade — n-ar avea ce trimite', () => {
    expect(parseEventConfig(doc([{ ...rem(24), template: 'inventat' }]))?.reminders).toEqual([]);
  });
});
