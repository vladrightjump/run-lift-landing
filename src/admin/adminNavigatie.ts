import type { EcranAdmin } from './stareCurenta';

/**
 * Registrul de ecrane, ca modul pur.
 *
 * Gruparea urmează ce FACE ecranul, nu tabelul din spate. Organizatorul vine cu
 * una din patru întrebări: „unde e ediția?", „cine vine?", „ce le scriu?",
 * „cum arată pagina?". Grupurile sînt exact astea patru.
 *
 * Ce s-a schimbat față de versiunea cu taburi: „desfășurarea" era un bloc
 * permanent deasupra tuturor taburilor, iar antrenamentele o manetă a cromului.
 * Amândouă sînt acum ecrane obișnuite — au adresă, contor și pot fi ținta unui
 * semnal de atenție, ceea ce niciuna nu putea înainte.
 *
 * `descriere` nu mai e decorativă. Era scrisă și până acum, dar ajungea doar în
 * `title`, deci se vedea numai la hover, numai cu mouse. Registrul o dă mai
 * departe ecranului care o arată.
 */

export type GrupNav = {
  cheie: 'desfasurare' | 'oameni' | 'comunicare' | 'continut';
  eticheta: string;
  /** Ce răspunde grupul, în cuvintele organizatorului. */
  intrebare: string;
  ecrane: { cheie: EcranAdmin; eticheta: string; descriere: string }[];
};

export const GRUPURI: GrupNav[] = [
  {
    cheie: 'desfasurare',
    eticheta: 'Desfășurarea',
    intrebare: 'Unde e ediția?',
    ecrane: [
      {
        cheie: 'desfasurare',
        eticheta: 'Desfășurarea ediției',
        descriere: 'Reperele ediției, ce urmează și ce cere atenție acum',
      },
    ],
  },
  {
    cheie: 'oameni',
    eticheta: 'Oameni',
    intrebare: 'Cine vine?',
    ecrane: [
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
    ecrane: [
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
    cheie: 'continut',
    eticheta: 'Conținutul site-ului',
    intrebare: 'Cum arată pagina?',
    ecrane: [
      {
        cheie: 'eveniment',
        eticheta: 'Evenimentul',
        descriere: 'Data, locul, locurile și ce arată pagina — se publică fără deploy',
      },
      {
        cheie: 'clipuri',
        eticheta: 'Clipuri',
        descriere: 'Banda cu clipuri de antrenament — ordine, legende, ce se vede',
      },
      {
        cheie: 'antrenament',
        eticheta: 'Antrenamente',
        descriere: 'Programul săptămânal — ce scrie pe pagina de antrenament',
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
export const TOATE_ECRANELE = GRUPURI.flatMap((g) => g.ecrane);

/** Grupul în care stă un ecran. Fără el, deschiderea unui ecran n-ar deschide grupul. */
export const grupulEcranului = (ecran: EcranAdmin): GrupNav['cheie'] => {
  const grup = GRUPURI.find((g) => g.ecrane.some((e) => e.cheie === ecran));
  // Un ecran care nu e în niciun grup e o greșeală de configurare, nu o stare
  // de rulare: cade pe primul grup ca să nu rămână ecranul gol.
  return grup?.cheie ?? GRUPURI[0].cheie;
};

/** Eticheta unui ecran, pentru titluri și „ești aici". */
export const etichetaEcranului = (ecran: EcranAdmin): string =>
  TOATE_ECRANELE.find((e) => e.cheie === ecran)?.eticheta ?? '';

/**
 * Contorul unui grup = suma frunzelor lui.
 *
 * Rostul: dacă grupul e închis, numărul de pe el trebuie să spună tot ce e
 * înăuntru. Altfel gruparea ar ascunde exact informația pentru care existau
 * contoarele pe ecrane.
 *
 * `null` (date încă nesosite) nu contează ca zero: un „0" în timpul încărcării
 * e o minciună scurtă, dar tocmai pe aia o citește organizatorul când intră.
 */
export const contorGrup = (
  grup: GrupNav,
  contorEcran: Record<EcranAdmin, number | null>
): number | null => {
  const valori = grup.ecrane
    .map((e) => contorEcran[e.cheie])
    .filter((v): v is number => v !== null);
  return valori.length === 0 ? null : valori.reduce((a, b) => a + b, 0);
};
