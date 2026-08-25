import { useEffect, useMemo, useRef, useState } from 'react';
import {
  sendBulkEmail,
  listLaunchNotifications,
  listEmailTemplates,
  InvalidTokenError,
} from '../lib/adminApi';
import type {
  AdminRegistration,
  AdminLaunchSignup,
  AdminWaitlistEntry,
  AdminEmailTemplate,
  AdminEmailLogEntry,
} from '../lib/adminApi';
import { cheieDifuzare, ultimaDifuzare } from './sendLock';
import { recipientsFor, audientaLog, fillTemplate } from './emailAudience';
import type { Audience, Recipient } from './emailAudience';

type Props = {
  token: string;
  rows: AdminRegistration[];
  /** Lista de așteptare a evenimentului (event_waitlist) a ediției deschise. */
  waitlist: AdminWaitlistEntry[];
  /** Ediția deschisă în backoffice — ajunge în jurnalul de livrare. */
  editie: number;
  /** Jurnalul ediției — ca să știm dacă aceeași difuzare a plecat deja. */
  emailLog: AdminEmailLogEntry[];
  /** Ediție de arhivă: nu mai trimitem emailuri în numele ei. */
  readOnly: boolean;
  formatDate: (iso: string) => string;
  showToast: (toast: { kind: 'error' | 'success'; msg: string }) => void;
};

type Template = { nume: string; subiect: string; corp: string };

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

const timpDifuzare = new Intl.DateTimeFormat('ro-RO', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Chisinau',
});

export const AdminEmailTab = ({
  token,
  rows,
  waitlist,
  editie,
  emailLog,
  readOnly,
  formatDate,
  showToast,
}: Props) => {
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
  // Jetonul de suprascriere, emis când operatorul confirmă „trimite oricum".
  // Îl ținem legat de difuzarea PENTRU CARE a fost emis: șabloanele se încarcă
  // asincron, deci subiectul se schimbă și după montare, iar un jeton „liber" ar
  // fi fost fie aruncat tăcut la încărcarea șabloanelor, fie reportat peste
  // trimiterea următoare. Legarea de cheie rezolvă ambele fără niciun efect.
  const [suprascriere, setSuprascriere] = useState<{ cheie: string; jeton: string } | null>(null);
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

  const sources = { participants: rows, eventWaitlist: waitlist, launch: launchRows };
  const totiRecipients = recipientsFor('toti', sources);
  const baseRows: Recipient[] = recipientsFor(audience, sources);

  const subjectCur = subject ?? templates[0].subiect;
  const bodyCur = body ?? templates[0].corp;

  // A plecat deja aceeași difuzare? Întrebarea se pune ÎNAINTE de trimitere, nu
  // după — jurnalul e deja încărcat, deci nu costă o cerere în plus.
  const anterioara = useMemo(
    () =>
      subjectCur.trim()
        ? ultimaDifuzare(emailLog, editie, audientaLog(audience), subjectCur)
        : null,
    [emailLog, editie, audience, subjectCur]
  );

  /** Cheia difuzării compuse acum, fără suprascriere. */
  const cheieCurenta = cheieDifuzare(editie, audientaLog(audience), subjectCur);
  /** Jetonul e valabil doar pentru difuzarea pentru care a fost emis. */
  const jetonValid = suprascriere?.cheie === cheieCurenta ? suprascriere.jeton : null;

  // Dezabonații rămân vizibili în listă (adminul trebuie să știe de ce lipsesc),
  // dar nu pot fi bifați și nu intră niciodată în trimitere.
  const isSelected = (r: Recipient) =>
    !r.dezabonat && (selected ? !!selected[r.id] : true);
  const recipients = baseRows.filter(isSelected);
  const selectabile = baseRows.filter((r) => !r.dezabonat);
  const nrDezabonati = baseRows.length - selectabile.length;
  const pvIdx = Math.min(previewIdx, Math.max(0, recipients.length - 1));
  const pv = recipients.length ? recipients[pvIdx] : null;

  const audienceLabel =
    audience === 'participanti'
      ? 'participanți'
      : audience === 'eveniment'
      ? 'lista de așteptare a evenimentului'
      : audience === 'lansare'
      ? 'lista „Anunță-mă la lansare"'
      : 'toți (participanți + liste de așteptare)';

  const fill = (text: string, r: Recipient): string =>
    fillTemplate(text, r, formatDate(r.created_at));

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
    const allSelected = recipients.length === selectabile.length;
    const next: Record<string, boolean> = {};
    selectabile.forEach((r) => {
      next[r.id] = !allSelected;
    });
    setSelected(next);
    setPreviewIdx(0);
  };

  const toggleOne = (row: Recipient) => {
    if (row.dezabonat) return;
    const next: Record<string, boolean> = {};
    selectabile.forEach((r) => {
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
    if (readOnly) {
      showToast({ kind: 'error', msg: 'Ediția e arhivată — comută pe ediția curentă ca să trimiți.' });
      return;
    }
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
      const res = await sendBulkEmail(token, messages, {
        audience: audientaLog(audience),
        editie,
        onceKey: cheieDifuzare(editie, audientaLog(audience), subjectCur, jetonValid ?? undefined),
      });
      // Serverul a refuzat: aceeași ediție + audiență + subiect a plecat deja.
      if (res.skipped) {
        showToast({
          kind: 'error',
          msg: 'Difuzarea asta a plecat deja. Folosește „Trimite oricum" dacă chiar vrei s-o repeți.',
        });
        return;
      }
      setSuprascriere(null);
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
            className={`admin-email-template${audience === 'eveniment' ? ' active' : ''}`}
            onClick={() => switchAudience('eveniment')}
          >
            Listă de așteptare ({waitlist.length})
          </button>
          <button
            type="button"
            className={`admin-email-template${audience === 'lansare' ? ' active' : ''}`}
            onClick={() => switchAudience('lansare')}
          >
            Anunță-mă la lansare ({launchRows.length})
          </button>
          <button
            type="button"
            className={`admin-email-template${audience === 'toti' ? ' active' : ''}`}
            onClick={() => switchAudience('toti')}
          >
            Toți ({totiRecipients.length})
          </button>
        </div>

        <label className="admin-email-recipient all">
          <input
            type="checkbox"
            checked={selectabile.length > 0 && recipients.length === selectabile.length}
            onChange={toggleAll}
          />
          <span className="admin-email-all-label">
            {audience === 'participanti'
              ? 'Toți participanții'
              : audience === 'eveniment'
              ? 'Toată lista de așteptare'
              : audience === 'lansare'
              ? 'Toată lista de lansare'
              : 'Toți (fără dubluri)'}
            {nrDezabonati > 0 && (
              <span className="admin-email-unsub-note">
                {' '}
                · {nrDezabonati} dezabonat{nrDezabonati === 1 ? '' : 'i'}, excluși
              </span>
            )}
          </span>
        </label>
        <div className="admin-email-recipient-list">
          {baseRows.map((r) => (
            <label
              key={r.id}
              className={`admin-email-recipient${r.dezabonat ? ' dezabonat' : ''}`}
              title={r.dezabonat ? 'S-a dezabonat — nu poate fi selectat' : undefined}
            >
              <input
                type="checkbox"
                checked={isSelected(r)}
                disabled={r.dezabonat}
                onChange={() => toggleOne(r)}
              />
              <span className="admin-email-recipient-info">
                <span className="name">
                  {r.nume}
                  {r.dezabonat && <span className="admin-email-unsub-tag">dezabonat</span>}
                </span>
                <span className="email">{r.email}</span>
              </span>
            </label>
          ))}
          {baseRows.length === 0 && (
            <div className="admin-empty">
              {audience === 'participanti'
                ? 'Niciun participant încă.'
                : audience === 'eveniment'
                ? 'Nimeni pe lista de așteptare a evenimentului.'
                : audience === 'lansare'
                ? 'Nimeni pe lista de lansare încă.'
                : 'Nicio adresă încă.'}
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

        {anterioara && !readOnly && (
          <div className="admin-banner warn" role="status">
            <strong>
              Aceeași difuzare a plecat deja pe {timpDifuzare.format(new Date(anterioara.cand))},
              către {anterioara.catreCati}{' '}
              {anterioara.catreCati === 1 ? 'destinatar' : 'destinatari'}.
            </strong>{' '}
            Butonul de trimitere e blocat pe server pentru această combinație de ediție, audiență
            și subiect. Dacă retrimiterea e intenționată — ai corectat audiența sau reformulezi —
            deblocheaz-o explicit.
            <div className="admin-confirm-actions">
              <button
                type="button"
                className="admin-btn-outline"
                onClick={() =>
                  setSuprascriere({ cheie: cheieCurenta, jeton: `${Date.now()}` })
                }
                disabled={jetonValid !== null}
              >
                {jetonValid ? 'Deblocat — poți trimite' : 'Trimite oricum'}
              </button>
            </div>
          </div>
        )}

        <div className="admin-email-actions">
          <button
            type="button"
            className="admin-btn-accent"
            onClick={send}
            disabled={sending || readOnly || (anterioara !== null && jetonValid === null)}
          >
            {sending ? 'Se trimite…' : `Trimite email (${recipients.length})`}
          </button>
          <span className="admin-email-note">
            {readOnly ? (
              <>Ediția deschisă e arhivată — trimiterea e blocată. Comută pe ediția curentă.</>
            ) : (
              <>
                Trimiți către {audienceLabel}. „Confirmare" pleacă automat la fiecare înscriere;
                restul le trimiți tu de aici. Toate sunt brandate Run + Lift, prin Resend. Fiecare
                trimitere apare în tab-ul „Livrare", cu cine a primit și cine nu.
              </>
            )}
          </span>
        </div>
      </div>
    </section>
  );
};
