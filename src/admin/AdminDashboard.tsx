import { useCallback, useEffect, useRef, useState } from 'react';
import {
  addRegistration,
  deleteRegistration,
  listRegistrations,
  InvalidTokenError,
} from '../lib/adminApi';
import type { AdminRegistration } from '../lib/adminApi';
import { isDuplicateError } from '../lib/supabase';
import { EMAIL_RE, PHONE_RE, normalizePhone } from '../lib/validation';
import { useCountdown } from '../hooks/useCountdown';
import { EVENT_DATE, TOTAL_SLOTS } from '../lib/config';

type Props = {
  token: string;
  onLogout: () => void;
};

type AdminToast = {
  kind: 'error' | 'success';
  msg: string;
  undo?: () => void;
};

const REFRESH_MS = 15_000;

const dateFmt = new Intl.DateTimeFormat('ro-RO', { day: 'numeric', month: 'short' });
const formatDate = (iso: string): string => dateFmt.format(new Date(iso)).replace('.', '');

export const AdminDashboard = ({ token, onLogout }: Props) => {
  const [rows, setRows] = useState<AdminRegistration[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [query, setQuery] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [draft, setDraft] = useState({ nume: '', telefon: '', email: '' });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<AdminToast | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const cd = useCountdown(EVENT_DATE);

  // Sesiune expirată — orice RPC o semnalează; ieșim la login.
  const handleAuthError = useCallback(
    (err: unknown): boolean => {
      if (err instanceof InvalidTokenError) {
        onLogout();
        return true;
      }
      return false;
    },
    [onLogout]
  );

  const showToast = useCallback((next: AdminToast) => {
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    setToast(next);
    toastTimerRef.current = window.setTimeout(() => setToast(null), next.undo ? 6000 : 3200);
  }, []);

  // refresh() e stabil; ref-ul evită să-l recreăm la fiecare schimbare de listă.
  const rowsRef = useRef<AdminRegistration[] | null>(null);
  rowsRef.current = rows;

  const refresh = useCallback(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    listRegistrations(token, controller.signal)
      .then((data) => {
        setRows(data);
        setLoadError(false);
      })
      .catch((err) => {
        if (controller.signal.aborted || handleAuthError(err)) return;
        // Păstrăm ultima listă cunoscută; eroarea contează doar la primul load.
        setLoadError((prev) => prev || rowsRef.current === null);
      });
  }, [token, handleAuthError]);

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
      if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    };
  }, [refresh]);

  const all = rows ?? [];
  const q = query.trim().toLowerCase();
  const filtered = all.filter(
    (r) => !q || `${r.nume} ${r.telefon} ${r.email}`.toLowerCase().includes(q)
  );
  const remaining = Math.max(0, TOTAL_SLOTS - all.length);
  const percent = Math.round((all.length / TOTAL_SLOTS) * 100);

  const handleDelete = (row: AdminRegistration) => {
    const before = rowsRef.current ?? [];
    setRows(before.filter((r) => r.id !== row.id));
    deleteRegistration(token, row.id)
      .then(() => {
        showToast({
          kind: 'error',
          msg: `${row.nume} a fost șters.`,
          undo: () => {
            addRegistration(token, { nume: row.nume, telefon: row.telefon, email: row.email })
              .then(() => {
                refresh();
                showToast({ kind: 'success', msg: `${row.nume} a fost readăugat.` });
              })
              .catch((err) => {
                if (handleAuthError(err)) return;
                showToast({ kind: 'error', msg: 'Nu am putut anula ștergerea.' });
              });
          },
        });
      })
      .catch((err) => {
        if (handleAuthError(err)) return;
        setRows(before);
        showToast({ kind: 'error', msg: 'Ștergerea nu a mers. Încearcă din nou.' });
      });
  };

  const handleAdd = () => {
    if (saving) return;
    const nume = draft.nume.trim();
    const telefon = normalizePhone(draft.telefon);
    const email = draft.email.trim();
    if (nume.split(/\s+/).length < 2) {
      showToast({ kind: 'error', msg: 'Scrie numele complet (nume și prenume).' });
      return;
    }
    if (!PHONE_RE.test(telefon)) {
      showToast({ kind: 'error', msg: 'Numărul de telefon nu arată valid.' });
      return;
    }
    if (!EMAIL_RE.test(email)) {
      showToast({ kind: 'error', msg: 'Emailul nu arată valid.' });
      return;
    }
    if (all.length >= TOTAL_SLOTS) {
      showToast({ kind: 'error', msg: `Toate cele ${TOTAL_SLOTS} locuri sunt ocupate.` });
      return;
    }
    setSaving(true);
    addRegistration(token, { nume, telefon, email })
      .then(() => {
        setAddOpen(false);
        setDraft({ nume: '', telefon: '', email: '' });
        refresh();
        showToast({ kind: 'success', msg: `${nume} a fost adăugat.` });
      })
      .catch((err) => {
        if (handleAuthError(err)) return;
        showToast({
          kind: 'error',
          msg: isDuplicateError(err)
            ? 'Există deja o înscriere cu acest email.'
            : 'Nu am putut salva. Încearcă din nou.',
        });
      })
      .finally(() => setSaving(false));
  };

  const exportCsv = () => {
    const header = ['Nr', 'Nume', 'Telefon', 'Email', 'Data înscrierii'];
    const lines = all.map((r, i) => [
      String(i + 1),
      r.nume,
      r.telefon,
      r.email,
      new Date(r.created_at).toLocaleString('ro-RO'),
    ]);
    const csv = [header, ...lines]
      .map((cells) => cells.map((c) => `"${c.replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'run-lift-participanti.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <>
      <header className="admin-topbar">
        <div className="brand">
          <span className="admin-logo">
            Run <span className="accent">+</span> Lift
          </span>
          <span className="admin-badge">Backoffice</span>
        </div>
        <div className="admin-topbar-meta">
          <span className="topbar-info">11 iulie 2026 · Stadionul Dinamo</span>
          <span className="admin-cd">
            <span className="countdown-dot" />
            Start în {cd.zile}z {cd.ore}h {cd.minute}m {cd.secunde}s
          </span>
          <button type="button" className="admin-logout" onClick={onLogout}>
            Ieși din cont
          </button>
        </div>
      </header>

      <main className="admin-main">
        <section className="admin-stats">
          <div className="admin-stat">
            <span className="admin-stat-label">Înscriși</span>
            <span className="admin-stat-value" key={all.length}>
              {all.length}
              <span className="admin-stat-total"> / {TOTAL_SLOTS}</span>
            </span>
          </div>
          <div className="admin-stat">
            <span className="admin-stat-label">Locuri rămase</span>
            <span className={`admin-stat-value${remaining <= 3 ? ' low' : ''}`} key={remaining}>
              {remaining}
            </span>
          </div>
          <div className="admin-stat">
            <span className="admin-stat-label">Grad de ocupare</span>
            <span className="admin-stat-value accent" key={percent}>
              {percent}%
            </span>
          </div>
        </section>

        <section className="admin-occupancy">
          <div className="slots-head">
            <span className="slots-label">Ocupare locuri</span>
            <span className="admin-occupancy-count">
              {all.length} din {TOTAL_SLOTS} locuri ocupate
            </span>
          </div>
          <div className="slots-grid">
            {Array.from({ length: TOTAL_SLOTS }, (_, i) => (
              <div key={i} className={`slot admin-slot${i < all.length ? ' filled' : ''}`} />
            ))}
          </div>
        </section>

        <section className="admin-table-section">
          <div className="admin-table-head">
            <h2>Participanți</h2>
            <div className="admin-table-actions">
              <input
                type="text"
                className="admin-search"
                placeholder="Caută nume, telefon, email…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <button
                type="button"
                className="admin-btn-outline"
                onClick={() => {
                  setAddOpen((v) => !v);
                  setDraft({ nume: '', telefon: '', email: '' });
                }}
              >
                + Adaugă
              </button>
              <button type="button" className="admin-btn-accent" onClick={exportCsv}>
                Export CSV
              </button>
            </div>
          </div>

          {addOpen && (
            <div className="admin-add-row">
              <label className="admin-add-field grow">
                <span>Nume</span>
                <input
                  type="text"
                  placeholder="Ana Popescu"
                  value={draft.nume}
                  onChange={(e) => setDraft((d) => ({ ...d, nume: e.target.value }))}
                />
              </label>
              <label className="admin-add-field">
                <span>Telefon</span>
                <input
                  type="tel"
                  placeholder="069 xxx xxx"
                  value={draft.telefon}
                  onChange={(e) => setDraft((d) => ({ ...d, telefon: e.target.value }))}
                />
              </label>
              <label className="admin-add-field grow">
                <span>Email</span>
                <input
                  type="email"
                  placeholder="ana@email.md"
                  value={draft.email}
                  onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))}
                />
              </label>
              <button type="button" className="admin-btn-accent" onClick={handleAdd} disabled={saving}>
                {saving ? 'Se salvează…' : 'Salvează'}
              </button>
              <button type="button" className="admin-add-cancel" onClick={() => setAddOpen(false)}>
                Anulează
              </button>
            </div>
          )}

          <div className="admin-table-wrap">
            <div className="admin-table">
              <div className="admin-row admin-row-head">
                <span>#</span>
                <span>Nume</span>
                <span>Telefon</span>
                <span>Email</span>
                <span>Înscris</span>
                <span className="right">Acțiuni</span>
              </div>
              {filtered.map((r, i) => (
                <div key={r.id} className="admin-row">
                  <span className="admin-cell-nr">{String(i + 1).padStart(2, '0')}</span>
                  <span className="admin-cell-name">{r.nume}</span>
                  <a className="admin-cell-link" href={`tel:${r.telefon}`}>
                    {r.telefon}
                  </a>
                  <a className="admin-cell-link ellipsis" href={`mailto:${r.email}`}>
                    {r.email}
                  </a>
                  <span className="admin-cell-date">{formatDate(r.created_at)}</span>
                  <div className="admin-cell-actions">
                    <button
                      type="button"
                      className="admin-btn-delete"
                      title="Șterge înscrierea"
                      onClick={() => handleDelete(r)}
                    >
                      Șterge
                    </button>
                  </div>
                </div>
              ))}
              {rows === null && !loadError && <div className="admin-empty">Se încarcă…</div>}
              {rows === null && loadError && (
                <div className="admin-empty">Nu am putut încărca lista. Reîncercăm automat.</div>
              )}
              {rows !== null && filtered.length === 0 && (
                <div className="admin-empty">Niciun participant găsit.</div>
              )}
            </div>
          </div>
        </section>
      </main>

      {toast && (
        <div className={`admin-toast${toast.kind === 'error' ? ' error' : ''}`} role="status">
          <span className="dot" />
          <span>{toast.msg}</span>
          {toast.undo && (
            <button
              type="button"
              onClick={() => {
                toast.undo?.();
                if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
                setToast(null);
              }}
            >
              Anulează
            </button>
          )}
        </div>
      )}
    </>
  );
};
