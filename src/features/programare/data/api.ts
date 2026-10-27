import { rpc } from '../../../shared/lib/rpc';
import type { DocumentImport } from './importProgram';
import type { Atribuire, DateAzi, DateCalendar, ProfilDeSalvat, ProfilSportiv, Program, ProgramComplet } from './tipuri';

export const incarcaProfil = (token: string, signal?: AbortSignal) => rpc<ProfilSportiv | null>('admin_prog_profil', { p_token: token }, signal);
export const salveazaProfil = (token: string, profil: ProfilDeSalvat) => rpc<ProfilSportiv>('admin_prog_profil_salveaza', {
  p_token: token, p_nume: profil.nume, p_gen: profil.gen, p_unitate_greutate: profil.unitate_greutate,
  p_unitate_distanta: profil.unitate_distanta, p_telegram_id: profil.telegram_id,
});
export const incarcaPrograme = (token: string, signal?: AbortSignal) => rpc<Program[]>('admin_prog_programe', { p_token: token }, signal);
export const incarcaProgram = (token: string, id: string, signal?: AbortSignal) => rpc<ProgramComplet>('admin_prog_program', { p_token: token, p_program_id: id }, signal);
export const importaProgram = (token: string, document: DocumentImport) => rpc<ProgramComplet>('admin_prog_importa', { p_token: token, p_document: document });
export const atribuieProgram = (token: string, id: string, dataStart: string) => rpc<Atribuire>('admin_prog_atribuie', { p_token: token, p_program_id: id, p_data_start: dataStart });
export const incarcaAzi = (token: string, data: string, signal?: AbortSignal) => rpc<DateAzi>('admin_prog_azi', { p_token: token, p_data: data }, signal);
export const incarcaCalendar = (token: string, id: string, azi: string, signal?: AbortSignal) => rpc<DateCalendar>('admin_prog_calendar', { p_token: token, p_atribuire_id: id, p_azi: azi }, signal);
