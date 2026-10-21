import { distanta, durata, numar } from './unitati';
import { kgSugerate } from './unuRm';

export type TipBloc = 'strength' | 'cardio' | 'cardio_intervals' | 'emom' | 'for_time' | 'amrap' | 'generic' | 'warm_up';
export type TipPauza = 'fara' | 'dupa_nevoie' | 'fixa' | 'interval' | 'dupa_timp';

export interface Pauza {
  pauza_tip?: TipPauza | null;
  pauza_sec?: number | null;
  pauza_raport?: number | null;
}

export interface TintePrescriptie {
  repetari?: string | null;
  incarcare?: number | null;
  unitate_incarcare?: 'kg' | '%1rm' | null;
  distanta_m?: number | null;
  durata_sec?: number | null;
  calorii?: number | null;
  inaltime_cm?: number | null;
  putere_w?: number | null;
  tempo?: string | null;
}

/** Forma minimă necesară afișării; nu depinde de clientul bazei de date. */
export interface SetPrescriptie extends TintePrescriptie, Pauza {
  id?: string;
  exercitiu: number;
  ordine: number;
  miscare: { id: string; nume: string };
  tinte_feminine?: TintePrescriptie | null;
  tinte_text?: Readonly<Record<string, string>> | null;
  provenienta?: {
    componenta?: {
      preInstructions?: string | null;
      postInstructions?: string | null;
      notesForCoaches?: string | null;
      tip?: string;
    };
  } | null;
  note?: string | null;
}

export interface ParametriBloc extends Pauza {
  prefix?: string | null;
  interval_sec?: number | null;
  durata_sec?: number | null;
  runde?: number | null;
  criteriu_scor?: string | null;
}

export interface BlocPrescriptie {
  ordine: number;
  tip: TipBloc;
  nume?: string | null;
  instructiuni_inainte?: string | null;
  instructiuni_dupa?: string | null;
  note_sportiv?: string | null;
  text?: string | null;
  parametri?: ParametriBloc | null;
  seturi: readonly SetPrescriptie[];
}

export interface OptiuniPrescriptie {
  gen: 'masculin' | 'feminin';
  /** Cel mai mare estimat al sportivului, indexat după id-ul mișcării. */
  unuRm?: Readonly<Record<string, number | null>>;
}

export interface RandPrescriptie {
  eticheta: string;
  exercitiu: number;
  miscareId: string;
  text: string;
  seturi: number;
  iduriSet: string[];
  pauza: string | null;
  note: string | null;
  instructiuniInainte: string | null;
  instructiuniDupa: string | null;
}

export interface PrescriptieBloc {
  eticheta: string;
  nume: string | null;
  antet: string;
  compact: RandPrescriptie[];
  complet: RandPrescriptie[];
  instructiuniInainte: string | null;
  instructiuniDupa: string | null;
  noteSportiv: string | null;
  text: string | null;
  criteriuScor: string | null;
}

/** Pauza descrie prescripția; nu pornește un cronometru. */
export const textPauza = (pauza: Pauza): string | null => {
  switch (pauza.pauza_tip) {
    case 'fara': return 'Fără pauză';
    case 'dupa_nevoie': return 'Pauză după nevoie';
    case 'fixa': return pauza.pauza_sec == null ? null : `Pauză ${durata(pauza.pauza_sec)}`;
    case 'interval': return pauza.pauza_sec == null ? null : `Un set la fiecare ${durata(pauza.pauza_sec)}`;
    case 'dupa_timp': return (pauza.pauza_raport ?? 1) === 1
      ? 'Pauză egală cu timpul setului'
      : `Pauză de ${numar(pauza.pauza_raport!)} ori timpul setului`;
    default: return null;
  }
};

const litera = (ordine: number): string => {
  let rezultat = '';
  for (let n = ordine; n > 0; n = Math.floor((n - 1) / 26)) {
    rezultat = String.fromCharCode(65 + (n - 1) % 26) + rezultat;
  }
  return rezultat;
};

interface TintaSportiv extends TintePrescriptie {
  text: Partial<Record<string, string>>;
}

const tinteSportiv = (set: SetPrescriptie, gen: OptiuniPrescriptie['gen']): TintaSportiv => {
  const text = Object.fromEntries(Object.entries(set.tinte_text ?? {}).filter(([cheie]) => !cheie.endsWith('_feminin')));
  if (gen !== 'feminin') return { ...set, text };
  const feminin = Object.fromEntries(Object.entries(set.tinte_feminine ?? {}).filter(([, v]) => v != null));
  for (const cheie of Object.keys(feminin)) delete text[cheie];
  for (const [cheie, valoare] of Object.entries(set.tinte_text ?? {})) {
    if (cheie.endsWith('_feminin')) text[cheie.replace(/_feminin$/, '')] = valoare;
  }
  return { ...set, ...feminin, text };
};

const afisareValoare = (valoare: number | string): string => typeof valoare === 'number' ? numar(valoare) : valoare;

const detaliiTinta = (tinta: TintaSportiv, unuRm: number | null | undefined): string[] => {
  const parti: string[] = [];
  const incarcare = tinta.text.incarcare ?? tinta.incarcare;
  const distantaM = tinta.text.distanta_m ?? tinta.distanta_m;
  const durataSec = tinta.text.durata_sec ?? tinta.durata_sec;
  const calorii = tinta.text.calorii ?? tinta.calorii;
  const inaltimeCm = tinta.text.inaltime_cm ?? tinta.inaltime_cm;
  const putereW = tinta.text.putere_w ?? tinta.putere_w;
  const tempo = tinta.text.tempo ?? tinta.tempo;
  if (incarcare != null) {
    if (tinta.unitate_incarcare === '%1rm') {
      const kg = typeof incarcare === 'number' ? kgSugerate(incarcare, unuRm) : null;
      parti.push(`${afisareValoare(incarcare)} % 1RM${kg === null ? '' : ` (≈ ${numar(kg)} kg)`}`);
    } else parti.push(`${afisareValoare(incarcare)} kg`);
  }
  if (distantaM != null) parti.push(typeof distantaM === 'number' ? distanta(distantaM) : `${distantaM} m`);
  if (durataSec != null) parti.push(typeof durataSec === 'number' ? durata(durataSec) : `${durataSec} secunde`);
  if (calorii != null) parti.push(`${afisareValoare(calorii)} ${calorii === 1 ? 'calorie' : 'calorii'}`);
  if (inaltimeCm != null) parti.push(`înălțime ${afisareValoare(inaltimeCm)} cm`);
  if (putereW != null) parti.push(`${afisareValoare(putereW)} W`);
  if (tempo) parti.push(`tempo ${tempo}`);
  return parti;
};

const numeCuRepetari = (nume: string, repetari: string): string => {
  // Numele mișcării rămâne neschimbat în lista compactă; „Press” are forma
  // „Presses” când este precedat de repetări în prescripția completă WodUp.
  const numeComplet = repetari === '1' ? nume : nume.replace(/Press$/i, '$&es');
  return `${repetari} ${numeComplet}`;
};

const antetBloc = (bloc: BlocPrescriptie, seturi: number, superset: boolean): string => {
  const p = bloc.parametri ?? {};
  switch (bloc.tip) {
    case 'strength': return `${seturi} ${seturi === 1 ? 'set' : 'seturi'}${superset ? ' alternante' : ''} din:`;
    case 'cardio': return 'Cardio';
    case 'cardio_intervals': return `${seturi} ${seturi === 1 ? 'interval' : 'intervale'} din:`;
    case 'emom': return `${(p.interval_sec ?? 60) === 60 ? 'La fiecare minut' : `La fiecare ${durata(p.interval_sec!)}`}${p.durata_sec == null ? '' : `, ${durata(p.durata_sec)}`}`;
    case 'for_time': return p.runde == null ? 'Contra cronometru' : `${p.runde} ${p.runde === 1 ? 'rundă' : 'runde'} contra cronometru:`;
    case 'amrap': return `Cât mai multe runde${p.durata_sec == null ? '' : ` în ${durata(p.durata_sec)}`}`;
    case 'generic': return bloc.nume || 'Antrenament';
    case 'warm_up': return 'Încălzire';
  }
};

/**
 * Generează ambele forme din aceleași seturi. Ordinea și datele de intrare
 * rămân intacte; textul liber este rezervat tipurilor generic / warm_up.
 */
export const prescriptieBloc = (bloc: BlocPrescriptie, optiuni: OptiuniPrescriptie): PrescriptieBloc => {
  const eticheta = bloc.parametri?.prefix || litera(bloc.ordine);
  const exercitii = new Map<number, SetPrescriptie[]>();
  for (const set of [...bloc.seturi].sort((a, b) => a.ordine - b.ordine)) {
    const grup = exercitii.get(set.exercitiu) ?? [];
    grup.push(set);
    exercitii.set(set.exercitiu, grup);
  }
  const superset = exercitii.size > 1;
  const compact: RandPrescriptie[] = [];
  const complet: RandPrescriptie[] = [];
  let numarSeturi = 0;
  for (const [exercitiu, seturi] of exercitii) {
    numarSeturi = Math.max(numarSeturi, seturi.length);
    const etichetaRand = superset ? `${eticheta}${exercitiu}` : eticheta;
    const grupuri: { rand: RandPrescriptie; tinta: string; cheie: string }[] = [];
    for (const set of seturi) {
      const tinta = tinteSportiv(set, optiuni.gen);
      const detalii = detaliiTinta(tinta, optiuni.unuRm?.[set.miscare.id]);
      const repetari = tinta.text.repetari ?? tinta.repetari;
      const textTinta = [repetari, ...detalii].filter(Boolean).join(' · ');
      const text = repetari
        ? [numeCuRepetari(set.miscare.nume, repetari), ...detalii].join(' · ')
        : `${set.miscare.nume}${detalii.length ? ` ${detalii.join(' · ')}` : ''}`;
      const pauza = textPauza({
        pauza_tip: set.pauza_tip ?? bloc.parametri?.pauza_tip,
        pauza_sec: set.pauza_sec ?? bloc.parametri?.pauza_sec,
        pauza_raport: set.pauza_raport ?? bloc.parametri?.pauza_raport,
      });
      const note = set.note || null;
      const instructiuniInainte = set.provenienta?.componenta?.preInstructions || null;
      const instructiuniDupa = set.provenienta?.componenta?.postInstructions || null;
      const cheie = JSON.stringify([set.miscare.id, text, pauza, note, instructiuniInainte, instructiuniDupa]);
      const ultim = grupuri.at(-1);
      if (ultim?.cheie === cheie) {
        ultim.rand.seturi += 1;
        if (set.id) ultim.rand.iduriSet.push(set.id);
      } else {
        grupuri.push({ tinta: textTinta, cheie, rand: {
          eticheta: etichetaRand, exercitiu, miscareId: set.miscare.id, text,
          seturi: 1, iduriSet: set.id ? [set.id] : [], pauza, note, instructiuniInainte, instructiuniDupa,
        } });
      }
    }
    const primul = grupuri[0];
    if (primul) {
      compact.push({
        ...primul.rand,
        text: `${seturi[0].miscare.nume} ${grupuri.map(grup => `${grup.rand.seturi}${grup.tinta ? ` x ${grup.tinta}` : ' seturi'}`).join(' + ')}`,
        seturi: seturi.length,
        iduriSet: grupuri.flatMap(grup => grup.rand.iduriSet),
      });
      complet.push(...grupuri.map(grup => grup.rand));
    }
  }
  return {
    eticheta, nume: bloc.nume || null, antet: antetBloc(bloc, numarSeturi, superset), compact, complet,
    instructiuniInainte: bloc.instructiuni_inainte || null,
    instructiuniDupa: bloc.instructiuni_dupa || null,
    noteSportiv: bloc.note_sportiv || null,
    text: bloc.tip === 'generic' || bloc.tip === 'warm_up' ? bloc.text || null : null,
    criteriuScor: bloc.tip === 'generic' ? bloc.parametri?.criteriu_scor || null : null,
  };
};
