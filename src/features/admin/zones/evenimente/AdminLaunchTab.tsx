import shared1 from './EvenimenteStyles.module.css';
import styles from './AdminLaunchTab.module.css';
import { useState } from 'react';
import { toCsv } from '../../../../lib/csv';
import { listLaunchNotifications } from './api';
import { useEventConfig } from '../../../../shared/lib/useEventConfig';
import { useAdminResource } from '../../data/useAdminResource';
import { ziSiLuna } from '../../../../shared/lib/formatare';

export const AdminLaunchTab = () => {
  // Din configul publicat, nu din bundle — vezi nota din AdminDashboard.
  const CURRENT_LAUNCH_EDITION = useEventConfig().launchNumber;
  const [query, setQuery] = useState('');
  const [showAllEditions, setShowAllEditions] = useState(false);
  const [sursa, setSursa] = useState<'toate' | 'lansare' | 'despre-noi'>('toate');

  const { date: rows, eroare: loadError } = useAdminResource(listLaunchNotifications);

  const rowsAll = rows ?? [];
  // Lista e per-ediție: implicit arătăm doar ediția curentă, dar arhiva
  // ediților anterioare rămâne accesibilă din selector.
  const all = showAllEditions
    ? rowsAll
    : rowsAll.filter((r) => r.editie === CURRENT_LAUNCH_EDITION);
  const previous = rowsAll.length - rowsAll.filter((r) => r.editie === CURRENT_LAUNCH_EDITION).length;

  const dupaSursa = sursa === 'toate' ? all : all.filter((r) => r.sursa === sursa);
  const nrLansare = all.filter((r) => r.sursa === 'lansare').length;
  const nrDespreNoi = all.filter((r) => r.sursa === 'despre-noi').length;

  const q = query.trim().toLowerCase();
  const filtered = dupaSursa.filter(
    (r) => !q || `${r.nume} ${r.prenume} ${r.telefon} ${r.email}`.toLowerCase().includes(q)
  );

  const exportCsv = () => {
    const header = ['Nr', 'Nume', 'Prenume', 'Telefon', 'Email', 'Data', 'Ediție', 'Sursă', 'Confirmat'];
    const lines = dupaSursa.map((r, i) => [
      String(i + 1),
      r.nume,
      r.prenume,
      r.telefon,
      r.email,
      new Date(r.created_at).toLocaleString('ro-RO'),
      String(r.editie),
      r.sursa,
      r.confirmat_la ? new Date(r.confirmat_la).toLocaleString('ro-RO') : 'nu',
    ]);
    const csv = toCsv([header, ...lines]);
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = showAllEditions
      ? 'run-lift-lansare-toate-editiile.csv'
      : `run-lift-lansare-editia-${CURRENT_LAUNCH_EDITION}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <section className={`admin-table-section${showAllEditions ? ' show-editions' : ''}`} data-css={`admin-table-section${showAllEditions ? ' show-editions' : ''}`}>
      <div className="admin-stats" data-css="admin-stats">
        <div className="admin-stat" data-css="admin-stat">
          <span className="admin-stat-label" data-css="admin-stat-label">
            {showAllEditions
              ? 'Înscriși la notificare · toate edițiile'
              : `Înscriși la notificare · ediția ${CURRENT_LAUNCH_EDITION}`}
          </span>
          <span className="admin-stat-value accent" data-css="admin-stat-value accent" key={dupaSursa.length}>
            {dupaSursa.length}
          </span>
        </div>
        <div className="admin-stat" data-css="admin-stat">
          <span className="admin-stat-label" data-css="admin-stat-label">De la „Anunță-mă”</span>
          <span className="admin-stat-value" data-css="admin-stat-value">{nrLansare}</span>
        </div>
        <div className="admin-stat" data-css="admin-stat">
          <span className="admin-stat-label" data-css="admin-stat-label">De la „Află mai multe”</span>
          <span className="admin-stat-value" data-css="admin-stat-value">{nrDespreNoi}</span>
        </div>
        <div className="admin-stat" data-css="admin-stat">
          <span className="admin-stat-label" data-css="admin-stat-label">Confirmați (primesc emailuri)</span>
          <span className="admin-stat-value accent" data-css="admin-stat-value accent">
            {dupaSursa.filter((r) => r.confirmat_la).length}
          </span>
        </div>
        {previous > 0 && (
          <div className="admin-stat" data-css="admin-stat">
            <span className="admin-stat-label" data-css="admin-stat-label">Ediții anterioare</span>
            <span className="admin-stat-value" data-css="admin-stat-value">{previous}</span>
          </div>
        )}
      </div>

      <div className={shared1['admin-sursa-tabs']} data-css="admin-sursa-tabs">
        {(
          [
            ['toate', 'Toate'],
            ['lansare', 'Anunță-mă la lansare'],
            ['despre-noi', 'Află mai multe'],
          ] as const
        ).map(([val, eticheta]) => (
          <button
            key={val}
            type="button"
            className={`admin-sursa-tab${sursa === val ? ' activ' : ''}`} data-css={`admin-sursa-tab${sursa === val ? ' activ' : ''}`}
            onClick={() => setSursa(val)}
          >
            {eticheta}
          </button>
        ))}
      </div>

      <div className="admin-table-head" data-css="admin-table-head">
        <h2>Anunță-mă la lansare</h2>
        <div className="admin-table-actions" data-css="admin-table-actions">
          {previous > 0 && (
            <button
              type="button"
              className="admin-btn-ghost" data-css="admin-btn-ghost"
              onClick={() => setShowAllEditions((v) => !v)}
            >
              {showAllEditions
                ? `Doar ediția ${CURRENT_LAUNCH_EDITION}`
                : 'Arată toate edițiile'}
            </button>
          )}
          <input
            type="text"
            className={shared1['admin-search']} data-css="admin-search"
            placeholder="Caută nume, telefon, email…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button type="button" className="admin-btn-accent" data-css="admin-btn-accent" onClick={exportCsv}>
            Export CSV
          </button>
        </div>
      </div>

      <div className="admin-table-wrap" data-css="admin-table-wrap">
        <div className="admin-table" data-css="admin-table">
          <div className={'admin-row ' + shared1['admin-row-head']} data-css="admin-row admin-row-head">
            <span>#</span>
            <span>Nume</span>
            <span>Prenume</span>
            <span>Telefon</span>
            <span>Email</span>
            <span>Data</span>
            <span>Conf.</span>
            {showAllEditions && <span>Ed.</span>}
          </div>
          {filtered.map((r, i) => (
            <div key={r.id} className="admin-row" data-css="admin-row">
              <span className={shared1['admin-cell-nr']} data-css="admin-cell-nr">{String(i + 1).padStart(2, '0')}</span>
              <span className="admin-cell-name" data-css="admin-cell-name">{r.nume}</span>
              <span className="admin-cell-name" data-css="admin-cell-name">{r.prenume}</span>
              <a className={shared1['admin-cell-link']} data-css="admin-cell-link" href={`tel:${r.telefon}`}>
                {r.telefon}
              </a>
              <a className={shared1['admin-cell-link'] + ' ellipsis'} data-css="admin-cell-link ellipsis" href={`mailto:${r.email}`}>
                {r.email}
              </a>
              <span className="admin-cell-date" data-css="admin-cell-date">{ziSiLuna(r.created_at)}</span>
              <span
                className={`${styles['admin-conf']}${r.confirmat_la ? ' da' : ''}`} data-css={`admin-conf${r.confirmat_la ? ' da' : ''}`}
                title={
                  r.confirmat_la
                    ? `Confirmat: ${new Date(r.confirmat_la).toLocaleString('ro-RO')}`
                    : 'Neconfirmat — nu primește emailuri'
                }
              >
                {r.confirmat_la ? '✓' : '—'}
              </span>
              {showAllEditions && <span className="admin-cell-date" data-css="admin-cell-date">{r.editie}</span>}
            </div>
          ))}
          {rows === null && !loadError && <div className={shared1['admin-empty']} data-css="admin-empty">Se încarcă…</div>}
          {rows === null && loadError && (
            <div className={shared1['admin-empty']} data-css="admin-empty">Nu am putut încărca lista. Reîncercăm automat.</div>
          )}
          {rows !== null && filtered.length === 0 && (
            <div className={shared1['admin-empty']} data-css="admin-empty">
              {query
                ? 'Nicio potrivire pentru căutarea ta.'
                : showAllEditions
                  ? 'Nicio înscriere la notificare încă.'
                  : `Nicio înscriere pentru ediția ${CURRENT_LAUNCH_EDITION} încă.`}
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
