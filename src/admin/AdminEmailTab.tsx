import { useEffect, useRef, useState } from 'react';
import { sendBulkEmail, listLaunchNotifications, InvalidTokenError } from '../lib/adminApi';
import type { AdminRegistration, AdminLaunchSignup } from '../lib/adminApi';

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

const REG_LINK = 'https://parktraining.fit';

// Template-uri pentru PARTICIPANȚII înscriși (ediția 2).
const PARTICIPANT_TEMPLATES: Template[] = [
  {
    nume: 'Confirmare (automat)',
    subiect: 'Confirmare înscriere — HYROX, 18 iulie',
    corp: 'Salut, {prenume}!\n\nÎnscrierea ta la Run + Lift — HYROX Style Race este confirmată.\n\n• Când: sâmbătă, 18 iulie 2026, ora 07:00\n• Unde: Parcul Râșcani, Str. Braniștii, Chișinău\n• Vino cu 30 de minute înainte pentru check-in și încălzire.\n\nAdu apă pentru hidratare și bună dispoziție. Ne vedem la start!\n\nEchipa Run + Lift',
  },
  {
    nume: 'Reminder eveniment',
    subiect: 'Mâine e ziua — HYROX, 18 iulie, 07:00',
    corp: 'Salut, {prenume}!\n\nÎți reamintim că Run + Lift — HYROX Style Race are loc mâine, sâmbătă 18 iulie, ora 07:00, la Parcul Râșcani (Str. Braniștii).\n\n• Check-in de la 06:30, start fix la 07:00\n• Adu: echipament sport, apă pentru hidratare și bună dispoziție\n\nDacă nu mai poți participa, răspunde la acest email ca să eliberăm locul.\n\nNe vedem la start!\nEchipa Run + Lift',
  },
  { nume: 'Mesaj liber', subiect: '', corp: '' },
];

// Template-uri pentru LISTA DE AȘTEPTARE (cei care au lăsat emailul la „Anunță-mă
// la lansare") — anunțul noului eveniment, cu link de înscriere.
const WAITLIST_TEMPLATES: Template[] = [
  {
    nume: 'Anunț eveniment nou',
    subiect: 'S-au deschis înscrierile — HYROX, 18 iulie',
    corp: `Salut, {prenume}!\n\nEvenimentul pe care îl așteptai e aici: Run + Lift — HYROX Style Race, sâmbătă 18 iulie 2026, ora 07:00, la Parcul Râșcani (Str. Braniștii), Chișinău.\n\nCursă în stil HYROX în aer liber — alergi, treci stația, repeți, contra cronometru. Locuri limitate.\n\nÎnscrie-te aici:\n${REG_LINK}\n\nNe vedem la start!\nEchipa Run + Lift`,
  },
  { nume: 'Mesaj liber', subiect: '', corp: '' },
];

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

  const templates = audience === 'participanti' ? PARTICIPANT_TEMPLATES : WAITLIST_TEMPLATES;
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
