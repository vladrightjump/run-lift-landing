import { useRef, useState } from 'react';
import type { AdminRegistration } from '../lib/adminApi';

type Props = {
  rows: AdminRegistration[];
  formatDate: (iso: string) => string;
  showToast: (toast: { kind: 'error' | 'success'; msg: string }) => void;
};

type Template = { nume: string; subiect: string; corp: string };

const TEMPLATES: Template[] = [
  {
    nume: 'Confirmare înscriere',
    subiect: 'Confirmare înscriere — Run + Lift, 11 iulie',
    corp: 'Salut, {prenume}!\n\nÎnscrierea ta la Run + Lift este confirmată. Te așteptăm pe 11 iulie 2026, ora 06:30, la Stadionul Dinamo.\n\nDatele tale din formular:\n• Nume: {nume}\n• Telefon: {telefon}\n• Email: {email}\n• Data înscrierii: {data_inscrierii}\n\nNe vedem la start!\nEchipa Run + Lift',
  },
  {
    nume: 'Reminder eveniment',
    subiect: 'Se apropie startul — Run + Lift, 11 iulie',
    corp: 'Salut, {prenume}!\n\nÎți reamintim că Run + Lift are loc sâmbătă, 11 iulie, ora 06:30, la Stadionul Dinamo.\n\nNu uita: echipament sport, apă și bună dispoziție.\n\nDacă nu mai poți participa, răspunde la acest email ca să eliberăm locul.\n\nEchipa Run + Lift',
  },
  {
    nume: 'Instrucțiuni ziua cursei',
    subiect: 'Instrucțiuni pentru ziua evenimentului',
    corp: 'Salut, {prenume}!\n\nCâteva detalii pentru ziua evenimentului:\n\n• Check-in: 06:00 – 06:20, la intrarea principală\n• Start: 06:30 fix\n• Adu: act de identitate și acest email\n\nLa check-in te găsim după numele: {nume}.\n\nSucces!\nEchipa Run + Lift',
  },
  { nume: 'Mesaj liber', subiect: '', corp: '' },
];

const VARIABLES = ['{nume}', '{prenume}', '{telefon}', '{email}', '{data_inscrierii}'] as const;

export const AdminEmailTab = ({ rows, formatDate, showToast }: Props) => {
  // null = toți selectați (inclusiv participanții apăruți între timp).
  const [selected, setSelected] = useState<Record<string, boolean> | null>(null);
  const [activeTemplate, setActiveTemplate] = useState(0);
  const [subject, setSubject] = useState<string | null>(null);
  const [body, setBody] = useState<string | null>(null);
  const [previewIdx, setPreviewIdx] = useState(0);
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);

  const subjectCur = subject ?? TEMPLATES[0].subiect;
  const bodyCur = body ?? TEMPLATES[0].corp;

  const isSelected = (r: AdminRegistration) => (selected ? !!selected[r.id] : true);
  const recipients = rows.filter(isSelected);
  const pvIdx = Math.min(previewIdx, Math.max(0, recipients.length - 1));
  const pv = recipients.length ? recipients[pvIdx] : null;

  const fill = (text: string, r: AdminRegistration): string =>
    text
      .replace(/\{nume\}/g, r.nume)
      .replace(/\{prenume\}/g, r.nume.split(/\s+/)[0])
      .replace(/\{telefon\}/g, r.telefon)
      .replace(/\{email\}/g, r.email)
      .replace(/\{data_inscrierii\}/g, formatDate(r.created_at));

  const toggleAll = () => {
    const allSelected = recipients.length === rows.length;
    const next: Record<string, boolean> = {};
    rows.forEach((r) => {
      next[r.id] = !allSelected;
    });
    setSelected(next);
    setPreviewIdx(0);
  };

  const toggleOne = (row: AdminRegistration) => {
    const next: Record<string, boolean> = {};
    rows.forEach((r) => {
      next[r.id] = isSelected(r);
    });
    next[row.id] = !next[row.id];
    setSelected(next);
    setPreviewIdx(0);
  };

  const insertVariable = (v: string) => {
    const el = bodyRef.current;
    if (el && typeof el.selectionStart === 'number') {
      const s = el.selectionStart;
      const e = el.selectionEnd;
      setBody(bodyCur.slice(0, s) + v + bodyCur.slice(e));
      window.setTimeout(() => {
        el.focus();
        el.selectionStart = el.selectionEnd = s + v.length;
      }, 0);
    } else {
      setBody(bodyCur + v);
    }
  };

  const send = () => {
    if (!recipients.length) {
      showToast({ kind: 'error', msg: 'Selectează cel puțin un destinatar.' });
      return;
    }
    // Doar UI deocamdată — trimiterea reală urmează (necesită backend de email).
    showToast({
      kind: 'success',
      msg: `Email pregătit pentru ${recipients.length} ${recipients.length === 1 ? 'participant' : 'participanți'} — trimiterea reală urmează.`,
    });
  };

  return (
    <section className="admin-email">
      <div className="admin-email-recipients">
        <div className="admin-email-recipients-head">
          <h2>Destinatari</h2>
          <span className="admin-email-count">{recipients.length} selectați</span>
        </div>
        <label className="admin-email-recipient all">
          <input
            type="checkbox"
            checked={rows.length > 0 && recipients.length === rows.length}
            onChange={toggleAll}
          />
          <span className="admin-email-all-label">Toți participanții</span>
        </label>
        <div className="admin-email-recipient-list">
          {rows.map((r) => (
            <label key={r.id} className="admin-email-recipient">
              <input type="checkbox" checked={isSelected(r)} onChange={() => toggleOne(r)} />
              <span className="admin-email-recipient-info">
                <span className="name">{r.nume}</span>
                <span className="email">{r.email}</span>
              </span>
            </label>
          ))}
          {rows.length === 0 && <div className="admin-empty">Niciun participant încă.</div>}
        </div>
      </div>

      <div className="admin-email-compose-col">
        <div className="admin-email-compose">
          <div className="admin-email-field">
            <span className="admin-email-label">Template</span>
            <div className="admin-email-templates">
              {TEMPLATES.map((t, i) => (
                <button
                  key={t.nume}
                  type="button"
                  className={`admin-email-template${i === activeTemplate ? ' active' : ''}`}
                  onClick={() => {
                    setActiveTemplate(i);
                    setSubject(t.subiect);
                    setBody(t.corp);
                  }}
                >
                  {t.nume}
                </button>
              ))}
            </div>
          </div>

          <label className="admin-email-field">
            <span className="admin-email-label">Subiect</span>
            <input
              type="text"
              placeholder="Subiectul emailului"
              value={subjectCur}
              onChange={(e) => setSubject(e.target.value)}
            />
          </label>

          <div className="admin-email-field">
            <div className="admin-email-body-head">
              <span className="admin-email-label">Mesaj</span>
              <div className="admin-email-vars">
                <span>Inserează câmp din formular:</span>
                {VARIABLES.map((v) => (
                  <button key={v} type="button" onClick={() => insertVariable(v)}>
                    {v}
                  </button>
                ))}
              </div>
            </div>
            <textarea
              ref={bodyRef}
              rows={12}
              placeholder="Scrie mesajul aici…"
              value={bodyCur}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>
        </div>

        <div className="admin-email-preview">
          <div className="admin-email-preview-head">
            <span className="admin-email-label">Previzualizare cu datele participantului</span>
            <div className="admin-email-pager">
              <button type="button" onClick={() => setPreviewIdx(Math.max(0, pvIdx - 1))}>
                ‹
              </button>
              <span>{pv ? `${pvIdx + 1} / ${recipients.length}` : '0 / 0'}</span>
              <button
                type="button"
                onClick={() => setPreviewIdx(Math.min(Math.max(0, recipients.length - 1), pvIdx + 1))}
              >
                ›
              </button>
            </div>
          </div>
          {pv ? (
            <div className="admin-email-preview-body">
              <div className="admin-email-preview-meta">
                <span className="to">
                  Către: {pv.nume} &lt;{pv.email}&gt;
                </span>
                <span className="subject">{fill(subjectCur, pv)}</span>
              </div>
              <div className="admin-email-preview-text">{fill(bodyCur, pv)}</div>
            </div>
          ) : (
            <div className="admin-email-preview-empty">
              Selectează cel puțin un destinatar pentru previzualizare.
            </div>
          )}
        </div>

        <div className="admin-email-actions">
          <button type="button" className="admin-btn-accent" onClick={send}>
            Trimite email ({recipients.length})
          </button>
          <span className="admin-email-note">
            Deocamdată doar interfața — trimiterea reală de emailuri urmează.
          </span>
        </div>
      </div>
    </section>
  );
};
