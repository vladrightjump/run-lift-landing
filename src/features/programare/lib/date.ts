import { FUS } from '@/shared/lib/formatare';

const dataUtc = (data: string): Date => new Date(`${data}T12:00:00Z`);

/** O zi de calendar rămâne o zi, inclusiv la schimbările de oră. */
export const decaleazaData = (data: string, zile: number): string => {
  const rezultat = dataUtc(data);
  rezultat.setUTCDate(rezultat.getUTCDate() + zile);
  return rezultat.toISOString().slice(0, 10);
};

/** Săptămânile și zilele programului sunt numerotate de la 1. */
export const dataAtribuire = (dataStart: string, saptamana: number, zi: number): string =>
  decaleazaData(dataStart, (saptamana - 1) * 7 + zi - 1);

export const diferentaZile = (deLa: string, panaLa: string): number =>
  (dataUtc(panaLa).getTime() - dataUtc(deLa).getTime()) / 86_400_000;

const aziFmt = new Intl.DateTimeFormat('en-CA', { timeZone: FUS, year: 'numeric', month: '2-digit', day: '2-digit' });

/** „Azi” se decide în fusul programului, independent de telefon sau server. */
export const aziProgramare = (acum: Date = new Date()): string => {
  const parti = aziFmt.formatToParts(acum);
  const parte = (tip: Intl.DateTimeFormatPartTypes) => parti.find(p => p.type === tip)!.value;
  return `${parte('year')}-${parte('month')}-${parte('day')}`;
};

const dataFmt = new Intl.DateTimeFormat('ro-RO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

/** Primește YYYY-MM-DD, nu un moment care ar putea aluneca în altă zi. */
export const dataCompleta = (data: string): string => dataFmt.format(dataUtc(data));
