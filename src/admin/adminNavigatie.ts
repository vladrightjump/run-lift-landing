import type { TabAdmin } from './stareCurenta';

/**
 * Gruparea taburilor, ca modul pur.
 *
 * De ce a fost nevoie: cele șapte taburi erau o listă plată care amesteca
 * OAMENI cu SETĂRI („Participanți", „Livrare", „Eveniment", „Coming Soon"…).
 * Ca să găsești ceva trebuia să știi deja în care dintre ele stă, iar căutarea
 * trecea de regulă prin două înainte să nimerească.
 *
 * Gruparea urmează treaba, nu tabelul din spate. Organizatorul vine cu una din
 * trei întrebări: „cine vine?", „ce le scriu?", „cum arată pagina?". Grupurile
 * sînt exact astea trei.
 *
 * Frunzele au rămas ACELEAȘI taburi ca înainte — nu s-a mutat conținut, doar
 * s-a pus un acoperiș peste el. Așa muscle memory-ul nu se rupe: ce era în
 * „Livrare" e tot în „Livrare", doar că sub „Comunicare".
 */

export type GrupNav = {
  cheie: 'oameni' | 'comunicare' | 'setup';
  eticheta: string;
  /** Ce răspunde grupul, în cuvintele organizatorului. */
  intrebare: string;
  taburi: { cheie: TabAdmin; eticheta: string; descriere: string }[];
};

export const GRUPURI: GrupNav[] = [
  {
    cheie: 'oameni',
    eticheta: 'Oameni',
    intrebare: 'Cine vine?',
    taburi: [
      {
        cheie: 'participanti',
        eticheta: 'Participanți',
        descriere: 'Cine s-a înscris, lista de așteptare și activitatea recentă',
      },
      {
        cheie: 'lansare',
        eticheta: 'Abonați la anunț',
        descriere: 'Adresele lăsate prin „Anunță-mă la lansare” pe pagina publică',
      },
    ],
  },
  {
    cheie: 'comunicare',
    eticheta: 'Comunicare',
    intrebare: 'Ce le scriu?',
    taburi: [
      {
        cheie: 'email',
        eticheta: 'Trimite emailuri',
        descriere: 'Trimitere în masă către participanți sau lista de așteptare',
      },
      {
        cheie: 'livrare',
        eticheta: 'Livrare',
        descriere: 'Ce email a ajuns la cine și ce n-a ajuns',
      },
      {
        cheie: 'sabloane',
        eticheta: 'Șabloane',
        descriere: 'Textul emailurilor de confirmare, reminder, anunț și badge',
      },
    ],
  },
  {
    cheie: 'setup',
    eticheta: 'Setup',
    intrebare: 'Cum arată pagina?',
    taburi: [
      {
        cheie: 'eveniment',
        eticheta: 'Evenimentul',
        descriere: 'Data, locul, locurile și ce arată pagina — se publică fără deploy',
      },
      {
        cheie: 'coming-soon',
        eticheta: 'Coming Soon',
        descriere: 'Comutatorul ecranului de dinainte de lansare și țintele numărătorilor',
      },
    ],
  },
];

/** Toate frunzele, în ordinea de pe ecran. */
export const TOATE_TABURILE = GRUPURI.flatMap((g) => g.taburi);

/** Grupul în care stă un tab. Fără el, deschiderea unui tab n-ar deschide grupul. */
export const grupulTabului = (tab: TabAdmin): GrupNav['cheie'] => {
  const grup = GRUPURI.find((g) => g.taburi.some((t) => t.cheie === tab));
  // Un tab care nu e în nicio grupă e o greșeală de configurare, nu o stare de
  // rulare: cade pe primul grup ca să nu rămână ecranul gol.
  return grup?.cheie ?? GRUPURI[0].cheie;
};

/** Eticheta unei frunze, pentru titluri și „ești aici". */
export const etichetaTabului = (tab: TabAdmin): string =>
  TOATE_TABURILE.find((t) => t.cheie === tab)?.eticheta ?? '';

/**
 * Contorul unui grup = suma frunzelor lui.
 *
 * Rostul: dacă grupul e închis, numărul de pe el trebuie să spună tot ce e
 * înăuntru. Altfel gruparea ar ascunde exact informația pentru care existau
 * contoarele pe taburi.
 *
 * `null` (date încă nesosite) nu contează ca zero: un „0" în timpul încărcării
 * e o minciună scurtă, dar tocmai pe aia o citește organizatorul când intră.
 */
export const contorGrup = (
  grup: GrupNav,
  contorTab: Record<TabAdmin, number | null>
): number | null => {
  const valori = grup.taburi.map((t) => contorTab[t.cheie]).filter((v): v is number => v !== null);
  return valori.length === 0 ? null : valori.reduce((a, b) => a + b, 0);
};
