import { useEffect, useRef, useState } from 'react';
import {
  sendBulkEmail,
  listLaunchNotifications,
  listEmailTemplates,
  InvalidTokenError,
} from '../lib/adminApi';
import type { AdminRegistration, AdminLaunchSignup, AdminEmailTemplate } from '../lib/adminApi';

type Props = {
  token: string;
  rows: AdminRegistration[];
  formatDate: (iso: string) => string;
  showToast: (toast: { kind: 'error' | 'success'; msg: string }) => void;
};

type Template = { nume: string; subiect: string; corp: string };
type Audience = 'participanti' | 'asteptare';

// Destinatar normalizat — funcționează atât pentru participanți cât și pentru
// lista de așteptare (launch_notifications).
type Recipient = {
  id: string;
  nume: string;
  prenume: string;
  email: string;
  telefon: string;
  created_at: string;
};

// Template-urile de trimitere în masă stau acum în DB (tabelul `email_templates`)
// și se editează din tab-ul „Șabloane de email". Aici le doar încărcăm și le
// oferim ca punct de plecare. Mapările de mai jos leagă cheia din DB de numele
// prietenos și de audiența în care apare.
const TEMPLATE_LABELS: Record<string, string> = {
  bulk_participant_confirmare: 'Confirmare (automat)',
  bulk_participant_reminder: 'Reminder eveniment',
  bulk_waitlist_anunt: 'Anunț eveniment nou',
};

const PARTICIPANT_KEYS = ['bulk_participant_confirmare', 'bulk_participant_reminder'] as const;
const WAITLIST_KEYS = ['bulk_waitlist_anunt'] as const;

// „Mesaj liber" nu se salvează nicăieri — e mereu ultimul, gol.
const FREE_TEMPLATE: Template = { nume: 'Mesaj liber', subiect: '', corp: '' };

const VARIABLES = ['{nume}', '{prenume}', '{telefon}', '{email}', '{data_inscrierii}'] as const;

const normalizeParticipant = (r: AdminRegistration): Recipient => ({
  id: r.id,
  nume: r.nume,
  prenume: r.nume.split(/\s+/)[0] ?? '',
  email: r.email,
  telefon: r.telefon,
  created_at: r.created_at,
});

const normalizeLaunch = (r: AdminLaunchSignup): Recipient => ({
  id: r.id,
  nume: `${r.prenume} ${r.nume}`.trim(),
  prenume: r.prenume,
  email: r.email,
  telefon: r.telefon,
  created_at: r.created_at,
});

export const AdminEmailTab = ({ token, rows, formatDate, showToast }: Props) => {
  const [audience, setAudience] = useState<Audience>('participanti');
  const [launchRows, setLaunchRows] = useState<AdminLaunchSignup[]>([]);
  const [dbTemplates, setDbTemplates] = useState<AdminEmailTemplate[]>([]);
  // null = toți selectați (inclusiv cei apăruți între timp).
  const [selected, setSelected] = useState<Record<string, boolean> | null>(null);
  const [activeTemplate, setActiveTemplate] = useState(0);
  const [subject, setSubject] = useState<string | null>(null);
  const [body, setBody] = useState<string | null>(null);
  const [previewIdx, setPreviewIdx] = useState(0);
  const [sending, setSending] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);

  // Lista de așteptare o încărcăm o dată — o folosim doar la nevoie.
  useEffect(() => {
    const controller = new AbortController();
    listLaunchNotifications(token, controller.signal)
      .then(setLaunchRows)
      .catch(() => {
        /* liniște — tab-ul rămâne pe participanți */
      });
    return () => controller.abort();
  }, [token]);

  // Șabloanele de trimitere în masă — încărcate din DB, editabile din tab-ul
  // „Șabloane de email". Dacă nu se încarcă, rămâne doar „Mesaj liber".
  useEffect(() => {
    const controller = new AbortController();
    listEmailTemplates(token, controller.signal)
      .then(setDbTemplates)
      .catch(() => {
        /* liniște — rămâne opțiunea de mesaj liber */
      });
    return () => controller.abort();
  }, [token]);

  const buildTemplates = (keys: readonly string[]): Template[] => {
    const named = keys
      .map((k) => {
        const row = dbTemplates.find((t) => t.cheie === k);
        if (!row) return null;
        return { nume: TEMPLATE_LABELS[k] ?? k, subiect: row.subiect, corp: row.text_email };
      })
      .filter((t): t is Template => t !== null);
    return [...named, FREE_TEMPLATE];
  };

  const templates =
    audience === 'participanti' ? buildTemplates(PARTICIPANT_KEYS) : buildTemplates(WAITLIST_KEYS);
  const baseRows: Recipient[] =
    audience === 'participanti' ? rows.map(normalizeParticipant) : launchRows.map(normalizeLaunch);

  const subjectCur = subject ?? templates[0].subiect;
  const bodyCur = body ?? templates[0].corp;

  const isSelected = (r: Recipient) => (selected ? !!selected[r.id] : true);
  const recipients = baseRows.filter(isSelected);
  const pvIdx = Math.min(previewIdx, Math.max(0, recipients.length - 1));
  const pv = recipients.length ? recipients[pvIdx] : null;

  const audienceLabel = audience === 'participanti' ? 'participanți' : 'din lista de așteptare';

  const fill = (text: string, r: Recipient): string =>
    text
      .replace(/\{nume\}/g, r.nume)
      .replace(/\{prenume\}/g, r.prenume || r.nume.split(/\s+/)[0] || '')
      .replace(/\{telefon\}/g, r.telefon)
      .replace(/\{email\}/g, r.email)
      .replace(/\{data_inscrierii\}/g, formatDate(r.created_at));

  const switchAudience = (a: Audience) => {
    if (a === audience) return;
    setAudience(a);
    setSelected(null);
    setActiveTemplate(0);
    setSubject(null);
    setBody(null);
    setPreviewIdx(0);
  };

  const toggleAll = () => {
    const allSelected = recipients.length === baseRows.length;
    const next: Record<string, boolean> = {};
    baseRows.forEach((r) => {
      next[r.id] = !allSelected;
    });
    setSelected(next);
    setPreviewIdx(0);
  };

  const toggleOne = (row: Recipient) => {
    const next: Record<string, boolean> = {};
    baseRows.forEach((r) => {
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

  const send = async () => {
    if (sending) return;
    if (!recipients.length) {
      showToast({ kind: 'error', msg: 'Selectează cel puțin un destinatar.' });
      return;
    }
    if (!subjectCur.trim()) {
      showToast({ kind: 'error', msg: 'Completează subiectul emailului.' });
      return;
    }
    const messages = recipients.map((r) => ({
      to: r.email,
      subject: fill(subjectCur, r),
      text: fill(bodyCur, r),
    }));
    setSending(true);
    try {
      const res = await sendBulkEmail(token, messages);
      if (res.failed > 0) {
        showToast({
          kind: res.sent > 0 ? 'success' : 'error',
          msg: `Trimise ${res.sent}, eșuate ${res.failed}. Verifică adresele și încearcă din nou.`,
        });
      } else {
        showToast({
          kind: 'success',
          msg: `Email trimis către ${res.sent} ${res.sent === 1 ? 'destinatar' : 'destinatari'}.`,
        });
      }
    } catch (err) {
      showToast({
        kind: 'error',
        msg:
          err instanceof InvalidTokenError
            ? 'Sesiune expirată — reautentifică-te.'
            : 'Nu s-a putut trimite. Verifică configurarea Resend și încearcă din nou.',
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="admin-email">
      <div className="admin-email-recipients">
        <div className="admin-email-recipients-head">
          <h2>Destinatari</h2>
          <span className="admin-email-count">{recipients.length} selectați</span>
        </div>

        <div className="admin-email-audience">
          <button
            type="button"
            className={`admin-email-template${audience === 'participanti' ? ' active' : ''}`}
            onClick={() => switchAudience('participanti')}
          >
            Participanți ({rows.length})
          </button>
          <button
            type="button"
            className={`admin-email-template${audience === 'asteptare' ? ' active' : ''}`}
            onClick={() => switchAudience('asteptare')}
          >
            Listă de așteptare ({launchRows.length})
          </button>
        </div>

        <label className="admin-email-recipient all">
          <input
            type="checkbox"
            checked={baseRows.length > 0 && recipients.length === baseRows.length}
            onChange={toggleAll}
          />
          <span className="admin-email-all-label">
            {audience === 'participanti' ? 'Toți participanții' : 'Toată lista de așteptare'}
          </span>
        </label>
        <div className="admin-email-recipient-list">
          {baseRows.map((r) => (
            <label key={r.id} className="admin-email-recipient">
              <input type="checkbox" checked={isSelected(r)} onChange={() => toggleOne(r)} />
              <span className="admin-email-recipient-info">
                <span className="name">{r.nume}</span>
                <span className="email">{r.email}</span>
              </span>
            </label>
          ))}
          {baseRows.length === 0 && (
            <div className="admin-empty">
              {audience === 'participanti'
                ? 'Niciun participant încă.'
                : 'Nimeni pe lista de așteptare încă.'}
            </div>
          )}
        </div>
      </div>

      <div className="admin-email-compose-col">
        <div className="admin-email-compose">
          <div className="admin-email-field">
            <span className="admin-email-label">Template</span>
            <div className="admin-email-templates">
              {templates.map((t, i) => (
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
                <span>Inserează câmp:</span>
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
            <span className="admin-email-label">Previzualizare cu datele destinatarului</span>
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
          <button type="button" className="admin-btn-accent" onClick={send} disabled={sending}>
            {sending ? 'Se trimite…' : `Trimite email (${recipients.length})`}
          </button>
          <span className="admin-email-note">
            Trimiți către {audienceLabel}. „Confirmare" pleacă automat la fiecare înscriere; restul le
            trimiți tu de aici. Toate sunt brandate Run + Lift, prin Resend.
          </span>
        </div>
      </div>
    </section>
  );
};
