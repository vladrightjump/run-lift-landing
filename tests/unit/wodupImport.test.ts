import { describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { transforma } from '../../scripts/wodup/transforma';
import { componentaWodup, miscareWodup, raspunsWodup } from '../support/builders/wodup';

const optiuni = { dataStart: '2026-09-07', saptamani: 12 };
describe('import WodUp (date sintetice)', () => {
  it('CLI-ul nu afișează credentialul nici dacă transportul îl include în eroare', async () => {
    const rezultat = await promisify(execFile)(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval',
      "globalThis.fetch = async () => { throw new Error('cookie-sintetic-secret'); }; await import('./scripts/wodup/extrage.ts');",
    ], { env: { ...process.env, WODUP_COOKIE: 'cookie-sintetic-secret' } }).then(
      ({ stdout, stderr }) => ({ cod: 0, output: stdout + stderr }),
      (err: { code: number; stdout: string; stderr: string }) => ({ cod: err.code, output: err.stdout + err.stderr }),
    );
    expect(rezultat.cod).toBe(1);
    expect(rezultat.output).not.toContain('cookie-sintetic-secret');
    expect(rezultat.output).toContain('Extragerea a eșuat');
  });

  it('respinge răspunsul cu identități de program diferite', () => {
    const raspuns = raspunsWodup();
    const altaZi = raspunsWodup([componentaWodup({ id: 'component-2' })], '2026-09-18').data.currentUser.activityTimeline[0];
    altaZi.subscribedWods[0].classType.id = 'alt-program-sintetic';
    raspuns.data.currentUser.activityTimeline.push(altaZi);
    expect(() => transforma(raspuns, optiuni)).toThrow('Răspunsul include mai multe programe; extrage separat programul dorit.');
  });

  it.each([
    { data: '2026-09-06', mesaj: 'Data de start nu corespunde zilelor importate.' },
    { data: '2026-11-30', mesaj: 'Există zile în afara duratei programului.' },
  ])('respinge ziua $data din afara duratei alese', ({ data, mesaj }) => {
    expect(() => transforma(raspunsWodup([componentaWodup()], data), optiuni)).toThrow(mesaj);
  });

  it('respinge o mișcare fără metadate chiar după un set valid', () => {
    const componenta = componentaWodup({ workout: {
      type: 'Strength', movementData: [miscareWodup()],
      details: { movements: [{ id: 101, reps: '5' }, { id: 202, reps: '5' }] },
    } });
    expect(() => transforma(raspunsWodup([componenta]), optiuni)).toThrow('Mișcare fără metadate: 202');
  });

  it('convertește ambele ținte și păstrează proveniența, notele și seturile', () => {
    const doc = transforma(raspunsWodup(), optiuni);
    expect(doc.zile).toHaveLength(1);
    expect(doc.zile[0]).toMatchObject({ saptamana: 2, zi: 3 });
    expect(doc.zile[0].blocuri[0]).toMatchObject({ instructiuni_inainte: 'Before', instructiuni_dupa: 'After', note_antrenor: 'Synthetic private note' });
    const sets = doc.zile[0].blocuri[0].seturi;
    expect(sets).toHaveLength(2);
    expect(sets[0]).toMatchObject({ incarcare: 22.5, tinte_feminine: { incarcare: 16 }, pauza_tip: 'fixa', pauza_sec: 30,
      provenienta: { load: '50', loadFemale: '35', loadUnit: 'lbs' } });
    expect(doc.miscari).toHaveLength(1);
  });

  it('convertește înălțimi și distanțe în unități metrice', () => {
    const component = componentaWodup({ workout: { type: 'Cardio', movementData: [miscareWodup()],
      details: { movements: [{ id: 101, height: '120', heightFemale: '108', heightUnit: 'inches', distance: '15', distanceUnit: 'feet' }] } } });
    const row = transforma(raspunsWodup([component]), optiuni).zile[0].blocuri[0].seturi[0];
    expect(row).toMatchObject({ inaltime_cm: 305, distanta_m: 4.5, tinte_feminine: { inaltime_cm: 274 } });
  });

  it('păstrează superseturile, ordinea exercițiilor și mișcările unice', () => {
    const a1 = componentaWodup({ prefix: 'A1', isAlternating: true });
    const a2 = componentaWodup({ id: 'component-2', prefix: 'A2', rowOrder: 1, isAlternating: false });
    const doc = transforma(raspunsWodup([a1, a2]), optiuni);
    expect(doc.zile[0].blocuri).toHaveLength(1);
    expect(doc.zile[0].blocuri[0].parametri).toMatchObject({ prefix: 'A', superset: true });
    expect(doc.zile[0].blocuri[0].seturi.map(s => s.exercitiu)).toEqual([1, 1, 2, 2]);
    expect(doc.miscari).toHaveLength(1);
  });

  it('preferă demonstrația antrenorului și păstrează textul Generic cu scor', () => {
    const m = miscareWodup('101', { currentUserMovementOverlays: [{ videosArray: [{ service: 'youtube', videoId: 'ZYXWVUTSRQP' }] }] });
    const c = componentaWodup({ workout: { type: 'Generic', details: JSON.stringify({ description: 'Synthetic open workout', scoreBy: 'time_asc', movements: [{ id: 101 }] }), movementData: [m] } });
    const doc = transforma(raspunsWodup([c]), optiuni);
    expect(doc.miscari[0].youtube_id).toBe('ZYXWVUTSRQP');
    expect(doc.zile[0].blocuri[0]).toMatchObject({ tip: 'generic', text: 'Synthetic open workout', parametri: { criteriu_scor: 'time_asc' } });
  });

  it('păstrează țintele X, procentele și schemele EMOM', () => {
    const c = componentaWodup({ workout: { type: 'Emom', movementData: [miscareWodup()], details: {
      movements: [{ id: 101, reps: '15-20', load: '70', loadUnit: '%1rm', calories: 'X' }],
      interval: 60, duration: 1200, blocks: [[0]],
    } } });
    const b = transforma(raspunsWodup([c]), optiuni).zile[0].blocuri[0];
    expect(b.parametri).toMatchObject({ interval_sec: 60, durata_sec: 1200, blocks: [[0]] });
    expect(b.seturi[0]).toMatchObject({ repetari: '15-20', incarcare: 70, unitate_incarcare: '%1rm', tinte_text: { calorii: 'X' } });
  });

  it('păstrează instrucțiunile oficiale și metadatele tuturor componentelor', () => {
    const first = componentaWodup();
    const c = { ...first, workout: { ...first.workout, officialInstructions: 'Synthetic official instructions' } };
    const b = transforma(raspunsWodup([c]), optiuni).zile[0].blocuri[0];
    expect(b.instructiuni_inainte).toBe('Before\n\nSynthetic official instructions');
    expect(b.parametri.detalii_componente).toMatchObject([{
      id: 'component-1', notesForCoaches: 'Synthetic private note',
      workout: { officialInstructions: 'Synthetic official instructions', type: 'Strength' },
    }]);
  });

  it('nu înlocuiește un overlay cu un video generic la o apariție ulterioară', () => {
    const first = componentaWodup();
    const coach = { ...first, workout: { ...first.workout, movementData: [miscareWodup('101', {
      currentUserMovementOverlays: [{ videosArray: [{ service: 'youtube', videoId: 'ZYXWVUTSRQP' }] }],
    })] } };
    const generic = componentaWodup({ id: 'component-2', prefix: 'B', rowOrder: 1 });
    expect(transforma(raspunsWodup([coach, generic]), optiuni).miscari[0].youtube_id).toBe('ZYXWVUTSRQP');
  });
});
