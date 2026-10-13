import shared1 from './EvenimenteStyles.module.css';
import type { CSSProperties } from 'react';
import type { AdminWaitlistEntry } from './api';
import { AdminSkeleton } from './AdminSkeleton';
import { ziSiLuna } from '../../../../shared/lib/formatare';

type Props = {
  waitAll: AdminWaitlistEntry[];
  waitlist: AdminWaitlistEntry[] | null;
  /** Capacitatea ediției — poziția pe listă se numără de la ea în sus. */
  TOTAL_SLOTS: number;
  /** Ediție de arhivă: se poate citi, nu se mai poate promova sau șterge. */
  arhiva: boolean;
  /**
   * Rândurile cu o acțiune în zbor. Pe rând, nu global: un rând ocupat n-are de
   * ce să înghețe restul tabelului.
   */
  ocupate: ReadonlySet<string>;
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
  ocupate,
  onPromote,
  onDelete,
}: Props) => (
    <section className="admin-table-section" data-css="admin-table-section">
      <div className={'admin-table-head ' + shared1['admin-wait-head']} data-css="admin-table-head admin-wait-head">
        <h2>
          Lista de așteptare <span className={shared1['admin-wait-count']} data-css="admin-wait-count">{waitAll.length}</span>
        </h2>
        <span className={shared1['admin-wait-note']} data-css="admin-wait-note">
          Se completează automat când locurile sunt pline — promovează când se eliberează un loc.
        </span>
      </div>
      <div className="admin-table-wrap" data-css="admin-table-wrap">
        <div className={`admin-table ${shared1['admin-wait']}${arhiva ? ' arhiva' : ''}`} data-css={`admin-table admin-wait${arhiva ? ' arhiva' : ''}`}>
          <div className={'admin-row ' + shared1['admin-row-head']} data-css="admin-row admin-row-head">
            <span>#</span>
            <span>Nume</span>
            <span>Telefon</span>
            <span>Email</span>
            <span>Înscris</span>
            {!arhiva && <span className="right">Acțiuni</span>}
          </div>
          {waitAll.map((w, i) => (
            <div key={w.id} className="admin-row" data-css="admin-row" style={{ '--i': i } as CSSProperties}>
              <span className={shared1['admin-cell-nr']} data-css="admin-cell-nr">{String(i + 1).padStart(2, '0')}</span>
              <span className="admin-cell-name" data-css="admin-cell-name">{w.nume}</span>
              <a className={shared1['admin-cell-link']} data-css="admin-cell-link" href={`tel:${w.telefon}`}>
                {w.telefon}
              </a>
              <a className={shared1['admin-cell-link'] + ' ellipsis'} data-css="admin-cell-link ellipsis" href={`mailto:${w.email}`}>
                {w.email}
              </a>
              <span className="admin-cell-date" data-css="admin-cell-date">{ziSiLuna(w.created_at)}</span>
              {!arhiva && (
                <div className={shared1['admin-cell-actions']} data-css="admin-cell-actions">
                  <button
                    type="button"
                    className={shared1['admin-btn-promote']} data-css="admin-btn-promote"
                    title="Mută la participanți"
                    disabled={ocupate.has(w.id)}
                    onClick={() => onPromote(w)}
                  >
                    Promovează
                  </button>
                  <button
                    type="button"
                    className={shared1['admin-btn-delete']} data-css="admin-btn-delete"
                    title="Șterge din lista de așteptare"
                    disabled={ocupate.has(w.id)}
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
            <div className={shared1['admin-empty']} data-css="admin-empty">
              Nicio persoană în așteptare. Lista se completează automat când toate cele{' '}
              {TOTAL_SLOTS} locuri sunt ocupate.
            </div>
          )}
        </div>
      </div>
    </section>
);
