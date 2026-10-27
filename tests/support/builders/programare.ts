import type { Atribuire, Bloc, Program, ProfilSportiv, ZiProgram } from '../../../src/features/programare/data/tipuri';

/** Date sintetice; niciun conținut al programului importat. */
export const profilSportiv = (extra: Partial<ProfilSportiv> = {}): ProfilSportiv => ({
  id: 1, nume: 'Sportiv demo', gen: 'masculin', unitate_greutate: 'kg', unitate_distanta: 'm', telegram_id: null, ...extra,
});
export const atribuire = (extra: Partial<Atribuire> = {}): Atribuire => ({
  id: 'atribuire-1', program_id: 'program-1', sportiv_id: 1, sportiv_nume: 'Sportiv demo', sportiv_gen: 'masculin', data_start: '2026-10-21', data_sfarsit: '2026-10-28', ...extra,
});
export const blocProgram = (extra: Partial<Bloc> = {}): Bloc => ({
  id: 'bloc-1', id_extern: 'bloc-demo', ordine: 1, tip: 'strength', nume: 'Forță demo', ascuns: false,
  instructiuni_inainte: '', instructiuni_dupa: '', note_sportiv: '', note_antrenor: '', text: '', parametri: { prefix: 'A' },
  seturi: [{ id: 'set-1', id_extern: 'set-demo', exercitiu: 1, ordine: 1, repetari: '5', incarcare: 20,
    unitate_incarcare: 'kg', miscare: { id: 'miscare-1', id_extern: 'miscare-demo', nume: 'Genuflexiune demo', categorie: 'Forță', masuratori: ['repetari', 'incarcare'], youtube_id: 'abcdefghijk', sursa: 'Demo' },
    tinte_feminine: { incarcare: 15 }, pauza_tip: 'fixa', pauza_sec: 30 }], ...extra,
});
export const ziProgram = (extra: Partial<ZiProgram> = {}): ZiProgram => ({
  id: 'zi-1', id_extern: 'zi-demo', saptamana: 1, zi: 1, titlu: 'Antrenament demo', blocuri: [blocProgram()], ...extra,
});
export const program = (extra: Partial<Program> = {}): Program => ({
  id: 'program-1', id_extern: 'program-demo', nume: 'Program sintetic', descriere: 'Descriere pentru test.',
  saptamani: 2, zile_pe_saptamana: 2, sursa: 'TTT / WodUp', publicat: true, atribuiri: [], ...extra,
});
export const documentProgram = () => ({
  versiune: 1 as const,
  program: { id_extern: 'program-demo', nume: 'Program sintetic', descriere: 'Descriere pentru test.', saptamani: 2, zile_pe_saptamana: 2, sursa: 'TTT / WodUp' },
  miscari: [{ id_extern: 'miscare-demo', nume: 'Genuflexiune demo', categorie: 'Forță', masuratori: ['repetari', 'incarcare'], youtube_id: 'abcdefghijk', sursa: 'Demo' }],
  zile: [{ id_extern: 'zi-demo', saptamana: 1, zi: 1, titlu: 'Antrenament demo', blocuri: [{
    id_extern: 'bloc-demo', ordine: 1, tip: 'strength', nume: 'Forță demo', ascuns: false,
    instructiuni_inainte: '', instructiuni_dupa: '', note_sportiv: '', note_antrenor: '', text: '', parametri: { prefix: 'A' },
    seturi: [{ id_extern: 'set-demo', exercitiu: 1, ordine: 1, miscare_id_extern: 'miscare-demo', repetari: '5', incarcare: 20, unitate_incarcare: 'kg',
      tinte_feminine: { incarcare: 15 }, tinte_text: {}, provenienta: {}, pauza_tip: 'fixa', pauza_sec: 30, note: '' }],
  }] }],
});
