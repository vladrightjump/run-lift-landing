import { describe, it, expect } from 'vitest';
import { documentProgram } from '../../../../tests/support/builders/programare';
import { citesteDocumentImport } from './importProgram';

describe('documentul JSON de import', () => {
  it('acceptă documentul complet sintetic fără a elimina informații', () => {
    const document = documentProgram();
    expect(citesteDocumentImport(JSON.stringify(document))).toEqual(document);
  });

  it.each([
    ['JSON stricat', '{'],
    ['versiune necunoscută', JSON.stringify({ ...documentProgram(), versiune: 2 })],
    ['document gol', '{}'],
    ['zile lipsă', JSON.stringify({ ...documentProgram(), zile: null })],
    ['program fără nume', JSON.stringify({ ...documentProgram(), program: { ...documentProgram().program, nume: '' } })],
    ['video invalid', JSON.stringify({ ...documentProgram(), miscari: [{ ...documentProgram().miscari[0], youtube_id: '<script>' }] })],
    ['măsurătoare invalidă', JSON.stringify({ ...documentProgram(), miscari: [{ ...documentProgram().miscari[0], masuratori: [null] }] })],
  ])('respinge %s', (_nume, continut) => {
    expect(() => citesteDocumentImport(continut)).toThrow('Fișier de import invalid');
  });

  it('respinge setul care referă o mișcare absentă', () => {
    const d = documentProgram(); d.zile[0].blocuri[0].seturi[0].miscare_id_extern = 'absent';
    expect(() => citesteDocumentImport(JSON.stringify(d))).toThrow('Fișier de import invalid');
  });

  it('respinge ținta feminină cu formă invalidă', () => {
    const d = documentProgram();
    const continut = JSON.stringify(d).replace('"tinte_feminine":{"incarcare":15}', '"tinte_feminine":{"incarcare":"greșit"}');
    expect(() => citesteDocumentImport(continut)).toThrow('Fișier de import invalid');
  });

  it('respinge ziua în afara programului și identitățile duplicate', () => {
    const d = documentProgram(); d.zile[0].saptamana = 3;
    expect(() => citesteDocumentImport(JSON.stringify(d))).toThrow('Fișier de import invalid');
    d.zile[0].saptamana = 1; d.zile.push(d.zile[0]);
    expect(() => citesteDocumentImport(JSON.stringify(d))).toThrow('Fișier de import invalid');
  });
});
