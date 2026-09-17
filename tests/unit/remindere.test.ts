import { describe, it, expect } from 'vitest';
import {
  remindereleProgramate,
  urmatorulReminder,
  nuMaiPleaca,
  esteNereusit,
  type LivrareReminder,
  type StareReminder,
} from '../../src/admin/remindere';
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
  REMINDER_TEMPLATE_KEYS,
  type EventConfig,
  type ReminderEntry,
} from '../../src/content/eventConfig';
import { ETICHETE_SABLOANE } from '../../src/admin/eventTab/ajutoare';

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

/**
 * A doua sursă de adevăr: jurnalul de livrare.
 *
 * Orarul spune ce ar TREBUI să plece; `email_log` spune ce A plecat. Până acum
 * ecranul afirma doar prima parte, iar `pg_cron` n-a existat niciodată în
 * proiect — deci „pleacă la următoarea verificare" era o promisiune fără ceas.
 * Verificat pe 16 septembrie 2026: zero rânduri `mod = 'broadcast'` în tot
 * jurnalul, pe nicio ediție.
 *
 * `livrari` e al treilea parametru din acelaşi motiv pentru care `acum` e al
 * doilea: altfel nimic din asta n-ar fi testabil.
 */
describe('remindereleProgramate — starea vine și din jurnal, nu doar din orar', () => {
  /** Momentul la care scadența celui de 24h a trecut cu o oră peste grație. */
  const DUPA_GRATIE = START - 24 * ORA + (REMINDER_GRACE_HOURS + 1) * ORA;
  /** În fereastra de potrivire a reminderului de 24h. */
  const IN_FEREASTRA = START - 23 * ORA;

  const livr = (
    la: number,
    status: 'trimis' | 'esuat' = 'trimis',
    sablon: string | null = 'bulk_participant_reminder'
  ): LivrareReminder => ({ sablon, status, la });

  const stareaCu = (livrari: LivrareReminder[] | null, acum = DUPA_GRATIE, intrari = [rem(24)]) =>
    remindereleProgramate(cuRemindere(intrari), acum, livrari)[0];

  it('jurnal gol după grație: NEPLECAT — ceasul n-a existat, nu doar n-a apucat', () => {
    const r = stareaCu([]);
    expect(r.stare).toBe('neplecat');
    expect(r.nota).toContain('runlift_reminder');
  });

  /**
   * Distincția portantă a unității. `ratat` înseamnă „ceasul n-a apucat";
   * `neplecat` înseamnă „ceasul n-a existat". Operatorul face altceva în
   * fiecare caz: la primul micșorează avansul, la al doilea verifică jobul.
   */
  it('neplecat e distinct de ratat, nu un sinonim', () => {
    expect(stareaCu([]).stare).not.toBe(stareaCu(null).stare);
  });

  it('jurnal indisponibil: cade pe comportamentul de azi, fără să afirme livrare', () => {
    const r = stareaCu(null);
    expect(r.stare).toBe('ratat');
    expect(r.nota).toContain('NU mai pleacă');
  });

  it('jurnalul lipsă (`null`) nu e același lucru cu jurnalul gol (`[]`)', () => {
    // Fără gardă, un RPC eșuat ar transforma fiecare reminder scadent în
    // „neplecat" — o afirmație la fel de falsă, doar în cealaltă direcție.
    expect(remindereleProgramate(cuRemindere([rem(24)]), DUPA_GRATIE)[0].stare).toBe('ratat');
  });

  it('o livrare reușită în fereastră: trimis', () => {
    expect(stareaCu([livr(IN_FEREASTRA)]).stare).toBe('trimis');
  });

  it('doar livrări eșuate: esuat, nu trimis', () => {
    const r = stareaCu([livr(IN_FEREASTRA, 'esuat')]);
    expect(r.stare).toBe('esuat');
    expect(r.nota).toBeTruthy();
  });

  it('eșec și reușită în aceeași fereastră: succesul domină', () => {
    expect(stareaCu([livr(IN_FEREASTRA, 'esuat'), livr(IN_FEREASTRA)]).stare).toBe('trimis');
  });

  /**
   * Potrivirea se face pe cheia șablonului, nu pe subiect: subiectul e
   * editabil din tabul „Șabloane", iar o potrivire pe text s-ar rupe tăcut la
   * prima reformulare.
   */
  it('livrare cu alt șablon, în aceeași fereastră: nepotrivită', () => {
    expect(stareaCu([livr(IN_FEREASTRA, 'trimis', 'bulk_participant_reminder_final')]).stare).toBe(
      'neplecat'
    );
  });

  it('livrare fără șablon înregistrat: nepotrivită', () => {
    expect(stareaCu([livr(IN_FEREASTRA, 'trimis', null)]).stare).toBe('neplecat');
  });

  it('livrare cu șablonul potrivit, dar în afara ferestrei: nepotrivită', () => {
    expect(stareaCu([livr(DUPA_GRATIE)]).stare).toBe('neplecat');
  });

  it('două rânduri cu același șablon la avansuri diferite iau fiecare livrarea lui', () => {
    const programate = remindereleProgramate(
      cuRemindere([rem(72), rem(24)]),
      DUPA_GRATIE,
      [livr(START - 71 * ORA)]
    );
    // Sortate descrescător după avans: 72 primul.
    expect(programate.map((r) => r.stare)).toEqual(['trimis', 'neplecat']);
  });

  it('o livrare reușită în grație scurtcircuitează „iminent" — a plecat deja', () => {
    const inGratie = START - 24 * ORA + ORA;
    expect(stareaCu([], inGratie).stare).toBe('iminent');
    expect(stareaCu([livr(IN_FEREASTRA)], inGratie).stare).toBe('trimis');
  });

  it('un eșec în grație rămâne iminent — cron-ul mai are o rulare', () => {
    const inGratie = START - 24 * ORA + ORA;
    expect(stareaCu([livr(IN_FEREASTRA, 'esuat')], inGratie).stare).toBe('iminent');
  });

  it('înainte de scadență rămâne programat, indiferent de jurnal', () => {
    expect(stareaCu([livr(IN_FEREASTRA)], START - 30 * ORA).stare).toBe('programat');
  });

  it('bifa scoasă: oprit, indiferent de jurnal', () => {
    expect(stareaCu([livr(IN_FEREASTRA)], DUPA_GRATIE, [rem(24, false)]).stare).toBe('oprit');
  });

  /**
   * Cazul întregului istoric real: edițiile 5 și 6 au startul în urmă și n-au
   * niciun rând `broadcast` în jurnal, fiindcă reminderele lor au plecat ca
   * difuzări manuale (`mod = 'admin'`). `trecut` scurtcircuitează înaintea
   * oricărei verificări, deci nu se aprinde nimic retroactiv.
   */
  it('startul trecut: trecut, cu jurnal gol — istoricul nu se aprinde retroactiv', () => {
    expect(stareaCu([], START + ORA).stare).toBe('trecut');
  });
});

describe('clasificarea stărilor — o singură sursă pentru afișare', () => {
  const stari = (...s: StareReminder[]): StareReminder[] => s;

  it('nu mai pleacă nimic din stările terminale', () => {
    expect(stari('trimis', 'esuat', 'ratat', 'neplecat', 'trecut').map(nuMaiPleaca)).toEqual([
      true, true, true, true, true,
    ]);
    expect(stari('programat', 'iminent').map(nuMaiPleaca)).toEqual([false, false]);
  });

  it('nereușit înseamnă terminal FĂRĂ livrare — semnul de eroare din listă', () => {
    expect(stari('esuat', 'ratat', 'neplecat').map(esteNereusit)).toEqual([true, true, true]);
    expect(
      stari('trimis', 'programat', 'iminent', 'oprit', 'trecut').map(esteNereusit)
    ).toEqual([false, false, false, false, false]);
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

/**
 * Al treilea șablon de reminder: întrebarea binară de la 72 de ore.
 *
 * Nu reamintește, întreabă — iar singura acțiune e eliberarea locului, prin
 * `{link_renunt}`. Rostul avansului mare: la 24 de ore un loc eliberat rămâne
 * gol, la 72 apucă să-l ia cineva de pe lista de așteptare.
 */
describe('șablonul binar de la 72 de ore', () => {
  const binar = (offsetHours: number): ReminderEntry => ({
    offsetHours,
    enabled: true,
    template: 'bulk_participant_reminder_binar',
  });

  it('cheia e cunoscută de orar', () => {
    expect(REMINDER_TEMPLATE_KEYS).toContain('bulk_participant_reminder_binar');
  });

  /**
   * Exhaustiv pe tablou, nu enumerat de mână: altfel cheia următoare intră cu
   * un selector care arată cheia brută din DB în loc de o etichetă.
   */
  it('fiecare cheie de reminder are etichetă în selector', () => {
    for (const cheie of REMINDER_TEMPLATE_KEYS) {
      expect(ETICHETE_SABLOANE[cheie]).toBeTruthy();
    }
  });

  it('un rând la 72 de ore cu șablonul binar e valid', () => {
    expect(validateEventConfig(cuRemindere([binar(72)]))).toEqual([]);
  });

  it('trece prin parsarea documentului venit de pe rețea', () => {
    const { reminders: _, ...rest } = SNAPSHOT_CONFIG;
    expect(parseEventConfig({ ...rest, reminders: [binar(72)] })?.reminders).toEqual([binar(72)]);
  });

  /**
   * Cheia de idempotență din DB e (ediție, avans), nu (ediție, șablon): două
   * rânduri la același avans rămân refuzate chiar dacă textele diferă.
   */
  it('nu scapă de regula avansului unic doar fiindcă e alt șablon', () => {
    const campuri = validateEventConfig(cuRemindere([rem(72), binar(72)])).map((p) => p.camp);
    expect(campuri).toContain('reminders');
  });

  it('se poate combina cu celelalte două într-un orar de trei rânduri', () => {
    expect(validateEventConfig(cuRemindere([binar(72), rem(24), rem(3)]))).toEqual([]);
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
