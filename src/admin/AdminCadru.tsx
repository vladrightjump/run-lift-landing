import { useEffect, useRef, type ReactNode } from 'react';
import type { EcranAdmin, FazaSite } from './stareCurenta';
import { ETICHETA_FAZA } from './stareCurenta';
import {
  ZONE,
  contorFila,
  ecranulDinRegistru,
  filaEcranului,
  zonaEcranului,
  type ZonaAdmin,
  type ZonaRegistru,
} from './adminNavigatie';
import { Icon, type NumeIcon } from './controale/Icon';
import { useEsteTelefon } from './controale/useEsteTelefon';

type Props = {
  ecran: EcranAdmin;
  onEcran: (ecran: EcranAdmin) => void;
  faza: FazaSite;
  /** Numărătoarea spre anunț, cât timp n-a trecut. Se vede în Evenimente. */
  countdown: string | null;
  /** Câte semnale cer atenție — numărul de pe zona Acum (R6). */
  atentie: number;
  contorEcran: Record<EcranAdmin, number | null>;
  /** Selectorul de ediție. Cadrul îl pune sub titlu, deasupra filelor (R4). */
  selectorEditie?: ReactNode;
  onLogout: () => void;
  children: ReactNode;
};

const ICON_ZONA: Record<ZonaAdmin, NumeIcon> = {
  acum: 'acum',
  antrenamente: 'antrenamente',
  evenimente: 'evenimente',
  site: 'site',
};

/**
 * Cadrul adminului (U7): antet pe un rând, zonele și filele lor.
 *
 * Desktop: o șină stângă arată deodată toate zonele și filele — tot adminul
 * dintr-o privire, fără lista derulantă „Ecran" de dinainte (R3).
 * Telefon: zonele stau într-o bară de jos, unde ajunge degetul mare, iar
 * filele zonei într-un rând derulabil sub titlu.
 *
 * Semnalele de atenție nu mai stau ca bandă în antet; apar pe Acum și ca
 * număr pe zona Acum (R6). Antetul rămâne un singur rând și pe telefon.
 */
export const AdminCadru = ({
  ecran,
  onEcran,
  faza,
  countdown,
  atentie,
  contorEcran,
  selectorEditie,
  onLogout,
  children,
}: Props) => {
  const telefon = useEsteTelefon();
  const zonaActiva = zonaEcranului(ecran);
  const zona = ZONE.find((z) => z.cheie === zonaActiva) ?? ZONE[0];
  const fila = filaEcranului(ecran);

  /**
   * Ultima filă vizitată în fiecare zonă, cât ține sesiunea (R38). Cine se
   * întoarce în Evenimente după un drum prin Antrenamente vrea înapoi la
   * Participanți, nu la Rezumat.
   */
  const ultima = useRef<Partial<Record<ZonaAdmin, EcranAdmin>>>({});
  useEffect(() => {
    ultima.current[zonaActiva] = ecran;
  }, [ecran, zonaActiva]);

  const mergiLaZona = (z: ZonaRegistru) =>
    onEcran(ultima.current[z.cheie] ?? z.file[0].ecrane[0].cheie);

  const numar = (z: ZonaRegistru) => (z.cheie === 'acum' && atentie > 0 ? atentie : null);

  return (
    <>
      {/* Prima oprire de tabulare pe orice ecran. Fără ea, tastatura trece
          prin antet și prin toată șina înainte să ajungă la treaba pentru care
          ai deschis ecranul. Buton, nu ancoră: fragmentul ține ecranul curent. */}
      <button
        type="button"
        className="admin-sari"
        onClick={() => document.getElementById('ecran')?.focus()}
      >
        Sari la ecran
      </button>

      <div className={`admin-cadru${telefon ? ' admin-cadru--telefon' : ''}`}>
        <header className="admin-antet">
          <span className="admin-logo">
            Run <span className="accent">+</span> Lift
          </span>
          <div className="admin-antet-dreapta">
            {/* Ce vede un vizitator ACUM. Pe telefon nu încape lângă cont fără
                să rupă antetul pe două rânduri. */}
            {!telefon && (
              <a
                className={`admin-faza faza-${faza}`}
                href="/"
                target="_blank"
                rel="noopener noreferrer"
                title="Deschide site-ul public într-un tab nou"
              >
                <span className="admin-faza-punct" aria-hidden="true" />
                <span className="admin-faza-eticheta">Pe site</span>
                <span className="admin-faza-valoare">{ETICHETA_FAZA[faza]}</span>
              </a>
            )}
            <button type="button" className="admin-logout" onClick={onLogout}>
              Ieși din cont
            </button>
          </div>
        </header>

        {!telefon && (
          <nav className="admin-sina" aria-label="Zone și ecrane">
            {ZONE.map((z) => {
              const activa = z.cheie === zonaActiva;
              const faraFile = z.file.length === 1 && z.file[0].ecrane.length === 1;
              return (
                <div key={z.cheie} className="admin-sina-zona">
                  <button
                    type="button"
                    className="admin-sina-zona-buton"
                    aria-current={activa && faraFile ? 'page' : undefined}
                    onClick={() => mergiLaZona(z)}
                  >
                    <Icon nume={ICON_ZONA[z.cheie]} marime={18} />
                    {z.eticheta}
                    {numar(z) !== null && <span className="admin-numar">{numar(z)}</span>}
                  </button>
                  {!faraFile && (
                    <ul className="admin-sina-file">
                      {z.file.map((f) => {
                        const n = contorFila(f, contorEcran);
                        return (
                          <li key={f.cheie}>
                            <button
                              type="button"
                              className="admin-sina-fila"
                              aria-current={f === fila ? 'page' : undefined}
                              onClick={() => onEcran(f.ecrane[0].cheie)}
                            >
                              {f.eticheta}
                              {n !== null && <span className="admin-sina-contor">{n}</span>}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              );
            })}
            <p className="admin-sina-nota">
              Ediția aleasă contează doar în Evenimente. Antrenamentele și site-ul nu depind de ea.
            </p>
          </nav>
        )}

        <main className="admin-main" id="ecran" tabIndex={-1}>
          <header className="admin-zona-cap">
            <h1 className="admin-zona-titlu">{zona.eticheta}</h1>
            {zonaActiva !== 'acum' && (
              <p className="admin-zona-sub">{ecranulDinRegistru(ecran)?.descriere}</p>
            )}
            {zonaActiva === 'evenimente' && countdown && (
              <p className="admin-cd">
                <span className="countdown-dot" />
                {countdown}
              </p>
            )}
          </header>

          {selectorEditie}

          {telefon && zona.file.length > 1 && (
            <nav className="admin-file" aria-label={`Ecrane din ${zona.eticheta}`}>
              {zona.file.map((f) => (
                <button
                  key={f.cheie}
                  type="button"
                  className="admin-fila"
                  aria-current={f === fila ? 'page' : undefined}
                  onClick={() => onEcran(f.ecrane[0].cheie)}
                >
                  {f.eticheta}
                </button>
              ))}
            </nav>
          )}

          {fila.ecrane.length > 1 && (
            <nav className="admin-subfile" aria-label={fila.eticheta}>
              {fila.ecrane.map((e) => (
                <button
                  key={e.cheie}
                  type="button"
                  className="admin-subfila"
                  aria-current={e.cheie === ecran ? 'page' : undefined}
                  onClick={() => onEcran(e.cheie)}
                >
                  {e.eticheta}
                </button>
              ))}
            </nav>
          )}

          {children}
        </main>

        {telefon && (
          <nav className="admin-bara-jos" aria-label="Zone">
            {ZONE.map((z) => (
              <button
                key={z.cheie}
                type="button"
                className="admin-bara-jos-zona"
                aria-current={z.cheie === zonaActiva ? 'page' : undefined}
                onClick={() => mergiLaZona(z)}
              >
                <span className="admin-bara-jos-icon">
                  <Icon nume={ICON_ZONA[z.cheie]} marime={22} />
                </span>
                {z.eticheta}
                {numar(z) !== null && <span className="admin-numar admin-numar--bara">{numar(z)}</span>}
              </button>
            ))}
          </nav>
        )}
      </div>
    </>
  );
};
