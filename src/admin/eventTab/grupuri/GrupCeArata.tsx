import type { EventConfig } from '../../../content/eventConfig';
import { Grup, Camp } from '../primitive';

type Props = {
  ciorna: EventConfig;
  seteaza: <K extends keyof EventConfig>(cheie: K, valoare: EventConfig[K]) => void;
};

/** „Ce arată pagina": ecranul de pornire și ordinea secțiunilor. */
export const GrupCeArata = ({ ciorna, seteaza }: Props) => (
  <Grup
    titlu="Ce arată pagina"
    ajutor="Ecranul de pornire și ordinea secțiunilor."
    rezumat={`${ciorna.showComingSoon ? 'Coming Soon' : 'Landing'} · ${
      ciorna.layout.filter((x) => x.visible).length
    } secțiuni vizibile`}
  >
    <Camp
      eticheta="Homepage-ul arată"
      ajutor="„Coming Soon” ține pagina pe numărătoarea inversă spre momentul anunțului, fără formular."
    >
      {(p) => (
        <select
          {...p}
          value={ciorna.showComingSoon ? 'soon' : 'landing'}
          onChange={(e) => seteaza('showComingSoon', e.target.value === 'soon')}
        >
          <option value="landing">Landing, cu înscrieri</option>
          <option value="soon">Coming Soon</option>
        </select>
      )}
    </Camp>
  </Grup>
);
