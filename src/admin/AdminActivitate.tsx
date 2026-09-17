import type { AdminEvent } from '../lib/adminApi';
import { AdminFeedSkeleton } from './AdminSkeleton';
import { activitateVizibila } from './dashboardRezumate';
import { ziLunaOra } from '../lib/formatare';

/**
 * „Activitate recentă" — ce s-a întâmplat în backoffice FĂRĂ organizator.
 *
 * Trăia în mijlocul lui `AdminDashboard`, deși nu are nevoie decât de lista de
 * evenimente: nicio stare, niciun handler, niciun context. Era exact genul de
 * bucată pe care o sari de fiecare dată când cauți altceva în fișier.
 *
 * Feed-ul e comun tuturor edițiilor, deci nu primește `editie`.
 */
export const AdminActivitate = ({ events }: { events: AdminEvent[] | null }) => (
    <section className="admin-table-section">
      <div className="admin-table-head admin-wait-head">
        <h2>
          Activitate recentă{' '}
          <span className="admin-wait-count">{(events ?? []).length}</span>
        </h2>
        <span className="admin-wait-note">
          Renunțări din linkul de email, promovări automate din lista de așteptare (când se
          eliberează un loc, se umple singur) și deschiderea edițiilor noi. Feed-ul e comun
          tuturor edițiilor.
        </span>
      </div>
      <div className="admin-activity">
        {(events ?? [])
          .filter(activitateVizibila)
          .map((e) => {
            if (e.tip === 'editie_noua') {
              const ed = e.detaliu?.editie;
              return (
                <div key={e.id} className="admin-activity-item">
                  <span className="admin-activity-dot" />
                  <span className="admin-activity-text">
                    S-a deschis <strong>ediția {typeof ed === 'number' ? ed : '?'}</strong> —
                    înscrierile noi intră aici
                  </span>
                  <span className="admin-activity-time">{ziLunaOra(e.created_at)}</span>
                </div>
              );
            }
            const nume = typeof e.detaliu?.nume === 'string' ? e.detaliu.nume : 'Cineva';
            const email = typeof e.detaliu?.email === 'string' ? e.detaliu.email : '';
            const emailed = e.detaliu?.email_queued === true;

            // Renunțarea vine mereu însoțită, în aceeași secundă, de un
            // `auto_promote` — dacă era cineva pe listă. Nu le comasăm:
            // sunt două fapte, iar cel de-al doilea poate să LIPSEASCĂ
            // (listă goală), caz în care locul rămâne liber și trebuie văzut.
            if (e.tip === 'renuntare') {
              return (
                <div key={e.id} className="admin-activity-item">
                  <span className="admin-activity-dot" />
                  <span className="admin-activity-text">
                    <strong>{nume}</strong> a renunțat la loc, din linkul din email
                    {email && <span className="admin-activity-email"> · {email}</span>}
                  </span>
                  <span className="admin-activity-time">{ziLunaOra(e.created_at)}</span>
                </div>
              );
            }

            return (
              <div key={e.id} className="admin-activity-item">
                <span className="admin-activity-dot" />
                <span className="admin-activity-text">
                  <strong>{nume}</strong> promovat automat din așteptare
                  {email && <span className="admin-activity-email"> · {email}</span>}
                </span>
                <span
                  className={`admin-activity-mail${emailed ? ' ok' : ''}`}
                  title={emailed ? 'Email de confirmare trimis' : 'Emailul nu a plecat'}
                >
                  {emailed ? '✉ trimis' : '✉ eșuat'}
                </span>
                <span className="admin-activity-time">{ziLunaOra(e.created_at)}</span>
              </div>
            );
          })}
        {events === null && <AdminFeedSkeleton />}
        {events !== null && (events ?? []).filter(activitateVizibila).length === 0 && (
          <div className="admin-empty">Nicio activitate încă.</div>
        )}
      </div>
    </section>
);
