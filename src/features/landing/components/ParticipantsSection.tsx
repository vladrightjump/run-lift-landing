import shared4 from '../../../shared/ui/PublicMotion.module.css';
import shared3 from './LandingStyles.module.css';
import styles from './ParticipantsSection.module.css';
import shared1 from '../../../shared/ui/PublicLayout.module.css';
import type { CSSProperties } from 'react';
import { useEventConfig } from '../../../shared/lib/useEventConfig';
import { getMySignups } from '../../../shared/lib/mySignups';
import type { PublicStats } from '../../inscriere';
import { useCountUp } from '../../../shared/lib/useCountUp';
import { SectionHead } from '../../../shared/ui/SectionHead';

type Props = {
  stats: PublicStats | null;
  /**
   * `false` scoate invitația „fii primul" din starea goală — în fereastra din
   * ziua cursei nu mai există secțiunea de înscriere spre care să trimită.
   */
  canSignUp?: boolean;
  /** Numărul afișat al secțiunii — se schimbă când ordinea secțiunilor se schimbă. */
  num?: string;
};

/** Secțiunea „Cine vine": lista publică de participanți + contorul listei de așteptare. */
export const ParticipantsSection = ({ stats, canSignUp = true, num = '04' }: Props) => {
  const TOTAL_SLOTS = useEventConfig().slots.total;
  const participants = stats?.participants ?? [];
  const mine = new Set(getMySignups());
  const waitlistCount = stats?.waitlist ?? 0;
  // Contorul urcă spre numărul real în loc să apară dintr-odată.
  const countShown = useCountUp(stats ? stats.count : null);
  return (
    <section id="participanti" className={shared1['e3-sec']} data-css={"e3-sec e3-people"}>
      <div className={shared1['e3-wrap']} data-css={"e3-wrap"}>
        <SectionHead num={num}>Cine vine</SectionHead>
        <div className={styles['e3-people-head']} data-css={"e3-people-head"}>
          <span className={shared3['e3-label']} data-css={"e3-label"}>Participanți înscriși</span>
          <span className={shared1['e3-num'] + ' ' + styles['e3-people-count']} data-css={"e3-num e3-people-count"}>
            {countShown ?? '–'} / {TOTAL_SLOTS}
          </span>
        </div>
        {/* Lista de start: fiecare înscris e un număr de concurs. Fără
            `data-reveal` pe grilă: rândurile intră singure, unul câte unul
            (`.e3-row-in`), iar un fade pe tot blocul ar dubla intrarea. */}
        <ol className={styles['e3-people-grid']} data-css={"e3-people-grid"}>
          {participants.map((p, i) => (
            <li
              key={`${p.nume}-${i}`}
              className={styles['e3-row-in'] + ' ' + styles['e3-bib']} data-css={"e3-row-in e3-bib"}
              style={{ '--i': i } as CSSProperties}
            >
              <span className={shared1['e3-num'] + ' ' + styles['e3-bib-nr']} data-css={"e3-num e3-bib-nr"}>{String(i + 1).padStart(2, '0')}</span>
              <span className={styles['e3-bib-name']} data-css={"e3-bib-name"}>{p.nume}</span>
              {mine.has(p.nume) && <span className={styles['e3-bib-new']} data-css={"e3-bib-new"}>Nou</span>}
            </li>
          ))}
        </ol>
        {stats && participants.length === 0 && (
          <p className={styles['e3-people-empty']} data-css={"e3-people-empty"}>
            {canSignUp ? (
              <>
                Încă nimeni înscris. Fii primul!{' '}
                <a href="#inscriere">Înscrie-te</a>
              </>
            ) : (
              'Nicio înscriere pentru ediția asta.'
            )}
          </p>
        )}
        {!stats && (
          <div role="status" aria-busy="true" className={styles['e3-people-grid']} data-css={"e3-people-grid"}>
            <span className={shared4['e3-sr']} data-css={"e3-sr"}>Se încarcă lista…</span>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className={styles['e3-bib'] + ' ' + styles['e3-bib-skel']} data-css={"e3-bib e3-bib-skel"} aria-hidden="true">
                <span className={styles['e3-skel'] + ' ' + styles.text1} data-css={"e3-skel"}  />
                <span className={styles['e3-skel']} data-css={"e3-skel"} style={{ width: 90 + i * 18 }} />
              </div>
            ))}
          </div>
        )}
        {waitlistCount > 0 && (
          <div className={styles['e3-people-head'] + ' ' + styles['e3-people-wait']} data-css={"e3-people-head e3-people-wait"}>
            <span className={shared3['e3-label']} data-css={"e3-label"}>Pe lista de așteptare</span>
            <span className={shared1['e3-num'] + ' ' + styles['e3-people-count']} data-css={"e3-num e3-people-count"}>{waitlistCount}</span>
          </div>
        )}
      </div>
    </section>
  );
};
