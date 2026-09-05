import type { EventConfig } from '../../../content/eventConfig';
import { Grup, Camp } from '../primitive';

type Props = {
  ciorna: EventConfig;
  seteaza: <K extends keyof EventConfig>(cheie: K, valoare: EventConfig[K]) => void;
  erori: Map<string, string>;
  areEroare: (campuri: string[]) => boolean;
};

/** „Locuri": capacitatea ediției și lista de așteptare. */
export const GrupLocuri = ({ ciorna, seteaza, erori, areEroare }: Props) => (
  <Grup
    titlu="Locuri"
    ajutor="Câți încap și ce se întâmplă când se umple."
    areEroare={areEroare(['slots.total', 'slots.waitlist'])}
    rezumat={`${ciorna.slots.total} locuri · ${ciorna.slots.waitlist} pe lista de așteptare`}
  >
    <Camp
      eticheta="Locuri disponibile"
      ajutor="Bara de pe pagină are exact atâtea segmente."
      eroare={erori.get('slots.total')}
    >
      {(p) => (
        <input
          {...p}
          type="number"
          min={1}
          value={ciorna.slots.total}
          onChange={(e) =>
            seteaza('slots', {
              ...ciorna.slots,
              total: Number(e.target.value),
            })
          }
        />
      )}
    </Camp>
    <Camp
      eticheta="Locuri pe lista de așteptare"
      ajutor="După ce se umplu locurile, formularul înscrie pe listă. Când se eliberează un loc, primul de pe listă urcă automat."
      eroare={erori.get('slots.waitlist')}
    >
      {(p) => (
        <input
          {...p}
          type="number"
          min={0}
          value={ciorna.slots.waitlist}
          onChange={(e) =>
            seteaza('slots', {
              ...ciorna.slots,
              waitlist: Number(e.target.value),
            })
          }
        />
      )}
    </Camp>
  </Grup>
);
