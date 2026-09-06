import { describe, it, expect } from 'vitest';
import {
  cheieTrimitere,
  motivEsec,
  ultimaIncercarePerCheie,
  emailuriNelivrate,
  emailuriRetrimisibile,
  emailuriRejucabile,
  motivNerejucabil,
  participantiFaraEmail,
  COMUNICARI_EDITIE,
  acoperire,
} from '../../src/admin/deliveryLog';
import type { AdminEmailLogEntry, AdminRegistration } from '../../src/lib/adminApi';

const log = (over: Partial<AdminEmailLogEntry> = {}): AdminEmailLogEntry => ({
  id: 'e1',
  created_at: '2026-08-10T10:00:00Z',
  email: 'a@ex.ro',
  nume: 'Ana',
  subiect: 'Reminder',
  text_email: 'text',
  mod: 'admin',
  audienta: 'participanti',
  sablon: null,
  status: 'esuat',
  provider_status: 422,
  eroare: '{"message":"Invalid email"}',
  editie: 5,
  ...over,
});

const reg = (over: Partial<AdminRegistration> = {}): AdminRegistration => ({
  id: 'r1',
  created_at: '2026-08-01T10:00:00Z',
  nume: 'Ion Pop',
  telefon: '069',
  email: 'ion@ex.ro',
  echipa: '',
  editie: 5,
  dezabonat_la: null,
  ...over,
});

describe('deliveryLog', () => {
  it('cheieTrimitere normalizează adresa și include subiectul', () => {
    expect(cheieTrimitere(log({ email: 'A@Ex.RO', subiect: 'X' }))).toBe('a@ex.ro|X');
  });

  it('motivEsec citește message din JSON-ul providerului', () => {
    expect(motivEsec(log({ eroare: '{"message":"Invalid email"}' }))).toBe('Invalid email');
  });

  it('motivEsec cade pe name, apoi corpul brut, apoi HTTP/necunoscut', () => {
    expect(motivEsec(log({ eroare: '{"name":"validation_error"}' }))).toBe('validation_error');
    expect(motivEsec(log({ eroare: 'boom' }))).toBe('boom');
    expect(motivEsec(log({ eroare: null, provider_status: 500 }))).toBe('HTTP 500');
    expect(motivEsec(log({ eroare: null, provider_status: null }))).toBe('Motiv necunoscut');
  });

  it('ultimaIncercarePerCheie păstrează prima apariție (cea mai recentă)', () => {
    const intrari = [
      log({ id: 'nou', subiect: 'S', status: 'trimis' }),
      log({ id: 'vechi', subiect: 'S', status: 'esuat' }),
    ];
    const m = ultimaIncercarePerCheie(intrari);
    expect(m.size).toBe(1);
    expect(m.get('a@ex.ro|S')?.id).toBe('nou');
  });

  it('emailuriNelivrate: o retrimitere reușită repară un eșec vechi', () => {
    const intrari = [
      log({ id: 'nou', status: 'trimis' }),
      log({ id: 'vechi', status: 'esuat' }),
      log({ id: 'alt', email: 'b@ex.ro', status: 'esuat' }),
    ];
    expect(emailuriNelivrate(intrari).map((e) => e.id)).toEqual(['alt']);
  });

  it('emailuriRetrimisibile păstrează doar modul admin', () => {
    const ne = [
      log({ id: 'a', mod: 'admin' }),
      log({ id: 'b', mod: 'broadcast' }),
      log({ id: 'c', mod: 'confirm' }),
    ];
    expect(emailuriRetrimisibile(ne).map((e) => e.id)).toEqual(['a']);
  });

  it('participantiFaraEmail: cine nu apare deloc în jurnal (case-insensitive)', () => {
    const participanti = [reg({ id: 'r1', email: 'ion@ex.ro' }), reg({ id: 'r2', email: 'Ana@Ex.ro' })];
    const intrari = [log({ email: 'ION@ex.ro' })];
    expect(participantiFaraEmail(participanti, intrari).map((p) => p.id)).toEqual(['r2']);
  });
});

describe('acoperire', () => {
  const ana = reg({ id: 'r1', nume: 'Ana Popescu', email: 'ana@ex.ro' });
  const mihai = reg({ id: 'r2', nume: 'Mihai Ionescu', email: 'mihai@ex.ro' });

  /** `email_log` vine cele mai noi primele — fixture-urile respectă ordinea. */
  const celule = (participanti: AdminRegistration[], intrari: AdminEmailLogEntry[]) =>
    Object.fromEntries(
      acoperire(participanti, intrari).map((r) => [r.participant.id, r.celule])
    );

  it('confirmarea reușită NU acoperă reminderul eșuat', () => {
    // Exact defectul pe care îl ascundea insigna veche: cheiată doar pe adresă,
    // arăta „✓ trimis" pentru cea mai recentă trimitere, de orice fel.
    const c = celule(
      [ana],
      [
        log({ id: 'e2', email: 'ana@ex.ro', mod: 'confirm', subiect: 'Confirmare', status: 'trimis' }),
        log({ id: 'e1', email: 'ana@ex.ro', mod: 'broadcast', subiect: 'Reminder', status: 'esuat' }),
      ]
    );
    expect(c.r1.confirmare).toBe('trimis');
    expect(c.r1.reminder).toBe('esuat');
  });

  it('cine n-are nicio intrare în jurnal e „lipsă" pe toate coloanele', () => {
    const c = celule([mihai], []);
    for (const com of COMUNICARI_EDITIE) expect(c.r2[com.cheie]).toBe('lipsa');
  });

  it('o retrimitere reușită a ACELEIAȘI comunicări repară eșecul', () => {
    const c = celule(
      [ana],
      [
        log({ id: 'e2', email: 'ana@ex.ro', mod: 'broadcast', subiect: 'Reminder v2', status: 'trimis' }),
        log({ id: 'e1', email: 'ana@ex.ro', mod: 'broadcast', subiect: 'Reminder', status: 'esuat' }),
      ]
    );
    expect(c.r1.reminder).toBe('trimis');
  });

  it('confirmarea prin promovare din așteptare contează tot ca „confirmare"', () => {
    const c = celule(
      [ana],
      [log({ id: 'e1', email: 'ana@ex.ro', mod: 'promoted', subiect: 'Ai intrat', status: 'trimis' })]
    );
    expect(c.r1.confirmare).toBe('trimis');
  });

  it('o difuzare ad-hoc din backoffice nu umple nicio coloană datorată', () => {
    const c = celule(
      [ana],
      [log({ id: 'e1', email: 'ana@ex.ro', mod: 'admin', subiect: 'Ceva', status: 'trimis' })]
    );
    for (const com of COMUNICARI_EDITIE) expect(c.r1[com.cheie]).toBe('lipsa');
  });

  it('potrivirea adresei e insensibilă la majuscule', () => {
    const c = celule(
      [reg({ id: 'r1', email: 'Ana@Ex.ro' })],
      [log({ id: 'e1', email: 'ana@ex.ro', mod: 'confirm', status: 'trimis' })]
    );
    expect(c.r1.confirmare).toBe('trimis');
  });

  it('o comunicare fără nicio intrare rămâne coloană, nu dispare', () => {
    const rezultat = acoperire([ana], []);
    expect(Object.keys(rezultat[0].celule)).toEqual(COMUNICARI_EDITIE.map((c) => c.cheie));
  });
});

/**
 * Rejucarea per mod.
 *
 * Cele patru motive pentru care retrimiterea era restrânsă la modul `admin`
 * rămân valide — rejucarea nu le contrazice, ci nu mai reia TEXTUL din jurnal.
 * Aici se păzește doar ce se poate decide din rândul de jurnal; verdictul final
 * (destinatar șters, dezabonat între timp) e al serverului, care vede starea de
 * acum.
 */
describe('ce se poate rejuca, și ce spune ecranul despre restul', () => {
  it('un eșec de confirmare devine rejucabil', () => {
    expect(motivNerejucabil(log({ mod: 'confirm' }))).toBeNull();
  });

  it('un eșec de promovare devine rejucabil', () => {
    expect(motivNerejucabil(log({ mod: 'promoted' }))).toBeNull();
  });

  it('o difuzare cu șablonul reținut devine rejucabilă', () => {
    expect(motivNerejucabil(log({ mod: 'broadcast', sablon: 'bulk_participant_reminder' }))).toBeNull();
  });

  it('o difuzare fără șablon reținut NU se rejoacă — nu se știe ce text a plecat', () => {
    // Orarul are două șabloane pentru aceeași audiență; ghicitul ar retrimite
    // tăcut alt text decât cel eșuat.
    const motiv = motivNerejucabil(log({ mod: 'broadcast', sablon: null }));
    expect(motiv).toMatch(/nu se poate ști ce text/);
  });

  it('`info` rămâne exclus, cu motivul afișat, nu ascuns', () => {
    const motiv = motivNerejucabil(log({ mod: 'info' }));
    expect(motiv).toMatch(/cerere nouă, nu o reparație/);
  });

  it('modul `admin` trimite la butonul de retrimitere în lot, nu la rejucare', () => {
    expect(motivNerejucabil(log({ mod: 'admin' }))).toMatch(/butonul de sus/);
  });

  it('rejucabilele și retrimisibilele nu se suprapun', () => {
    const ne = [
      log({ id: 'a', mod: 'admin' }),
      log({ id: 'b', mod: 'confirm' }),
      log({ id: 'c', mod: 'broadcast', sablon: 'bulk_participant_reminder' }),
      log({ id: 'd', mod: 'info' }),
    ];
    expect(emailuriRejucabile(ne).map((e) => e.id)).toEqual(['b', 'c']);
    expect(emailuriRetrimisibile(ne).map((e) => e.id)).toEqual(['a']);
  });

  it('contorul de nerezolvabile scade cu cele devenite rejucabile', () => {
    const ne = [
      log({ id: 'a', mod: 'admin' }),
      log({ id: 'b', mod: 'confirm' }),
      log({ id: 'c', mod: 'promoted' }),
      log({ id: 'd', mod: 'info' }),
    ];
    // Înainte: tot ce nu era `admin` era nerezolvabil — trei rânduri.
    const nerezolvabile = ne.length - emailuriRetrimisibile(ne).length - emailuriRejucabile(ne).length;
    expect(nerezolvabile).toBe(1);
  });

  it('o rejucare reușită schimbă ultima stare a cheii din eșuat în trimis', () => {
    // Rejucarea jurnalizează cu modul ORIGINAL, deci intră pe aceeași cheie
    // (adresă + subiect) și repară rândul, exact ca o retrimitere reușită.
    const intrari = [
      log({ id: 'nou', created_at: '2026-08-11T10:00:00Z', mod: 'confirm', status: 'trimis' }),
      log({ id: 'vechi', created_at: '2026-08-10T10:00:00Z', mod: 'confirm', status: 'esuat' }),
    ];
    expect(emailuriNelivrate(intrari)).toEqual([]);
  });
});
