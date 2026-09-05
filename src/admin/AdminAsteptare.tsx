import type { CSSProperties } from 'react';
import type { AdminWaitlistEntry } from '../lib/adminApi';
import { AdminSkeleton } from './AdminSkeleton';
import { ziSiLuna } from '../lib/formatare';

type Props = {
  waitAll: AdminWaitlistEntry[];
  waitlist: AdminWaitlistEntry[] | null;
  /** Capacitatea ediției — poziția pe listă se numără de la ea în sus. */
  TOTAL_SLOTS: number;
  /** Ediție de arhivă: se poate citi, nu se mai poate promova sau șterge. */
  arhiva: boolean;
  onPromote: (w: AdminWaitlistEntry) => void;
  onDelete: (w: AdminWaitlistEntry) => void;
};

/**
 * Lista de așteptare a ediției.
 *
 * Se completează singură când locurile sunt pline, iar organizatorul promovează
 * de aici când se eliberează unul. Tabelul e independent de restul
 * dashboard-ului: primește rândurile și două acțiuni, nimic altceva.
 */
export const AdminAsteptare = ({
  waitAll,
  waitlist,
  TOTAL_SLOTS,
  arhiva,
  onPromote,
  onDelete,
}: Props) => (
    <section className="admin-table-section">
      <div className="admin-table-head admin-wait-head">
        <h2>
          Lista de așteptare <span className="admin-wait-count">{waitAll.length}</span>
        </h2>
        <span className="admin-wait-note">
          Se completează automat când locurile sunt pline — promovează când se eliberează un loc.
        </span>
      </div>
      <div className="admin-table-wrap">
        <div className={`admin-table admin-wait${arhiva ? ' arhiva' : ''}`}>
          <div className="admin-row admin-row-head">
            <span>#</span>
            <span>Nume</span>
            <span>Telefon</span>
            <span>Email</span>
            <span>Înscris</span>
            {!arhiva && <span className="right">Acțiuni</span>}
          </div>
          {waitAll.map((w, i) => (
            <div key={w.id} className="admin-row" style={{ '--i': i } as CSSProperties}>
              <span className="admin-cell-nr">{String(i + 1).padStart(2, '0')}</span>
              <span className="admin-cell-name">{w.nume}</span>
              <a className="admin-cell-link" href={`tel:${w.telefon}`}>
                {w.telefon}
              </a>
              <a className="admin-cell-link ellipsis" href={`mailto:${w.email}`}>
                {w.email}
              </a>
              <span className="admin-cell-date">{ziSiLuna(w.created_at)}</span>
              {!arhiva && (
                <div className="admin-cell-actions">
                  <button
                    type="button"
                    className="admin-btn-promote"
                    title="Mută la participanți"
                    onClick={() => onPromote(w)}
                  >
                    Promovează
                  </button>
                  <button
                    type="button"
                    className="admin-btn-delete"
                    title="Șterge din lista de așteptare"
                    onClick={() => onDelete(w)}
                  >
                    Șterge
                  </button>
                </div>
              )}
            </div>
          ))}
          {waitlist === null && <AdminSkeleton cols={arhiva ? 5 : 6} rows={3} />}
          {waitlist !== null && waitAll.length === 0 && (
            <div className="admin-empty">
              Nicio persoană în așteptare. Lista se completează automat când toate cele{' '}
              {TOTAL_SLOTS} locuri sunt ocupate.
            </div>
          )}
        </div>
      </div>
    </section>
);
