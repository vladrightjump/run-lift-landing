import type { CSSProperties } from 'react';
import { useEventConfig } from '../../hooks/useEventConfig';
import { getMySignups } from '../../lib/mySignups';
import type { PublicStats } from '../../lib/supabase';
import { useCountUp } from '../../hooks/useCountUp';
import { SectionHead } from './SectionHead';

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
    <section id="participanti" className="e3-sec e3-people">
      <div className="e3-wrap">
        <SectionHead num={num}>Cine vine</SectionHead>
        <div className="e3-people-head">
          <span className="e3-label">Participanți înscriși</span>
          <span className="e3-num e3-people-count">
            {countShown ?? '–'} / {TOTAL_SLOTS}
          </span>
        </div>
        {/* Lista de start: fiecare înscris e un număr de concurs. Fără
            `data-reveal` pe grilă: rândurile intră singure, unul câte unul
            (`.e3-row-in`), iar un fade pe tot blocul ar dubla intrarea. */}
        <ol className="e3-people-grid">
          {participants.map((p, i) => (
            <li
              key={`${p.nume}-${i}`}
              className="e3-row-in e3-bib"
              style={{ '--i': i } as CSSProperties}
            >
              <span className="e3-num e3-bib-nr">{String(i + 1).padStart(2, '0')}</span>
              <span className="e3-bib-name">{p.nume}</span>
              {mine.has(p.nume) && <span className="e3-bib-new">Nou</span>}
            </li>
          ))}
        </ol>
        {stats && participants.length === 0 && (
          <p className="e3-people-empty">
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
          <div role="status" aria-busy="true" className="e3-people-grid">
            <span className="e3-sr">Se încarcă lista…</span>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="e3-bib e3-bib-skel" aria-hidden="true">
                <span className="e3-skel" style={{ width: 44, height: 28 }} />
                <span className="e3-skel" style={{ width: 90 + i * 18 }} />
              </div>
            ))}
          </div>
        )}
        {waitlistCount > 0 && (
          <div className="e3-people-head e3-people-wait">
            <span className="e3-label">Pe lista de așteptare</span>
            <span className="e3-num e3-people-count">{waitlistCount}</span>
          </div>
        )}
      </div>
    </section>
  );
};
