import { idYouTube } from '../../src/shared/lib/youtube';
import { feetInMetri, inchInCm, livreInKg } from '../../src/features/programare/lib/unitati';

type Obiect = Record<string, unknown>;
const obiect = (v: unknown): Obiect => v && typeof v === 'object' && !Array.isArray(v) ? v as Obiect : {};
const lista = (v: unknown): Obiect[] => Array.isArray(v) ? v.map(obiect) : [];
const text = (v: unknown) => v == null ? '' : String(v);
const numar = (v: unknown): number | null => v == null || text(v).trim() === '' || !Number.isFinite(Number(v)) ? null : Number(v);
const rotunjeste = (n: number, pas: number) => Math.round(n / pas) * pas;
const TIPURI: Record<string, string> = { Strength: 'strength', Cardio: 'cardio', CardioIntervals: 'cardio_intervals', Emom: 'emom', ForTime: 'for_time', Amrap: 'amrap', Generic: 'generic', WarmUp: 'warm_up' };
const ODIHNA: Record<string, string> = { none: 'fara', as_needed: 'dupa_nevoie', fixed: 'fixa', every: 'interval', interval: 'interval', after_set: 'dupa_timp', time_based: 'dupa_timp' };
const TINTE = { reps: 'repetari', load: 'incarcare', distance: 'distanta_m', duration: 'durata_sec', calories: 'calorii', height: 'inaltime_cm', power: 'putere_w', tempo: 'tempo' } as const;

const converteste = (valoare: unknown, cheie: string, unitate: string): number | null => {
  const n = numar(valoare);
  if (n === null) return null;
  if (cheie === 'load' && unitate === 'lbs') return rotunjeste(livreInKg(n), 0.5);
  if (cheie === 'distance') {
    if (unitate === 'feet') return rotunjeste(feetInMetri(n), 0.5);
    if (unitate === 'km') return n * 1000;
    if (unitate === 'miles') return rotunjeste(n * 1609.344, 0.5);
  }
  if (cheie === 'height' && unitate === 'inches') return Math.round(inchInCm(n));
  if (cheie === 'duration' && unitate === 'minutes') return n * 60;
  return n;
};

const tinte = (m: Obiect, feminin = false) => {
  const valori: Record<string, string | number | null> = {};
  const neNumerice: Record<string, string> = {};
  for (const [cheie, destinatie] of Object.entries(TINTE)) {
    const valoare = m[feminin ? `${cheie}Female` : cheie];
    if (valoare == null || valoare === '') continue;
    if (cheie === 'reps' || cheie === 'tempo') valori[destinatie] = text(valoare);
    else {
      valori[destinatie] = converteste(valoare, cheie, text(m[`${cheie}Unit`]));
      if (valori[destinatie] === null) neNumerice[destinatie] = text(valoare);
    }
  }
  return { valori, neNumerice };
};

const video = (m: Obiect) => {
  const videos = [...lista(m.currentUserMovementOverlays).flatMap(o => lista(o.videosArray)), ...lista(m.videosArray)];
  for (const v of videos) {
    if (!/youtube/i.test(text(v.service))) continue;
    const id = idYouTube(text(v.videoId));
    if (id) return id;
  }
  return null;
};

export type SetImportat = {
  id_extern: string; exercitiu: number; ordine: number; miscare_id_extern: string;
  tinte_feminine: Record<string, string | number | null>; tinte_text: Record<string, string>;
  provenienta: Obiect; pauza_tip: string; pauza_sec: number | null; note: string;
  repetari?: string | number | null; incarcare?: string | number | null;
  unitate_incarcare: string; distanta_m?: string | number | null; durata_sec?: string | number | null;
  calorii?: string | number | null; inaltime_cm?: string | number | null; tempo?: string | number | null;
  putere_w?: string | number | null;
};
export type BlocImportat = {
  id_extern: string; ordine: number; tip: string; nume: string; ascuns: boolean;
  instructiuni_inainte: string; instructiuni_dupa: string; note_sportiv: string;
  note_antrenor: string; text: string; parametri: Obiect; seturi: SetImportat[];
};
export type DocumentImport = {
  versiune: 1;
  program: { id_extern: string; nume: string; descriere: string; saptamani: number; zile_pe_saptamana: number; sursa: string };
  miscari: { id_extern: string; nume: string; categorie: string; masuratori: string[]; youtube_id: string | null; sursa: string }[];
  zile: { id_extern: string; saptamana: number; zi: number; titlu: string; blocuri: BlocImportat[] }[];
};

/** Pure conversion; callers persist the private document only under ignored imports/. */
export const transforma = (raspuns: unknown, optiuni: { dataStart: string; saptamani?: number; idExtern?: string; nume?: string; descriere?: string }): DocumentImport => {
  let root = raspuns;
  while (typeof root === 'string') root = JSON.parse(root);
  const timeline = lista(obiect(obiect(obiect(root).data).currentUser).activityTimeline);
  const wods = timeline.flatMap(d => lista(d.subscribedWods));
  if (!wods.length) throw new Error('Nu sunt antrenamente în răspunsul WodUp.');
  const primaSursa = obiect(wods[0].fixedAssignmentSourceClassType);
  const primaClasa = obiect(wods[0].classType);
  const idProgram = text(primaSursa.id || primaClasa.id || primaSursa.name || primaClasa.name);
  const miscari = new Map<string, DocumentImport['miscari'][number]>();
  const miscariCuOverlay = new Set<string>();
  const zile: DocumentImport['zile'] = [];
  for (const w of wods) {
    const sursa = obiect(w.fixedAssignmentSourceClassType);
    const clasa = obiect(w.classType);
    const id = text(sursa.id || clasa.id || sursa.name || clasa.name);
    if (id !== idProgram) throw new Error('Răspunsul include mai multe programe; extrage separat programul dorit.');
    const delta = (Date.parse(`${text(w.occursOn).slice(0, 10)}T00:00:00Z`) - Date.parse(`${optiuni.dataStart}T00:00:00Z`)) / 86400000;
    if (!Number.isInteger(delta) || delta < 0) throw new Error('Data de start nu corespunde zilelor importate.');
    const blocuri: BlocImportat[] = [];
    const componente = lista(w.wodComponents).sort((a,b) => Number(a.rowOrder ?? 0) - Number(b.rowOrder ?? 0));
    for (const [index, c] of componente.entries()) {
      const workout = obiect(c.workout);
      const d = typeof workout.details === 'string' ? obiect(JSON.parse(workout.details)) : obiect(workout.details);
      const tip = TIPURI[text(workout.type || d.type)];
      if (!tip) throw new Error(`Tip de bloc necunoscut: ${text(workout.type || d.type)}`);
      for (const m of [...lista(workout.movementData), ...lista(c.additionalMovements)]) {
        const mid = text(m.id);
        const existent = miscari.get(mid);
        const overlay = video({ ...m, videosArray: [] });
        const youtubeId = overlay || (miscariCuOverlay.has(mid) ? existent?.youtube_id : null) || video(m) || existent?.youtube_id || null;
        if (overlay) miscariCuOverlay.add(mid);
        miscari.set(mid, { id_extern: mid, nume: text(m.name), categorie: text(m.category),
          masuratori: Object.keys(TINTE).filter(k => m[`has${k === 'reps' ? 'Reps' : k[0].toUpperCase()+k.slice(1)}`] === true).map(k => TINTE[k as keyof typeof TINTE]),
          youtube_id: youtubeId, sursa: 'TTT / WodUp' });
      }
      const prefix = text(c.prefix) || (tip === 'warm_up' ? 'Încălzire' : String.fromCharCode(65 + index));
      const grup = prefix.replace(/\d+$/, '');
      const anterior = blocuri.at(-1);
      // WodUp marks every link except the LAST component of an alternating group.
      const seUneste = Boolean(componente[index - 1]?.isAlternating && anterior?.parametri.prefix === grup);
      const exercitiuInitial = seUneste ? Math.max(...anterior!.seturi.map(s => s.exercitiu), 0) : 0;
      const pozitii = new Map<string, number>();
      const repetitii = new Map<string, number>();
      const rest = obiect(d.rest);
      const instructiuniInainte = [text(c.preInstructions), text(workout.officialInstructions)].filter(Boolean).join('\n\n');
      const detaliiComponenta = {
        id: c.id, prefix: c.prefix, name: c.name, notes: c.notes, notesForCoaches: c.notesForCoaches,
        preInstructions: c.preInstructions, postInstructions: c.postInstructions,
        hidden: c.hidden, isAlternating: c.isAlternating, rowOrder: c.rowOrder,
        workout: { type: workout.type, name: workout.name, details: d, officialInstructions: workout.officialInstructions },
      };
      const seturi: SetImportat[] = lista(d.movements).map((m, si) => {
        const mid = text(m.id);
        if (!miscari.has(mid)) throw new Error(`Mișcare fără metadate: ${mid}`);
        if (!pozitii.has(mid)) pozitii.set(mid, exercitiuInitial + pozitii.size + 1);
        repetitii.set(mid, (repetitii.get(mid) ?? 0) + 1);
        const masculin = tinte(m);
        const feminin = tinte(m, true);
        return { id_extern: `${text(c.id)}:${si}`, exercitiu: pozitii.get(mid)!, ordine: repetitii.get(mid)!, miscare_id_extern: mid,
          ...masculin.valori, unitate_incarcare: m.loadUnit === '%1rm' ? '%1rm' : 'kg',
          tinte_feminine: feminin.valori,
          tinte_text: { ...masculin.neNumerice, ...Object.fromEntries(Object.entries(feminin.neNumerice).map(([k,v]) => [`${k}_feminin`,v])) },
          provenienta: { ...m, pauza_originala: rest, componenta: { id: c.id, prefix: c.prefix, tip, notes: c.notes, notesForCoaches: c.notesForCoaches, preInstructions: instructiuniInainte, postInstructions: c.postInstructions } },
          pauza_tip: ODIHNA[text(rest.type)] ?? 'fara', pauza_sec: numar(rest.duration), note: text(c.notes) };
      });
      const parametri: Obiect = { prefix: grup, superset: Boolean(c.isAlternating), interval_sec: numar(d.interval), durata_sec: numar(d.duration), criteriu_scor: d.scoreBy ?? null,
        ...Object.fromEntries(Object.entries(d).filter(([k]) => !['movements','description','name','type','rest'].includes(k))),
        componente: [text(c.id)], detalii_componente: [detaliiComponenta], pauza_tip: ODIHNA[text(rest.type)] ?? 'fara', pauza_sec: numar(rest.duration) };
      if (seUneste) {
        anterior!.seturi.push(...seturi);
        anterior!.parametri.componente = [...anterior!.parametri.componente as string[], text(c.id)];
        anterior!.parametri.detalii_componente = [...anterior!.parametri.detalii_componente as unknown[], detaliiComponenta];
      } else blocuri.push({ id_extern: text(c.id), ordine: index + 1, tip, nume: text(c.name || workout.name || d.name), ascuns: Boolean(c.hidden),
        instructiuni_inainte: instructiuniInainte, instructiuni_dupa: text(c.postInstructions), note_sportiv: text(c.notes), note_antrenor: text(c.notesForCoaches),
        text: tip === 'generic' || tip === 'warm_up' ? text(d.description || workout.description) : '', parametri, seturi });
    }
    zile.push({ id_extern: text(w.id), saptamana: Math.floor(delta / 7) + 1, zi: delta % 7 + 1, titlu: text(w.name), blocuri });
  }
  const saptamani = optiuni.saptamani ?? Math.max(...zile.map(z => z.saptamana));
  if (zile.some(z => z.saptamana > saptamani)) throw new Error('Există zile în afara duratei programului.');
  return { versiune: 1, program: { id_extern: optiuni.idExtern ?? `wodup:${idProgram}`, nume: optiuni.nume ?? text(primaSursa.name || primaClasa.name), descriere: optiuni.descriere ?? '', saptamani,
    zile_pe_saptamana: new Set(zile.map(z => z.zi)).size, sursa: 'TTT / WodUp' }, miscari: [...miscari.values()], zile: zile.sort((a,b) => a.saptamana-b.saptamana || a.zi-b.zi) };
};
