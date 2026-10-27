/** Unitățile stocate sunt metrice; conversiile nu rotunjesc datele importate. */
export const livreInKg = (livre: number): number => livre * 0.45359237;
export const feetInMetri = (feet: number): number => feet * 0.3048;
export const inchInCm = (inch: number): number => inch * 2.54;

const numarFmt = new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 3, useGrouping: false });

/** Aceeași limbă ca formatarea din shared/lib/formatare.ts. */
export const numar = (valoare: number): string => numarFmt.format(valoare);

const cantitate = (valoare: number, singular: string, plural: string): string => {
  if (valoare === 1) return `1 ${singular}`;
  const cuDe = valoare >= 20 && (valoare % 100 >= 20 || valoare % 100 === 0);
  return `${numar(valoare)}${cuDe ? ' de' : ''} ${plural}`;
};

/** Durata lizibilă: „1 minut și 30 de secunde”, fără dependență de un ceas. */
export const durata = (secunde: number): string => {
  const ore = Math.floor(secunde / 3600);
  const minute = Math.floor((secunde % 3600) / 60);
  const sec = secunde % 60;
  const parti: string[] = [];
  if (ore) parti.push(cantitate(ore, 'oră', 'ore'));
  if (minute) parti.push(cantitate(minute, 'minut', 'minute'));
  if (sec || parti.length === 0) parti.push(cantitate(sec, 'secundă', 'secunde'));
  return parti.join(' și ');
};

/** Unitățile sportivului în demo sunt kg / m; kilometrii sunt doar afișare. */
export const distanta = (metri: number): string => metri >= 1000
  ? `${numar(metri / 1000)} km`
  : `${numar(metri)} m`;
