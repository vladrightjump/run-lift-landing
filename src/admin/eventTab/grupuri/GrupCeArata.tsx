import { useContext } from 'react';
import type { EventConfig } from '../../../content/eventConfig';
import { Grup, Camp, Blocat } from '../primitive';
import { mutaSectiune, comutaVizibilitatea } from '../../eventConfigForm';
import { ETICHETE_SECTIUNI } from '../ajutoare';

type Props = {
  ciorna: EventConfig;
  seteaza: <K extends keyof EventConfig>(cheie: K, valoare: EventConfig[K]) => void;
};

/**
 * „Ce arată pagina": ecranul de pornire și ordinea secțiunilor.
 *
 * Lista de secțiuni stătea în afara grupului, la capătul formularului — deci
 * grupul își rezuma pliat („4 secțiuni vizibile") ceva ce nu conținea, iar
 * rândurile rămâneau pe ecran cu grupul închis.
 */
export const GrupCeArata = ({ ciorna, seteaza }: Props) => {
  const ocupat = useContext(Blocat);
  return (
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

      <div className="admin-config-lista">
        <span className="admin-config-eticheta">Secțiunile paginii</span>
        <p className="admin-config-hint">
          Ordinea de aici e ordinea de pe pagină. Numerele (01, 02…) se recalculează singure — o
          secțiune ascunsă nu lasă gaură.
        </p>
        <ol className="admin-layout-list">
          {ciorna.layout.map((s, i) => (
            <li key={s.key} className={s.visible ? '' : 'ascunsa'}>
              <span className="admin-layout-nr">
                {s.visible
                  ? String(ciorna.layout.filter((x, j) => x.visible && j <= i).length).padStart(
                      2,
                      '0'
                    )
                  : '—'}
              </span>
              <span className="admin-layout-nume">{ETICHETE_SECTIUNI[s.key]}</span>
              <button
                type="button"
                className="admin-btn-ghost"
                onClick={() => seteaza('layout', mutaSectiune(ciorna.layout, s.key, -1))}
                disabled={ocupat || i === 0}
                aria-label={`Mută „${ETICHETE_SECTIUNI[s.key]}” mai sus`}
              >
                ↑
              </button>
              <button
                type="button"
                className="admin-btn-ghost"
                onClick={() => seteaza('layout', mutaSectiune(ciorna.layout, s.key, 1))}
                disabled={ocupat || i === ciorna.layout.length - 1}
                aria-label={`Mută „${ETICHETE_SECTIUNI[s.key]}” mai jos`}
              >
                ↓
              </button>
              <button
                type="button"
                className="admin-btn-ghost"
                onClick={() => seteaza('layout', comutaVizibilitatea(ciorna.layout, s.key))}
                disabled={ocupat}
              >
                {s.visible ? 'Ascunde' : 'Arată'}
              </button>
            </li>
          ))}
        </ol>
      </div>
    </Grup>
  );
};
