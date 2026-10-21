import type { BlocPrescriptie, SetPrescriptie } from '../lib/prescriptie';

export type EcranProgramare = 'prog-azi' | 'prog-calendar' | 'prog-programe' | 'prog-exercitii' | 'prog-rezultate';
export type NavigareProgramare = (ecran: EcranProgramare, parametri?: string[]) => void;
export type ProfilSportiv = {
  id: number; nume: string; gen: 'masculin' | 'feminin';
  unitate_greutate: 'kg' | 'lbs'; unitate_distanta: 'm' | 'ft'; telegram_id: string | null;
};
export type ProfilDeSalvat = Pick<ProfilSportiv, 'nume' | 'gen' | 'telegram_id'> & { unitate_greutate: 'kg'; unitate_distanta: 'm' };
export type Miscare = {
  id: string; id_extern: string; nume: string; categorie: string; masuratori: string[]; youtube_id: string | null; sursa: string;
};
export interface SetProgram extends SetPrescriptie {
  id: string; id_extern: string; miscare: Miscare; miscare_id_extern?: string;
}
export interface Bloc extends BlocPrescriptie {
  id: string; id_extern: string; ascuns: boolean; note_antrenor?: string | null; seturi: SetProgram[];
}
export type ZiProgram = { id: string; id_extern: string; saptamana: number; zi: number; titlu: string | null; blocuri: Bloc[] };
export type Atribuire = {
  id: string; program_id: string; sportiv_id: number; sportiv_nume: string; data_start: string; data_sfarsit: string;
};
export type Program = {
  id: string; id_extern: string; nume: string; descriere: string; saptamani: number; zile_pe_saptamana: number;
  sursa: string; publicat: boolean; atribuiri: Atribuire[];
};
export type ProgramComplet = Program & { zile: ZiProgram[] };
export type AntrenamentZi = { atribuire: Atribuire; program: Program; zi: ZiProgram };
export type DateAzi = { data: string; profil: ProfilSportiv | null; antrenamente: AntrenamentZi[] };
export type DateCalendar = {
  atribuire: Atribuire; zile: (ZiProgram & { data: string; stare: 'nefăcut' | 'viitor' })[];
  totaluri: { zile_antrenament: number; rezultate: number; pr: number };
};
