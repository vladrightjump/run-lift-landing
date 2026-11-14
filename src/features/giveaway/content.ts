/**
 * Textele fiecărui giveaway, sub `slug`-ul rândului lui din `runlift.giveaways`.
 *
 * Perioada NU e aici: o ține baza de date, care refuză singură înscrierile din
 * afara ei. Aici stă doar ce citește omul — premiul, sponsorul, condițiile și
 * regulamentul. Un `slug` fără intrare arată pagina „niciun giveaway activ",
 * deci rândul și conținutul pot ajunge în producție în orice ordine.
 */
export type ContinutGiveaway = {
  titlu: string;
  /** Ce se câștigă, într-o frază. */
  premiu: string;
  /** Logoul stă în `public/`: politica `img-src` permite doar originea site-ului. */
  sponsor: { nume: string; logo: string };
  /** Ce are de făcut participantul pe Instagram, pe lângă formular. */
  conditii: string[];
  regulament: { titlu: string; paragrafe: string[] }[];
};

// `Map`, nu obiect: `slug`-ul vine din baza de date, iar `constructor` e un
// slug valid care pe un obiect ar întoarce altceva decât o intrare.
const CONTINUT = new Map<string, ContinutGiveaway>();

export const continutGiveaway = (slug: string): ContinutGiveaway | null => CONTINUT.get(slug) ?? null;
