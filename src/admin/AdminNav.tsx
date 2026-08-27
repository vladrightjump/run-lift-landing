import type { TabAdmin } from './stareCurenta';
import { GRUPURI, grupulTabului, contorGrup } from './adminNavigatie';

type Props = {
  tab: TabAdmin;
  onTab: (tab: TabAdmin) => void;
  contorTab: Record<TabAdmin, number | null>;
  /** Emailuri nelivrate — singurul contor care e o alertă, nu o informație. */
  nelivrate: number;
};

/**
 * Navigația backoffice-ului: trei grupuri, cu frunzele grupului deschis
 * dedesubt.
 *
 * De ce două niveluri și nu șapte butoane: șapte taburi plate cer să știi
 * dinainte în care stă ce cauți. Trei întrebări („cine vine?", „ce le scriu?",
 * „cum arată pagina?") se aleg fără să știi structura aplicației.
 *
 * Grupul nu e un ecran — e doar un filtru peste bara a doua. Clicul pe grup
 * deschide PRIMA lui frunză, deci nu există stare în care ai ales un grup și
 * te uiți la nimic.
 */
export const AdminNav = ({ tab, onTab, contorTab, nelivrate }: Props) => {
  const grupActiv = grupulTabului(tab);

  return (
    <nav className="admin-nav" aria-label="Secțiunile backoffice-ului">
      <div className="admin-nav-grupuri" role="tablist" aria-label="Grupuri">
        {GRUPURI.map((g) => {
          const activ = g.cheie === grupActiv;
          const contor = contorGrup(g, contorTab);
          // Alerta urcă la grup: dacă „Livrare" are emailuri nelivrate, trebuie
          // să se vadă și cu grupul „Comunicare" închis — altfel gruparea ar
          // ascunde exact ce cere atenție.
          const alerta = g.taburi.some((t) => t.cheie === 'livrare') && nelivrate > 0;
          return (
            <button
              key={g.cheie}
              type="button"
              role="tab"
              aria-selected={activ}
              className={`admin-nav-grup${activ ? ' activ' : ''}`}
              onClick={() => onTab(g.taburi[0].cheie)}
            >
              <span className="admin-nav-grup-nume">
                {g.eticheta}
                {alerta ? (
                  <span className="admin-tab-alert">{nelivrate}</span>
                ) : (
                  contor !== null && contor > 0 && <span className="admin-tab-contor">{contor}</span>
                )}
              </span>
              <span className="admin-nav-grup-intrebare">{g.intrebare}</span>
            </button>
          );
        })}
      </div>

      <div className="admin-nav-taburi" role="tablist" aria-label="Secțiuni">
        {GRUPURI.filter((g) => g.cheie === grupActiv).flatMap((g) =>
          g.taburi.map(({ cheie, eticheta, descriere }) => {
            const contor = contorTab[cheie];
            const alerta = cheie === 'livrare' && nelivrate > 0;
            return (
              <button
                key={cheie}
                type="button"
                role="tab"
                aria-selected={tab === cheie}
                className={`admin-nav-tab${tab === cheie ? ' activ' : ''}`}
                title={descriere}
                onClick={() => onTab(cheie)}
              >
                {eticheta}
                {alerta ? (
                  <span className="admin-tab-alert">{nelivrate}</span>
                ) : (
                  contor !== null && <span className="admin-tab-contor">{contor}</span>
                )}
              </button>
            );
          })
        )}
      </div>
    </nav>
  );
};
