import shared1 from '../../../shared/ui/PublicLayout.module.css';
import styles from './FormatSection.module.css';
import { useId, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { ETAPE } from '../../../shared/content/etape';
import { SectionHead } from '../../../shared/ui/SectionHead';

type Props = {
  /** Numărul afișat al secțiunii — se schimbă când ordinea secțiunilor se schimbă. */
  num?: string;
};

/**
 * Secțiunea „Formatul" ca explorator: RUN / LIFT / REPEAT sunt tab-uri, iar
 * panoul arată ce face participantul în etapa aleasă.
 *
 * Modelul e WAI-ARIA Tabs cu activare automată: selecția se schimbă la
 * atingere, click sau tastă, niciodată la hover, deci se comportă la fel pe
 * telefon și pe desktop. Săgețile ciclează, Home/End sar la capete, iar doar
 * tab-ul selectat e în ordinea Tab.
 *
 * Toate panourile se randează în aceeași celulă de grilă, iar cele
 * neselectate sunt doar ascunse vizual: înălțimea rămâne a celui mai lung,
 * deci pagina nu sare când schimbi etapa.
 */
export const FormatSection = ({ num = '01' }: Props) => {
  const [ales, setAles] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const baza = useId();
  const idTab = (i: number) => `${baza}-tab-${i}`;
  const idPanou = `${baza}-panou`;

  const alege = (i: number) => {
    setAles(i);
    tabs.current[i]?.focus();
  };

  const laTasta = (e: KeyboardEvent<HTMLButtonElement>) => {
    const n = ETAPE.length;
    const tinta =
      e.key === 'ArrowRight' ? (ales + 1) % n
      : e.key === 'ArrowLeft' ? (ales - 1 + n) % n
      : e.key === 'Home' ? 0
      : e.key === 'End' ? n - 1
      : null;
    if (tinta === null) return;
    e.preventDefault();
    alege(tinta);
  };

  return (
    <section className={shared1['e3-sec']} data-css={"e3-sec e3-format"}>
      <div className={shared1['e3-wrap']} data-css={"e3-wrap"}>
        <div className={styles.introduction}>
          <SectionHead num={num}>Formatul</SectionHead>
          <p className={shared1['e3-lead']} data-css="e3-lead e3-format-intro">
            Aleargă. Ridică. Repetă. Segmente de alergare alternate cu stații de exerciții funcționale, în
            stil HYROX. Fără trucuri: doar tu, cronometrul și traseul. Stațiile și greutățile se adaptează
            nivelului tău de către antrenori la fața locului.
          </p>
        </div>

        <div className={styles['e3-format-tabs']} data-css={"e3-format-tabs"} role="tablist" aria-label="Etapele cursei">
          {ETAPE.map((etapa, i) => (
            <button
              key={etapa.nume}
              ref={(el) => {
                tabs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={idTab(i)}
              aria-selected={ales === i}
              aria-controls={idPanou}
              tabIndex={ales === i ? 0 : -1}
              className={styles['e3-format-tab']} data-css={"e3-format-tab"}
              onClick={() => setAles(i)}
              onKeyDown={laTasta}
            >
              <span className={shared1['e3-num'] + ' ' + styles['e3-format-tab-nr']} data-css={"e3-num e3-format-tab-nr"} aria-hidden="true">
                {String(i + 1).padStart(2, '0')}
              </span>
              <span className={styles['e3-format-tab-name']} data-css={"e3-format-tab-name"}>{etapa.nume}</span>
            </button>
          ))}
        </div>

        <div className={styles.sequence} data-css="format-sequence">
          <div className={styles.visual} aria-hidden="true">
            <img
              key={ales}
              className={styles.photo}
              src={`/landing/${ETAPE[ales].nume.toLowerCase()}.webp`}
              alt=""
              width={800}
              height={450}
              loading="lazy"
              decoding="async"
              data-css="format-photo"
            />
          </div>
          <div className={styles['e3-format-stage']} data-css={"e3-format-stage"}>
            {ETAPE.map((etapa, i) =>
              i === ales ? (
                <div
                  key={etapa.nume}
                  role="tabpanel"
                  id={idPanou}
                  aria-labelledby={idTab(i)}
                  className={styles['e3-format-panel']} data-css="e3-format-panel"
                >
                  <Continut intro={etapa.intro} detalii={etapa.detalii} />
                </div>
              ) : (
                // Copia invizibilă rezervă înălțimea celui mai lung panou.
                <div
                  key={etapa.nume}
                  className={`${styles['e3-format-panel']} ${styles['e3-format-ghost']}`}
                  data-css="e3-format-panel e3-format-ghost"
                  aria-hidden="true"
                >
                  <Continut intro={etapa.intro} detalii={etapa.detalii} />
                </div>
              )
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

const Continut = ({ intro, detalii }: { intro: string; detalii: string[] }) => (
  <>
    <p className={styles['e3-format-panel-intro']} data-css={"e3-format-panel-intro"}>{intro}</p>
    <ul className={styles['e3-format-list']} data-css={"e3-format-list"}>
      {detalii.map((d) => (
        <li key={d}>{d}</li>
      ))}
    </ul>
  </>
);
