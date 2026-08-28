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
 * Grupul nu e un ecran — e doar un filtru peste bara a doua. Clicul pe un grup
 * ÎNCHIS deschide prima lui frunză, deci nu există stare în care ai ales un
 * grup și te uiți la nimic.
 *
 * Semantica e de NAVIGAȚIE (`aria-current`), nu de tab widget. A fost o clipă
 * `role="tab"`, ceea ce era o promisiune neonorată: un tab trebuie să
 * controleze un `tabpanel` prin `aria-controls` și să răspundă la săgeți, iar
 * panourile de aici sînt secțiuni obișnuite randate de dashboard. Un cititor de
 * ecran care aude „tab 1 din 3" și apasă săgeata așteaptă să se schimbe ceva.
 * Mai bine o navigație corectă decât un widget pe jumătate.
 */
export const AdminNav = ({ tab, onTab, contorTab, nelivrate }: Props) => {
  const grupActiv = grupulTabului(tab);

  return (
    <nav className="admin-nav" aria-label="Secțiunile backoffice-ului">
      <ul className="admin-nav-grupuri">
        {GRUPURI.map((g) => {
          const activ = g.cheie === grupActiv;
          const contor = contorGrup(g, contorTab);
          // Alerta urcă la grup: dacă „Livrare" are emailuri nelivrate, trebuie
          // să se vadă și cu grupul „Comunicare" închis — altfel gruparea ar
          // ascunde exact ce cere atenție.
          const alerta = g.taburi.some((t) => t.cheie === 'livrare') && nelivrate > 0;
          return (
            <li key={g.cheie}>
              <button
                type="button"
                aria-current={activ ? true : undefined}
                className={`admin-nav-grup${activ ? ' activ' : ''}`}
                // Clicul pe grupul în care ești deja NU te mută. Altfel, aflat
                // pe „Livrare" și apăsând „Comunicare" (ca să-l pliezi, sau din
                // reflex), ai fi aruncat pe „Trimite emailuri" și ai pierde
                // rândul pe care tocmai îl citeai.
                onClick={() => {
                  if (!activ) onTab(g.taburi[0].cheie);
                }}
              >
                <span className="admin-nav-grup-nume">
                  {g.eticheta}
                  {alerta ? (
                    <span className="admin-tab-alert">{nelivrate}</span>
                  ) : (
                    contor !== null &&
                    contor > 0 && <span className="admin-tab-contor">{contor}</span>
                  )}
                </span>
                <span className="admin-nav-grup-intrebare">{g.intrebare}</span>
              </button>
            </li>
          );
        })}
      </ul>

      <ul className="admin-nav-taburi">
        {GRUPURI.filter((g) => g.cheie === grupActiv).flatMap((g) =>
          g.taburi.map(({ cheie, eticheta, descriere }) => {
            const contor = contorTab[cheie];
            const alerta = cheie === 'livrare' && nelivrate > 0;
            return (
              <li key={cheie}>
                <button
                  type="button"
                  aria-current={tab === cheie ? true : undefined}
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
              </li>
            );
          })
        )}
      </ul>
    </nav>
  );
};
