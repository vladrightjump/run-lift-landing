import shared1 from './AdminStyles.module.css';
import styles from './AdminCadru.module.css';
import { useEffect, useRef, type ReactNode } from 'react';
import type { EcranAdmin, FazaSite } from '../../../admin/stareCurenta';
import { ETICHETA_FAZA } from '../../../admin/stareCurenta';
import {
  ZONE,
  contorFila,
  ecranulDinRegistru,
  filaEcranului,
  zonaEcranului,
  type ZonaAdmin,
  type ZonaRegistru,
} from '../navigatie/adminNavigatie';
import { Icon, type NumeIcon } from '../../../shared/ui/Icon';
import { useEsteTelefon } from '../../../shared/ui/useEsteTelefon';

export type PropsCadru = {
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

/** Fazele cu culoare proprie pe chip; „după cursă" rămâne pe culoarea de bază. */
const CLASA_FAZA: Partial<Record<FazaSite, string>> = {
  landing: styles['faza-landing'],
  'cine-vine': styles['faza-cine-vine'],
  'coming-soon': styles['faza-coming-soon'],
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
}: PropsCadru) => {
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
        className={styles['admin-sari']} data-css={"admin-sari"}
        onClick={() => document.getElementById('ecran')?.focus()}
      >
        Sari la ecran
      </button>

      <div
        className={styles['admin-cadru'] + (telefon ? ' ' + styles['admin-cadru--telefon'] : '')}
        data-css={`admin-cadru${telefon ? ' admin-cadru--telefon' : ''}`}
      >
        <header className={styles['admin-antet']} data-css={"admin-antet"}>
          <span className={shared1['admin-logo']} data-css={"admin-logo"}>
            Run <span className={shared1['accent']} data-css={"accent"}>+</span> Lift
          </span>
          <div className={styles['admin-antet-dreapta']} data-css={"admin-antet-dreapta"}>
            {/* Ce vede un vizitator ACUM. Pe telefon nu încape lângă cont fără
                să rupă antetul pe două rânduri. */}
            {!telefon && (
              <a
                className={styles['admin-faza'] + (CLASA_FAZA[faza] ? ' ' + CLASA_FAZA[faza] : '')}
                data-css={`admin-faza faza-${faza}`}
                href="/"
                target="_blank"
                rel="noopener noreferrer"
                title="Deschide site-ul public într-un tab nou"
              >
                <span className={styles['admin-faza-punct']} data-css={"admin-faza-punct"} aria-hidden="true" />
                <span className={styles['admin-faza-eticheta']} data-css={"admin-faza-eticheta"}>Pe site</span>
                <span className={styles['admin-faza-valoare']} data-css={"admin-faza-valoare"}>{ETICHETA_FAZA[faza]}</span>
              </a>
            )}
            <button type="button" className={styles['admin-logout']} data-css={"admin-logout"} onClick={onLogout}>
              Ieși din cont
            </button>
          </div>
        </header>

        {!telefon && (
          <nav className={styles['admin-sina']} data-css={"admin-sina"} aria-label="Zone și ecrane">
            {ZONE.map((z) => {
              const activa = z.cheie === zonaActiva;
              const faraFile = z.file.length === 1 && z.file[0].ecrane.length === 1;
              return (
                <div key={z.cheie} className={styles['admin-sina-zona']} data-css={"admin-sina-zona"}>
                  <button
                    type="button"
                    className={styles['admin-sina-zona-buton']} data-css={"admin-sina-zona-buton"}
                    aria-current={activa && faraFile ? 'page' : undefined}
                    onClick={() => mergiLaZona(z)}
                  >
                    <Icon nume={ICON_ZONA[z.cheie]} marime={18} />
                    {z.eticheta}
                    {numar(z) !== null && <span className={shared1['admin-numar']} data-css={"admin-numar"}>{numar(z)}</span>}
                  </button>
                  {!faraFile && (
                    <ul className={styles['admin-sina-file']} data-css={"admin-sina-file"}>
                      {z.file.map((f) => {
                        const n = contorFila(f, contorEcran);
                        return (
                          <li key={f.cheie}>
                            <button
                              type="button"
                              className={styles['admin-sina-fila']} data-css={"admin-sina-fila"}
                              aria-current={f === fila ? 'page' : undefined}
                              onClick={() => onEcran(f.ecrane[0].cheie)}
                            >
                              {f.eticheta}
                              {n !== null && <span className={styles['admin-sina-contor']} data-css={"admin-sina-contor"}>{n}</span>}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              );
            })}
            <p className={styles['admin-sina-nota']} data-css={"admin-sina-nota"}>
              Ediția aleasă contează doar în Evenimente. Antrenamentele și site-ul nu depind de ea.
            </p>
          </nav>
        )}

        <main className={styles['admin-main']} data-css={"admin-main"} id="ecran" tabIndex={-1}>
          <header className={styles['admin-zona-cap']} data-css={"admin-zona-cap"}>
            <h1 className={styles['admin-zona-titlu']} data-css={"admin-zona-titlu"}>{zona.eticheta}</h1>
            {zonaActiva !== 'acum' && (
              <p className={styles['admin-zona-sub']} data-css={"admin-zona-sub"}>{ecranulDinRegistru(ecran)?.descriere}</p>
            )}
            {zonaActiva === 'evenimente' && countdown && (
              <p className={styles['admin-cd']} data-css={"admin-cd"}>
                <span className="countdown-dot" />
                {countdown}
              </p>
            )}
          </header>

          {selectorEditie}

          {telefon && zona.file.length > 1 && (
            <nav className={styles['admin-file']} data-css={"admin-file"} aria-label={`Ecrane din ${zona.eticheta}`}>
              {zona.file.map((f) => (
                <button
                  key={f.cheie}
                  type="button"
                  className={styles['admin-fila']} data-css={"admin-fila"}
                  aria-current={f === fila ? 'page' : undefined}
                  onClick={() => onEcran(f.ecrane[0].cheie)}
                >
                  {f.eticheta}
                </button>
              ))}
            </nav>
          )}

          {fila.ecrane.length > 1 && (
            <nav className={styles['admin-subfile']} data-css={"admin-subfile"} aria-label={fila.eticheta}>
              {fila.ecrane.map((e) => (
                <button
                  key={e.cheie}
                  type="button"
                  className={styles['admin-subfila']} data-css={"admin-subfila"}
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
          <nav className={styles['admin-bara-jos']} data-css={"admin-bara-jos"} aria-label="Zone">
            {ZONE.map((z) => (
              <button
                key={z.cheie}
                type="button"
                className={styles['admin-bara-jos-zona']} data-css={"admin-bara-jos-zona"}
                aria-current={z.cheie === zonaActiva ? 'page' : undefined}
                onClick={() => mergiLaZona(z)}
              >
                <span className={styles['admin-bara-jos-icon']} data-css={"admin-bara-jos-icon"}>
                  <Icon nume={ICON_ZONA[z.cheie]} marime={22} />
                </span>
                {z.eticheta}
                {numar(z) !== null && <span className={shared1['admin-numar'] + ' ' + styles['admin-numar--bara']} data-css={"admin-numar admin-numar--bara"}>{numar(z)}</span>}
              </button>
            ))}
          </nav>
        )}
      </div>
    </>
  );
};
