import { INSTAGRAM_URL } from '../../shared/lib/config';

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
  produse: { nume: string; url: string }[];
  /** Logoul stă în `public/`: politica `img-src` permite doar originea site-ului. */
  sponsor: { nume: string; logo: string };
  /** Ce are de făcut participantul pe Instagram, pe lângă formular. */
  conditii: { text: string; url: string }[];
  regulament: { titlu: string; paragrafe: string[] }[];
};

// `Map`, nu obiect: `slug`-ul vine din baza de date, iar `constructor` e un
// slug valid care pe un obiect ar întoarce altceva decât o intrare.
const CONTINUT = new Map<string, ContinutGiveaway>([
  ['bitonic-2026', {
    titlu: 'Run + Lift × BITONIC',
    premiu: 'Un pachet cu trei produse BITONIC pentru un singur câștigător.',
    produse: [
      { nume: 'BITONIC® ORANGE IMUN', url: 'https://bitonic.md/products/orange-imun' },
      { nume: 'BITONIC® OMEGA 3 GOLD', url: 'https://bitonic.md/products/golden-oils-forte' },
      { nume: 'BITONIC® VITAMINA D + ZINC', url: 'https://bitonic.md/products/vitamina-d-zinc' },
    ],
    sponsor: { nume: 'BITONIC', logo: '/giveaway/bitonic-logo.svg' },
    conditii: [
      { text: 'Urmărește @we_run_and_lift pe Instagram', url: INSTAGRAM_URL },
      { text: 'Urmărește @bitonic.md pe Instagram', url: 'https://www.instagram.com/bitonic.md' },
    ],
    regulament: [
      {
        titlu: 'Participare',
        paragrafe: [
          'Urmărește conturile @we_run_and_lift și @bitonic.md pe Instagram și completează formularul o singură dată cât timp înscrierile sunt deschise.',
        ],
      },
      {
        titlu: 'Extragere și premiu',
        paragrafe: [
          'După închiderea înscrierilor, Run + Lift extrage aleatoriu o persoană dintre cei înscriși și verifică dacă urmărește ambele conturi. Dacă persoana extrasă nu îndeplinește condițiile sau nu poate fi contactată, extragem din nou.',
          'Contactăm câștigătorul pentru a stabili cum primește pachetul și îl anunțăm pe contul @we_run_and_lift.',
        ],
      },
      {
        titlu: 'Datele de participare',
        paragrafe: [
          'Folosim datele din formular pentru înscriere, verificarea condițiilor și contactarea câștigătorului. Acordul pentru a primi vești despre evenimentele Run + Lift este opțional.',
          'La încheierea giveaway-ului, ștergem participările celor care nu au ales să primească vești. Păstrăm numele și contul de Instagram al câștigătorului în evidența giveaway-ului.',
        ],
      },
    ],
  }],
]);

export const continutGiveaway = (slug: string): ContinutGiveaway | null => CONTINUT.get(slug) ?? null;
