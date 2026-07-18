import { useCallback, useEffect, useRef, useState } from 'react';
import { listLaunchNotifications } from '../lib/adminApi';
import type { AdminLaunchSignup } from '../lib/adminApi';
import { CURRENT_LAUNCH_EDITION } from '../lib/config';

type Props = {
  token: string;
  formatDate: (iso: string) => string;
  onAuthError: (err: unknown) => boolean;
};

const REFRESH_MS = 15_000;

export const AdminLaunchTab = ({ token, formatDate, onAuthError }: Props) => {
  const [rows, setRows] = useState<AdminLaunchSignup[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [query, setQuery] = useState('');
  const [showAllEditions, setShowAllEditions] = useState(false);
  const [sursa, setSursa] = useState<'toate' | 'lansare' | 'despre-noi'>('toate');
  const abortRef = useRef<AbortController | null>(null);
  const rowsRef = useRef<AdminLaunchSignup[] | null>(null);
  rowsRef.current = rows;

  const refresh = useCallback(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    listLaunchNotifications(token, controller.signal)
      .then((data) => {
        setRows(data);
        setLoadError(false);
      })
      .catch((err) => {
        if (controller.signal.aborted || onAuthError(err)) return;
        setLoadError((prev) => prev || rowsRef.current === null);
      });
  }, [token, onAuthError]);

  useEffect(() => {
    refresh();
    const id = window.setInterval(refresh, REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      abortRef.current?.abort();
    };
  }, [refresh]);

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
    const csv = [header, ...lines]
      .map((cells) => cells.map((c) => `"${c.replace(/"/g, '""')}"`).join(','))
      .join('\n');
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
    <section className={`admin-table-section${showAllEditions ? ' show-editions' : ''}`}>
      <div className="admin-stats">
        <div className="admin-stat">
          <span className="admin-stat-label">
            {showAllEditions
              ? 'Înscriși la notificare · toate edițiile'
              : `Înscriși la notificare · ediția ${CURRENT_LAUNCH_EDITION}`}
          </span>
          <span className="admin-stat-value accent" key={dupaSursa.length}>
            {dupaSursa.length}
          </span>
        </div>
        <div className="admin-stat">
          <span className="admin-stat-label">De la „Anunță-mă”</span>
          <span className="admin-stat-value">{nrLansare}</span>
        </div>
        <div className="admin-stat">
          <span className="admin-stat-label">De la „Află mai multe”</span>
          <span className="admin-stat-value">{nrDespreNoi}</span>
        </div>
        <div className="admin-stat">
          <span className="admin-stat-label">Confirmați (primesc emailuri)</span>
          <span className="admin-stat-value accent">
            {dupaSursa.filter((r) => r.confirmat_la).length}
          </span>
        </div>
        {previous > 0 && (
          <div className="admin-stat">
            <span className="admin-stat-label">Ediții anterioare</span>
            <span className="admin-stat-value">{previous}</span>
          </div>
        )}
      </div>

      <div className="admin-sursa-tabs">
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
            className={`admin-sursa-tab${sursa === val ? ' activ' : ''}`}
            onClick={() => setSursa(val)}
          >
            {eticheta}
          </button>
        ))}
      </div>

      <div className="admin-table-head">
        <h2>Anunță-mă la lansare</h2>
        <div className="admin-table-actions">
          {previous > 0 && (
            <button
              type="button"
              className="admin-btn-ghost"
              onClick={() => setShowAllEditions((v) => !v)}
            >
              {showAllEditions
                ? `Doar ediția ${CURRENT_LAUNCH_EDITION}`
                : 'Arată toate edițiile'}
            </button>
          )}
          <input
            type="text"
            className="admin-search"
            placeholder="Caută nume, telefon, email…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button type="button" className="admin-btn-accent" onClick={exportCsv}>
            Export CSV
          </button>
        </div>
      </div>

      <div className="admin-table-wrap">
        <div className="admin-table">
          <div className="admin-row admin-row-head">
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
            <div key={r.id} className="admin-row">
              <span className="admin-cell-nr">{String(i + 1).padStart(2, '0')}</span>
              <span className="admin-cell-name">{r.nume}</span>
              <span className="admin-cell-name">{r.prenume}</span>
              <a className="admin-cell-link" href={`tel:${r.telefon}`}>
                {r.telefon}
              </a>
              <a className="admin-cell-link ellipsis" href={`mailto:${r.email}`}>
                {r.email}
              </a>
              <span className="admin-cell-date">{formatDate(r.created_at)}</span>
              <span
                className={`admin-conf${r.confirmat_la ? ' da' : ''}`}
                title={
                  r.confirmat_la
                    ? `Confirmat: ${new Date(r.confirmat_la).toLocaleString('ro-RO')}`
                    : 'Neconfirmat — nu primește emailuri'
                }
              >
                {r.confirmat_la ? '✓' : '—'}
              </span>
              {showAllEditions && <span className="admin-cell-date">{r.editie}</span>}
            </div>
          ))}
          {rows === null && !loadError && <div className="admin-empty">Se încarcă…</div>}
          {rows === null && loadError && (
            <div className="admin-empty">Nu am putut încărca lista. Reîncercăm automat.</div>
          )}
          {rows !== null && filtered.length === 0 && (
            <div className="admin-empty">
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
