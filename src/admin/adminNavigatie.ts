import type { EcranAdmin } from './stareCurenta';

/**
 * Registrul adminului: zone → file → ecrane (KTD3 din
 * docs/plans/2026-10-06-1331-feat-redesign-admin-panoul-plan.md).
 *
 * Gruparea urmează ACTIVITATEA, nu tipul de ecran: organizatorul conduce
 * antrenamentele din parc, edițiile Run + Lift și pagina publică. Oamenii și
 * mesajele unei activități stau lângă ea — „Mesaje" din Antrenamente e
 * Telegram, „Mesaje" din Evenimente e email.
 *
 * Adresa e cheia ecranului (`#livrare`), nu calea zonei: toate cheile de
 * dinainte de redesign rămân valabile, deci niciun link salvat nu se rupe.
 * Zona și fila se deduc de aici.
 *
 * `descriere` nu e decorativă: o arată ecranul, sub titlu.
 */

export type ZonaAdmin = 'acum' | 'antrenamente' | 'evenimente' | 'site';

export type EcranRegistru = {
  cheie: EcranAdmin;
  eticheta: string;
  descriere: string;
  /** Datele depind de ediția aleasă. Doar atunci se arată selectorul de ediție (R4). */
  peEditie?: boolean;
};

/** O filă are un ecran sau, ca Mesaje din Evenimente, câteva subfile. */
export type FilaRegistru = { cheie: string; eticheta: string; ecrane: EcranRegistru[] };

export type ZonaRegistru = {
  cheie: ZonaAdmin;
  eticheta: string;
  /** Ce răspunde zona, în cuvintele organizatorului. */
  intrebare: string;
  file: FilaRegistru[];
};

export const ECRAN_IMPLICIT: EcranAdmin = 'acum';

export const ZONE: ZonaRegistru[] = [
  {
    cheie: 'acum',
    eticheta: 'Acum',
    intrebare: 'Ce urmează și ce cere atenție?',
    file: [
      {
        cheie: 'acum',
        eticheta: 'Acum',
        ecrane: [
          {
            cheie: 'acum',
            eticheta: 'Acum',
            descriere: 'Săptămâna, ce e de rezolvat, antrenamentul următor și ediția',
          },
        ],
      },
    ],
  },
  {
    cheie: 'antrenamente',
    eticheta: 'Antrenamente',
    intrebare: 'Cine vine la antrenament?',
    file: [
      {
        cheie: 'urmatorul',
        eticheta: 'Următorul',
        ecrane: [
          {
            cheie: 'grup-prezente',
            eticheta: 'Următorul',
            descriere: 'Antrenamentul următor: cine vine, cine nu și cine n-a răspuns la sondaj',
          },
        ],
      },
      {
        cheie: 'istoric',
        eticheta: 'Istoric și analiză',
        ecrane: [
          {
            cheie: 'grup-analiza',
            eticheta: 'Istoric și analiză',
            descriere: 'Antrenamentele trecute, cine vine des și cine s-a rărit',
          },
        ],
      },
      {
        cheie: 'membri',
        eticheta: 'Membri',
        ecrane: [
          {
            cheie: 'grup-membri',
            eticheta: 'Membri',
            descriere: 'Conturile de Telegram, duplicatele și scoaterea din grup',
          },
        ],
      },
      {
        cheie: 'setari',
        eticheta: 'Setări bot',
        ecrane: [
          {
            cheie: 'grup-bot',
            eticheta: 'Setări bot',
            descriere: 'Orarul și textul sondajului, comenzile și dacă botul răspunde',
          },
        ],
      },
      {
        cheie: 'ghid-bot',
        eticheta: 'Instrucțiuni bot',
        ecrane: [{
          cheie: 'grup-ghid',
          eticheta: 'Instrucțiuni bot',
          descriere: 'Comenzile din Telegram, acțiunile automate și răspunsurile la întrebările organizatorilor',
        }],
      },
    ],
  },
  {
    cheie: 'evenimente',
    eticheta: 'Evenimente',
    intrebare: 'Cum merge ediția?',
    file: [
      {
        cheie: 'rezumat',
        eticheta: 'Rezumat',
        ecrane: [
          {
            cheie: 'desfasurare',
            eticheta: 'Rezumat',
            // Linia de timp citește configul PUBLICAT, nu ediția aleasă: un
            // selector aici n-ar filtra nimic.
            descriere: 'Reperele ediției: anunțul, închiderea înscrierilor, check-in-ul, startul',
          },
        ],
      },
      {
        cheie: 'participanti',
        eticheta: 'Participanți',
        ecrane: [
          {
            cheie: 'participanti',
            eticheta: 'Participanți',
            descriere: 'Cine s-a înscris, lista de așteptare și prezența la check-in',
            peEditie: true,
          },
        ],
      },
      {
        cheie: 'mesaje',
        eticheta: 'Mesaje',
        ecrane: [
          {
            cheie: 'email',
            eticheta: 'Compune',
            descriere: 'Email către participanți, lista de așteptare sau abonați',
            peEditie: true,
          },
          {
            cheie: 'livrare',
            eticheta: 'Livrare',
            descriere: 'Ce email a ajuns la cine și ce n-a ajuns',
            peEditie: true,
          },
          {
            cheie: 'sabloane',
            eticheta: 'Șabloane comune',
            descriere: 'Confirmare, reminder, anunț și badge — comune tuturor edițiilor',
          },
        ],
      },
      {
        cheie: 'detalii',
        eticheta: 'Detalii și publicare',
        ecrane: [
          {
            cheie: 'eveniment',
            eticheta: 'Detalii și publicare',
            descriere: 'Data, locul, locurile și ce arată pagina — se publică fără deploy',
            peEditie: true,
          },
        ],
      },
      {
        cheie: 'abonati',
        eticheta: 'Abonați',
        ecrane: [
          {
            cheie: 'lansare',
            eticheta: 'Abonați',
            descriere: 'Adresele lăsate prin „Anunță-mă la lansare” pe pagina publică',
            peEditie: true,
          },
        ],
      },
    ],
  },
  {
    cheie: 'site',
    eticheta: 'Site',
    intrebare: 'Cum arată pagina?',
    file: [
      {
        cheie: 'program',
        eticheta: 'Program săptămânal',
        ecrane: [
          {
            cheie: 'antrenament',
            eticheta: 'Program săptămânal',
            descriere: 'Programul pe săptămâni — ce scrie pe pagina de antrenament',
          },
        ],
      },
      {
        cheie: 'clipuri',
        eticheta: 'Clipuri',
        ecrane: [
          {
            cheie: 'clipuri',
            eticheta: 'Clipuri',
            descriere: 'Banda cu clipuri de antrenament — ordine, legende, ce se vede',
          },
        ],
      },
      {
        cheie: 'prelansare',
        eticheta: 'Prelansare',
        ecrane: [
          {
            cheie: 'coming-soon',
            eticheta: 'Prelansare',
            descriere: 'Ecranul de dinainte de lansare și țintele numărătorilor',
          },
        ],
      },
    ],
  },
];

/** Toate ecranele, în ordinea de pe ecran. */
export const TOATE_ECRANELE: EcranRegistru[] = ZONE.flatMap((z) => z.file.flatMap((f) => f.ecrane));

const zonaLui = (ecran: EcranAdmin) =>
  ZONE.find((z) => z.file.some((f) => f.ecrane.some((e) => e.cheie === ecran)));

/**
 * Zona în care stă un ecran. Un ecran care nu e în registru e o greșeală de
 * configurare, nu o stare de rulare: cade pe Acum ca să nu rămână ecranul gol.
 */
export const zonaEcranului = (ecran: EcranAdmin): ZonaAdmin => zonaLui(ecran)?.cheie ?? 'acum';

/** Fila unui ecran (pentru subfile: fila-mamă, de exemplu Mesaje). */
export const filaEcranului = (ecran: EcranAdmin): FilaRegistru =>
  zonaLui(ecran)?.file.find((f) => f.ecrane.some((e) => e.cheie === ecran)) ?? ZONE[0].file[0];

/** Un șir oarecare (dintr-un fragment de URL) e cheia unui ecran real? */
export const esteEcran = (cheie: string): cheie is EcranAdmin =>
  TOATE_ECRANELE.some((e) => e.cheie === cheie);

export const ecranulDinRegistru = (ecran: EcranAdmin): EcranRegistru | undefined =>
  TOATE_ECRANELE.find((e) => e.cheie === ecran);

/** Eticheta unui ecran, pentru titluri și „ești aici". */
export const etichetaEcranului = (ecran: EcranAdmin): string => ecranulDinRegistru(ecran)?.eticheta ?? '';

export const estePeEditie = (ecran: EcranAdmin): boolean => ecranulDinRegistru(ecran)?.peEditie === true;

/**
 * Contorul unei zone = suma ecranelor ei.
 *
 * `null` (date încă nesosite) nu contează ca zero: un „0" în timpul încărcării
 * e o minciună scurtă, dar tocmai pe aia o citește organizatorul când intră.
 */
export const contorZona = (
  zona: ZonaRegistru,
  contorEcran: Record<EcranAdmin, number | null>
): number | null => {
  const valori = zona.file
    .flatMap((f) => f.ecrane)
    .map((e) => contorEcran[e.cheie])
    .filter((v): v is number => v !== null);
  return valori.length === 0 ? null : valori.reduce((a, b) => a + b, 0);
};

/** Contorul unei file (suma subfilelor). */
export const contorFila = (
  fila: FilaRegistru,
  contorEcran: Record<EcranAdmin, number | null>
): number | null => {
  const valori = fila.ecrane.map((e) => contorEcran[e.cheie]).filter((v): v is number => v !== null);
  return valori.length === 0 ? null : valori.reduce((a, b) => a + b, 0);
};
