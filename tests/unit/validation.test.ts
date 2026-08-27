import { describe, it, expect } from 'vitest';
import {
  EMAIL_RE,
  PHONE_RE,
  normalizePhone,
  MIN_AGE,
  ageAtEvent,
  dataNasteriiError,
  validate,
  firstErrorField,
  errorMessage,
} from '../../src/lib/validation';
import { SNAPSHOT_CONFIG } from '../../src/content/eventConfig';

// Startul ediției e acum argument, nu import: validarea de vârstă îl primește
// de la apelant (configul activ), ca regula să urmeze ediția publicată.
const START = SNAPSHOT_CONFIG.start;
import type { FormData } from '../../src/lib/validation';

/** Formular complet valid — punctul de plecare pentru testele pe câmp. */
const valid: FormData = {
  nume: 'Ana Popescu',
  telefon: '069123456',
  email: 'ana@email.ro',
  dataNasterii: '1994-05-20',
  acord: true,
};

/**
 * Data evenimentului ca [an, lună, zi], citită din componentele string-ului
 * local — aceeași sursă pe care o folosește și implementarea. Varianta veche
 * formata un `Date` prin `Intl`; odată ce startul a devenit argument, un `Date`
 * importat nu mai există și un `undefined` s-ar formata tăcut ca ziua de azi.
 */
const eventYMD = (): [number, number, number] => {
  const [y, m, d] = START.split('T')[0].split('-').map(Number);
  return [y, m, d];
};

const pad = (n: number) => String(n).padStart(2, '0');
/** Ziua de naștere a cuiva care împlinește exact `ani` în ziua evenimentului. */
const naStereLa = (ani: number, offsetZile = 0): string => {
  const [y, m, d] = eventYMD();
  const dt = new Date(Date.UTC(y - ani, m - 1, d + offsetZile));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
};

describe('normalizePhone', () => {
  it('scoate spații, paranteze, puncte și liniuțe', () => {
    expect(normalizePhone('069 123 456')).toBe('069123456');
    expect(normalizePhone('(069) 123-456')).toBe('069123456');
    expect(normalizePhone('069.123.456')).toBe('069123456');
  });

  it('păstrează prefixul internațional', () => {
    // Intenționat: acceptăm și participanți din afara Moldovei.
    expect(normalizePhone('+373 69 123 456')).toBe('+37369123456');
  });

  it('lasă neatins un număr deja curat', () => {
    expect(normalizePhone('069123456')).toBe('069123456');
  });

  it('nu modifică cifrele', () => {
    expect(normalizePhone('0 6 9 1 2 3 4 5 6')).toBe('069123456');
  });
});

describe('PHONE_RE', () => {
  it('acceptă numere moldovenești', () => {
    for (const t of ['069123456', '060875770', '079000111']) {
      expect(PHONE_RE.test(normalizePhone(t))).toBe(true);
    }
  });

  it('acceptă formatul internațional', () => {
    for (const t of ['+373 69 123 456', '+40 721 234 567', '+1 555 010 9999']) {
      expect(PHONE_RE.test(normalizePhone(t))).toBe(true);
    }
  });

  it('respinge ce nu e număr', () => {
    for (const t of ['abcdefghi', '', '   ', '069-abc-456']) {
      expect(PHONE_RE.test(normalizePhone(t))).toBe(false);
    }
  });

  it('respinge numere prea scurte sau prea lungi', () => {
    expect(PHONE_RE.test(normalizePhone('1234567'))).toBe(false); // 7 cifre
    expect(PHONE_RE.test(normalizePhone('1234567890123456'))).toBe(false); // 16 cifre
  });

  it('acceptă 8–15 cifre — prag deliberat larg pentru numere internaționale', () => {
    // Documentează o alegere de design: NU validăm structura numerelor
    // moldovenești strict, ca să nu blocăm participanți din alte țări.
    // Efect secundar acceptat: „06912345" (8 cifre) trece.
    expect(PHONE_RE.test('12345678')).toBe(true);
    expect(PHONE_RE.test('123456789012345')).toBe(true);
  });

  it('acceptă un singur plus, doar la început', () => {
    expect(PHONE_RE.test('+37369123456')).toBe(true);
    expect(PHONE_RE.test('373+69123456')).toBe(false);
    expect(PHONE_RE.test('++37369123456')).toBe(false);
  });
});

describe('EMAIL_RE', () => {
  it('acceptă adrese valide', () => {
    const valide = [
      'andrei@email.ro',
      'dumitru@barbaros.md',
      'nume.prenume+tag@sub.domeniu.com',
      'a@b.co',
    ];
    for (const t of valide) expect(EMAIL_RE.test(t)).toBe(true);
  });

  it('respinge adrese invalide', () => {
    const invalide = [
      'nu-e-email',
      '@fara-parte-locala.com',
      'fara-domeniu@',
      'fara@tld',
      'spatiu in@email.com',
      'doua@@arobase.com',
      '',
    ];
    for (const t of invalide) expect(EMAIL_RE.test(t)).toBe(false);
  });

  it('cere cel puțin două caractere după ultimul punct', () => {
    expect(EMAIL_RE.test('a@b.c')).toBe(false);
    expect(EMAIL_RE.test('a@b.co')).toBe(true);
  });
});

describe('vârsta la data evenimentului', () => {
  it('calculează ani întregi', () => {
    expect(ageAtEvent('2000-01-01', START)).toBeGreaterThan(20);
  });

  it('returnează null pentru date invalide', () => {
    expect(ageAtEvent('', START)).toBeNull();
    expect(ageAtEvent('nu-e-data', START)).toBeNull();
  });

  it('respinge participanții sub vârsta minimă', () => {
    const anulCurent = new Date().getFullYear();
    const preTanar = `${anulCurent - (MIN_AGE - 2)}-01-01`;
    expect(dataNasteriiError(preTanar, START)).not.toBeNull();
  });

  it('acceptă o dată de naștere validă', () => {
    expect(dataNasteriiError('1994-05-20', START)).toBeNull();
  });
});

describe('pragul de vârstă la data evenimentului', () => {
  it('exact MIN_AGE în ziua evenimentului → acceptat', () => {
    // Cazul de la limită: cineva care împlinește 14 ani chiar în ziua cursei
    // are voie să participe. Un „<=" scris greșit l-ar respinge.
    const zi = naStereLa(MIN_AGE);
    expect(ageAtEvent(zi, START)).toBe(MIN_AGE);
    expect(dataNasteriiError(zi, START)).toBeNull();
  });

  it('cu o zi prea tânăr → respins', () => {
    const zi = naStereLa(MIN_AGE, 1);
    expect(ageAtEvent(zi, START)).toBe(MIN_AGE - 1);
    expect(dataNasteriiError(zi, START)).toMatch(new RegExp(`minim ${MIN_AGE} ani`));
  });

  it('cu o zi mai în vârstă decât pragul → acceptat', () => {
    expect(dataNasteriiError(naStereLa(MIN_AGE, -1), START)).toBeNull();
  });

  it('exact 100 de ani e acceptat, 101 nu', () => {
    expect(dataNasteriiError(naStereLa(100), START)).toBeNull();
    expect(dataNasteriiError(naStereLa(101), START)).toBe('Data nașterii nu e validă.');
  });

  it('pragul e identic în orice fus orar al vizitatorului', () => {
    // Regula se calculează pe data evenimentului în ora Chișinăului. Dacă
    // cineva revine la EVENT_DATE.getDate() (fusul browserului), un
    // participant din Honolulu ar primi alt verdict decât unul din Chișinău.
    const [y, m, d] = eventYMD();
    expect(ageAtEvent(`${y - MIN_AGE}-${pad(m)}-${pad(d)}`, START)).toBe(MIN_AGE);
  });
});

describe('date care nu există în calendar', () => {
  it('respinge 30 februarie și 31 aprilie', () => {
    // Formularul are ziua 1–31 independent de lună, deci combinația e chiar
    // selectabilă. `new Date("2012-02-30")` NU dă eroare — o rostogolește în
    // martie — așa că fără verificare explicită ar trece ca dată validă.
    for (const zi of ['2012-02-30', '2012-04-31', '2012-06-31', '2012-09-31']) {
      expect(ageAtEvent(zi, START)).toBeNull();
      expect(dataNasteriiError(zi, START)).toBe('Data nașterii nu e validă.');
    }
  });

  it('29 februarie e valid doar în an bisect', () => {
    expect(ageAtEvent('2012-02-29', START)).not.toBeNull(); // 2012 e bisect
    expect(ageAtEvent('2011-02-29', START)).toBeNull();
  });

  it('respinge luna sau ziua în afara intervalului', () => {
    for (const zi of ['2012-13-01', '2012-00-10', '2012-01-32', '2012-01-00']) {
      expect(ageAtEvent(zi, START)).toBeNull();
    }
  });

  it('cere formatul yyyy-mm-dd, cu zerouri în față', () => {
    // Selectoarele produc mereu forma cu pad; orice altceva e semn de bug.
    expect(ageAtEvent('2012-2-5', START)).toBeNull();
    expect(ageAtEvent('05-20-1994', START)).toBeNull();
    expect(ageAtEvent('1994-05-20T00:00:00Z', START)).toBeNull();
  });
});

describe('validate (formularul de înscriere)', () => {
  it('un formular complet valid nu produce erori', () => {
    expect(validate(valid, START)).toEqual({});
  });

  it('semnalează fiecare câmp independent', () => {
    expect(validate({ ...valid, nume: 'An' }, START)).toEqual({ nume: true });
    expect(validate({ ...valid, telefon: 'abc' }, START)).toEqual({ telefon: true });
    expect(validate({ ...valid, email: 'nu-e-email' }, START)).toEqual({ email: true });
    expect(validate({ ...valid, dataNasterii: '' }, START)).toEqual({ dataNasterii: true });
    expect(validate({ ...valid, acord: false }, START)).toEqual({ acord: true });
  });

  it('numele cere minim 3 caractere', () => {
    expect(validate({ ...valid, nume: 'An' }, START).nume).toBe(true);
    expect(validate({ ...valid, nume: 'Ana' }, START).nume).toBeUndefined();
  });

  it('adună toate erorile deodată, nu doar prima', () => {
    const errs = validate({ nume: '', telefon: '', email: '', dataNasterii: '', acord: false }, START);
    expect(Object.keys(errs).sort()).toEqual(
      ['acord', 'dataNasterii', 'email', 'nume', 'telefon'].sort()
    );
  });

  it('primește input deja curățat de spații (contractul cu formularul)', () => {
    // Componenta face .trim() înainte de validate. Documentăm dependența:
    // dacă cineva scoate trim-ul din formular, un nume din spații ar trece.
    expect(validate({ ...valid, nume: '   ' }, START).nume).toBeUndefined();
    expect(validate({ ...valid, nume: '   '.trim() }, START).nume).toBe(true);
  });

  it('acceptă telefon scris cu spații și prefix internațional', () => {
    expect(validate({ ...valid, telefon: '+373 69 123 456' }, START)).toEqual({});
    expect(validate({ ...valid, telefon: '(069) 123-456' }, START)).toEqual({});
  });
});

describe('firstErrorField (unde sare focusul)', () => {
  it('respectă ordinea vizuală a câmpurilor', () => {
    const toate = validate({ nume: '', telefon: '', email: '', dataNasterii: '', acord: false }, START);
    expect(firstErrorField(toate)).toBe('nume');
    expect(firstErrorField({ telefon: true, email: true })).toBe('telefon');
    expect(firstErrorField({ email: true, dataNasterii: true })).toBe('email');
    expect(firstErrorField({ dataNasterii: true })).toBe('dataNasterii');
  });

  it('nu întoarce „acord" — checkboxul nu primește focus', () => {
    expect(firstErrorField({ acord: true })).toBeUndefined();
  });

  it('fără erori → undefined', () => {
    expect(firstErrorField({})).toBeUndefined();
  });
});

describe('errorMessage (textul din toast)', () => {
  it('mesaj dedicat când singura problemă e acordul', () => {
    expect(errorMessage({ acord: true })).toMatch(/accepți regulamentul/i);
  });

  it('mesaj generic când sunt mai multe probleme', () => {
    expect(errorMessage({ acord: true, email: true })).toMatch(/câmpurile marcate/i);
    expect(errorMessage({ email: true })).toMatch(/câmpurile marcate/i);
  });
});
