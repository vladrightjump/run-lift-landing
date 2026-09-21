import { type EventConfig } from '../../../content/eventConfig';
import { Grup, Camp } from '../primitive';

type Props = {
  ciorna: EventConfig;
  seteaza: <K extends keyof EventConfig>(cheie: K, valoare: EventConfig[K]) => void;
};

/**
 * „Instagram": textele secțiunii.
 *
 * Clipurile NU se editează de aici. Sunt găzduite pe YouTube și administrate
 * din tabul „Clipuri" — pentru că nu țin de ediție.
 *
 * Ce a rămas aici chiar ține de ediție și chiar funcționează: titlul și textul
 * de lângă bandă. Un panou care ar fi păstrat rânduri de clipuri ar fi arătat
 * ca un control care face ceva, fără să facă nimic.
 */
export const GrupInstagram = ({ ciorna, seteaza }: Props) => (
  <Grup
    titlu="Instagram"
    ajutor="Textele secțiunii. Clipurile se adaugă din cod — vezi GHID-EDITIE-NOUA.md."
    rezumat={ciorna.reels.headline || 'fără titlu'}
  >
    <Camp eticheta="Titlul secțiunii" cheie="reels.headline">
      {(p) => (
        <input
          {...p}
          value={ciorna.reels.headline}
          onChange={(e) => seteaza('reels', { ...ciorna.reels, headline: e.target.value })}
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
