import { describe, expect, it } from 'vitest';
import { prescriptieBloc, textPauza, type BlocPrescriptie, type SetPrescriptie } from './prescriptie';

const set = (exercitiu: number, ordine: number, schimbari: Partial<SetPrescriptie> = {}): SetPrescriptie => ({
  id: `set-${exercitiu}-${ordine}`,
  exercitiu,
  ordine,
  miscare: { id: `miscare-${exercitiu}`, nume: exercitiu === 1 ? 'Barbell Bench Press' : 'Ramat' },
  repetari: '2',
  ...schimbari,
});

const bloc = (schimbari: Partial<BlocPrescriptie> = {}): BlocPrescriptie => ({
  ordine: 1,
  tip: 'strength',
  seturi: [set(1, 1), set(2, 2), set(1, 3), set(2, 4), set(1, 5), set(2, 6)],
  ...schimbari,
});

describe('prescripția sportivului din structura blocului', () => {
  it('scrie supersetul strength 3 × 2, compact și complet, cu etichetele A1 / A2', () => {
    const rezultat = prescriptieBloc(bloc(), { gen: 'masculin' });
    expect(rezultat.antet).toBe('3 seturi alternante din:');
    expect(rezultat.compact.map(r => [r.eticheta, r.text])).toEqual([
      ['A1', 'Barbell Bench Press 3 x 2'],
      ['A2', 'Ramat 3 x 2'],
    ]);
    expect(rezultat.complet.map(r => r.text)).toEqual(['2 Barbell Bench Presses', '2 Ramat']);
    expect(rezultat.complet[0].seturi).toBe(3);
  });

  it('grupează seturile egale și păstrează țintele diferite, ordinea și instrucțiunile', () => {
    const rezultat = prescriptieBloc(bloc({
      ordine: 2,
      seturi: [set(1, 3, { repetari: 'max', note: 'Mișcare controlată' }), set(1, 1, { repetari: '15-20' }), set(1, 2, { repetari: '15-20' })],
      instructiuni_inainte: 'Înainte', instructiuni_dupa: 'După', note_sportiv: 'Indicație',
    }), { gen: 'masculin' });
    expect(rezultat.compact.map(r => r.text)).toEqual(['Barbell Bench Press 2 x 15-20 + 1 x max']);
    expect(rezultat.complet.map(r => [r.eticheta, r.text, r.seturi, r.note])).toEqual([
      ['B', '15-20 Barbell Bench Presses', 2, null],
      ['B', 'max Barbell Bench Presses', 1, 'Mișcare controlată'],
    ]);
    expect(rezultat).toMatchObject({ instructiuniInainte: 'Înainte', instructiuniDupa: 'După', noteSportiv: 'Indicație' });
  });

  it('alege ținta feminină pe fiecare câmp și păstrează câmpurile comune', () => {
    const intervale = bloc({ tip: 'cardio_intervals', seturi: [set(1, 1, {
      miscare: { id: 'ski', nume: 'SkiErg' }, repetari: null, calorii: 18, pauza_tip: 'fixa', pauza_sec: 30,
      tinte_feminine: { calorii: 14 },
    })] });
    expect(prescriptieBloc(intervale, { gen: 'masculin' }).complet[0].text).toBe('SkiErg 18 calorii');
    expect(prescriptieBloc(intervale, { gen: 'feminin' }).complet[0]).toMatchObject({ text: 'SkiErg 14 calorii', pauza: 'Pauză 30 de secunde' });
  });

  it('include încărcarea %1RM cu și fără un estimat anterior', () => {
    const procent = bloc({ seturi: [set(1, 1, { incarcare: 70, unitate_incarcare: '%1rm' })] });
    expect(prescriptieBloc(procent, { gen: 'masculin', unuRm: { 'miscare-1': 100 } }).complet[0].text).toBe('2 Barbell Bench Presses · 70 % 1RM (≈ 70 kg)');
    expect(prescriptieBloc(procent, { gen: 'masculin' }).complet[0].text).toBe('2 Barbell Bench Presses · 70 % 1RM');
  });

  it('păstrează toate câmpurile măsurabile, inclusiv tempo, înălțime și putere', () => {
    const rezultat = prescriptieBloc(bloc({ seturi: [set(1, 1, {
      repetari: 'X', incarcare: 22.5, unitate_incarcare: 'kg', distanta_m: 400, durata_sec: 90,
      calorii: 8, inaltime_cm: 60, putere_w: 250, tempo: '3010',
    })] }), { gen: 'masculin' });
    expect(rezultat.complet[0].text).toBe('X Barbell Bench Presses · 22,5 kg · 400 m · 1 minut și 30 de secunde · 8 calorii · înălțime 60 cm · 250 W · tempo 3010');
  });

  it.each([
    ['cardio', {}, 'Cardio'],
    ['cardio_intervals', {}, '3 intervale din:'],
    ['emom', { interval_sec: 60, durata_sec: 1200 }, 'La fiecare minut, 20 de minute'],
    ['for_time', { runde: 3 }, '3 runde contra cronometru:'],
    ['amrap', { durata_sec: 900 }, 'Cât mai multe runde în 15 minute'],
    ['generic', { criteriu_scor: 'calorii' }, 'Antrenament'],
    ['warm_up', {}, 'Încălzire'],
  ] as const)('afișează tipul %s', (tip, parametri, antet) => {
    const rezultat = prescriptieBloc(bloc({ tip, parametri, text: 'Text liber', seturi: [set(1, 1), set(1, 2), set(1, 3)] }), { gen: 'masculin' });
    expect(rezultat.antet).toBe(antet);
    expect(rezultat.text).toBe(tip === 'generic' || tip === 'warm_up' ? 'Text liber' : null);
    expect(rezultat.criteriuScor).toBe(tip === 'generic' ? 'calorii' : null);
  });

  it('folosește pauza blocului ca valoare implicită, cu suprascriere pe set', () => {
    const rezultat = prescriptieBloc(bloc({
      parametri: { pauza_tip: 'dupa_nevoie' },
      seturi: [set(1, 1), set(1, 2, { pauza_tip: 'fara' })],
    }), { gen: 'masculin' });
    expect(rezultat.complet.map(r => r.pauza)).toEqual(['Pauză după nevoie', 'Fără pauză']);
  });

  it('păstrează eticheta sursei chiar dacă încălzirea ocupă primul bloc', () => {
    const rezultat = prescriptieBloc(bloc({ ordine: 2, parametri: { prefix: 'A' } }), { gen: 'masculin' });
    expect(rezultat.eticheta).toBe('A');
    expect(rezultat.compact.map(r => r.eticheta)).toEqual(['A1', 'A2']);
  });

  it('afișează țintele textuale importate cu unitățile și varianta feminină', () => {
    const textuale = bloc({ seturi: [set(1, 1, {
      repetari: null,
      tinte_text: { repetari: 'max', incarcare: 'X', calorii: 'X', calorii_feminin: 'max', distanta_m: 'X', durata_sec: 'X', inaltime_cm: 'X', putere_w: 'X' },
    })] });
    expect(prescriptieBloc(textuale, { gen: 'masculin' }).complet[0].text).toBe('max Barbell Bench Presses · X kg · X m · X secunde · X calorii · înălțime X cm · X W');
    expect(prescriptieBloc(textuale, { gen: 'feminin' }).complet[0].text).toContain('max calorii');
  });

  it('ținta feminină numerică are prioritate față de ținta masculină textuală', () => {
    const rezultat = prescriptieBloc(bloc({ seturi: [set(1, 1, {
      repetari: null, tinte_text: { calorii: 'X' }, tinte_feminine: { calorii: 14 },
    })] }), { gen: 'feminin' });
    expect(rezultat.complet[0].text).toBe('Barbell Bench Press 14 calorii');
  });

  it('păstrează instrucțiunile componentei la exercițiul din supersetul importat', () => {
    const rezultat = prescriptieBloc(bloc({ seturi: [set(1, 1, {
      provenienta: { componenta: { preInstructions: 'Înainte de set', postInstructions: 'După set', notesForCoaches: 'Doar antrenor', tip: 'strength' } },
    })] }), { gen: 'masculin' });
    expect(rezultat.complet[0]).toMatchObject({ instructiuniInainte: 'Înainte de set', instructiuniDupa: 'După set' });
    expect(JSON.stringify(rezultat)).not.toContain('Doar antrenor');
  });
});

describe('toate formele de pauză', () => {
  it.each([
    [{ pauza_tip: 'fara' }, 'Fără pauză'],
    [{ pauza_tip: 'dupa_nevoie' }, 'Pauză după nevoie'],
    [{ pauza_tip: 'fixa', pauza_sec: 30 }, 'Pauză 30 de secunde'],
    [{ pauza_tip: 'interval', pauza_sec: 90 }, 'Un set la fiecare 1 minut și 30 de secunde'],
    [{ pauza_tip: 'dupa_timp', pauza_raport: 1 }, 'Pauză egală cu timpul setului'],
    [{ pauza_tip: 'dupa_timp', pauza_raport: 2 }, 'Pauză de 2 ori timpul setului'],
    [{}, null],
  ] as const)('transformă %j în text', (pauza, text) => {
    expect(textPauza(pauza)).toBe(text);
  });
});
