import { TOTAL_SLOTS } from '../lib/config';
import type { PublicStats } from '../lib/supabase';
import { getMySignups } from '../lib/mySignups';

type Props = {
  stats: PublicStats | null;
};

export const ParticipantsSection = ({ stats }: Props) => {
  const participants = stats?.participants ?? [];
  // Recitit la fiecare render — după un submit reușit stats se schimbă,
  // deci re-render, deci badge-ul apare fără alt mecanism de sincronizare.
  const mine = new Set(getMySignups());

  return (
    <section id="participanti" className="section participants-section">
      <div className="container">
        <div className="section-head" data-reveal>
          <span className="section-num">04</span>
          <h2>Cine vine</h2>
        </div>

        <div className="plist-head">
          <span className="plist-label">Participanți înscriși</span>
          <span className="plist-count">
            {stats ? stats.count : '–'} / {TOTAL_SLOTS}
          </span>
        </div>
        <div className="plist">
          {participants.map((p, i) => (
            <div key={`${p.nume}-${i}`} className="plist-row">
              <span className="plist-nr">{String(i + 1).padStart(2, '0')}</span>
              <span className="plist-name">{p.nume}</span>
              {mine.has(p.nume) && <span className="badge-new">Nou</span>}
            </div>
          ))}
          {stats && participants.length === 0 && (
            <div className="plist-empty">
              Încă nimeni înscris — fii primul! <a href="#inscriere">Înscrie-te</a>
            </div>
          )}
          {!stats && <div className="plist-empty">Se încarcă lista…</div>}
        </div>
      </div>
    </section>
  );
};
