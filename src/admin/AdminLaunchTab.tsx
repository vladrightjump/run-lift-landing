import { useCallback, useEffect, useRef, useState } from 'react';
import { listLaunchNotifications } from '../lib/adminApi';
import type { AdminLaunchSignup } from '../lib/adminApi';

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

  const all = rows ?? [];
  const q = query.trim().toLowerCase();
  const filtered = all.filter(
    (r) => !q || `${r.nume} ${r.prenume} ${r.telefon} ${r.email}`.toLowerCase().includes(q)
  );

  const exportCsv = () => {
    const header = ['Nr', 'Nume', 'Prenume', 'Telefon', 'Email', 'Data'];
    const lines = all.map((r, i) => [
      String(i + 1),
      r.nume,
      r.prenume,
      r.telefon,
      r.email,
      new Date(r.created_at).toLocaleString('ro-RO'),
    ]);
    const csv = [header, ...lines]
      .map((cells) => cells.map((c) => `"${c.replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'run-lift-lansare.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <section className="admin-table-section">
      <div className="admin-stats">
        <div className="admin-stat">
          <span className="admin-stat-label">Înscriși la notificare</span>
          <span className="admin-stat-value accent" key={all.length}>
            {all.length}
          </span>
        </div>
      </div>

      <div className="admin-table-head">
        <h2>Anunță-mă la lansare</h2>
        <div className="admin-table-actions">
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
            </div>
          ))}
          {rows === null && !loadError && <div className="admin-empty">Se încarcă…</div>}
          {rows === null && loadError && (
            <div className="admin-empty">Nu am putut încărca lista. Reîncercăm automat.</div>
          )}
          {rows !== null && filtered.length === 0 && (
            <div className="admin-empty">Nicio înscriere la notificare încă.</div>
          )}
        </div>
      </div>
    </section>
  );
};
