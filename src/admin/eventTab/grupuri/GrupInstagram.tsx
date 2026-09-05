import type { EventConfig } from '../../../content/eventConfig';
import { Grup, Camp } from '../primitive';

type Props = {
  ciorna: EventConfig;
  seteaza: <K extends keyof EventConfig>(cheie: K, valoare: EventConfig[K]) => void;
  erori: Map<string, string>;
};

/** „Instagram": clipurile din bandă, adăugate lipind linkul. */
export const GrupInstagram = ({ ciorna, seteaza, erori }: Props) => (
  <Grup
    titlu="Instagram"
    ajutor="Clipurile din bandă. Lipești linkul din Instagram — codul se extrage singur."
    areEroare={[...erori.keys()].some((c) => c.startsWith('reels'))}
    rezumat={
      ciorna.reels.items.length === 0
        ? 'Niciun clip · secțiunea nu apare pe pagină'
        : `${ciorna.reels.items.length} ${
            ciorna.reels.items.length === 1 ? 'clip' : 'clipuri'
          }`
    }
  >
    <Camp
      eticheta="Titlul secțiunii"
      eroare={erori.get('reels.headline')}
    >
      {(p) => (
        <input
          {...p}
          value={ciorna.reels.headline}
          onChange={(e) =>
            seteaza('reels', { ...ciorna.reels, headline: e.target.value })
          }
        />
      )}
    </Camp>
    <Camp
      eticheta="Textul de lângă bandă"
      ajutor="Două rânduri. Ce vede cineva care nu ne-a văzut niciodată alergând."
    >
      {(p) => (
        <textarea
          {...p}
          rows={3}
          value={ciorna.reels.body}
          onChange={(e) => seteaza('reels', { ...ciorna.reels, body: e.target.value })}
        />
      )}
    </Camp>
  </Grup>
);
