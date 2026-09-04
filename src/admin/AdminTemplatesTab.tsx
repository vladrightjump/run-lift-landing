import { useCallback, useEffect, useRef, useState } from 'react';
import { listEmailTemplates, saveEmailTemplate } from '../lib/adminApi';
import type { AdminEmailTemplate } from '../lib/adminApi';

type Props = {
  token: string;
  onAuthError: (err: unknown) => boolean;
};

/** Eticheta prietenoasă pentru fiecare șablon cunoscut. */
const ETICHETE: Record<string, { titlu: string; descriere: string }> = {
  confirmare: {
    titlu: 'Confirmare înscriere (double opt-in)',
    descriere:
      'Pleacă automat la orice înscriere — de pe Coming Soon sau „Despre noi”. Trebuie să conțină {{link}} (linkul de confirmare); altfel oamenii nu au cum să confirme. Alte variabile: {{prenume}}, {{nume}}, {{email}}.',
  },
  info: {
    titlu: 'Bun venit — cerere de informații (vechi)',
    descriere:
      'Nefolosit în prezent — a fost înlocuit de șablonul de confirmare. Păstrat pentru referință.',
  },
  bulk_participant_confirmare: {
    titlu: 'Trimitere în masă · Confirmare (participanți)',
    descriere:
      'Punct de plecare pentru tab-ul „Email" → Participanți. Variabile despre persoană: {prenume}, {nume}, {email}, {telefon}, {data_inscrierii} (o singură acoladă). Despre eveniment, completate din ediția publicată: {data_cursei}, {data_scurta}, {ora_start}, {ora_checkin}, {locul}, {numele_cursei}, {editia} — folosește-le în loc să scrii data de mână, altfel șablonul rămâne pe ediția veche.',
  },
  bulk_participant_reminder: {
    titlu: 'Automat · Reminder eveniment (participanți)',
    descriere:
      'Textul reminderelor programate din /admin → „Eveniment" → Remindere. Pleacă SINGUR, cu atâtea ore înainte de start câte ai pus în orar. Poate fi trimis și manual din tab-ul „Email" → Participanți. Variabile despre persoană: {prenume}, {nume}, {email}, {telefon}, {data_inscrierii}, {link_renunt} (linkul prin care își eliberează locul — rândul pe care stă dispare la cine n-are loc). Despre eveniment: {data_cursei}, {data_scurta}, {ora_start}, {ora_checkin}, {locul}, {numele_cursei}, {editia}.',
  },
  bulk_participant_reminder_final: {
    titlu: 'Automat · Reminder final (participanți)',
    descriere:
      'Al doilea text pe care îl poate folosi un reminder din orar — cel pentru ultimele ore („azi alergăm"), unde contează ora și locul, nu explicațiile. Îl alegi pe rândul de reminder, în /admin → „Eveniment". Aceleași variabile ca reminderul obișnuit.',
  },
  bulk_waitlist_anunt: {
    titlu: 'Trimitere în masă · Anunț eveniment (listă de așteptare)',
    descriere:
      'Anunțul cu link de înscriere, din tab-ul „Email" → Listă de așteptare. Variabile despre persoană: {prenume}, {nume}, {email}, {telefon}, {data_inscrierii}. Despre eveniment: {data_cursei}, {data_scurta}, {ora_start}, {ora_checkin}, {locul}, {numele_cursei}, {editia}.',
  },
  bulk_waitlist_promovare: {
    titlu: 'Automat · Promovare de pe lista de așteptare',
    descriere:
      'Pleacă SINGUR când se eliberează un loc și primul de pe listă urcă la participanți. Nu-l trimiți tu din niciun tab. Promovarea manuală, din butonul „Promovează", trimite alt text — șablonul „Confirmare (participanți)". Variabile despre persoană: {prenume}, {nume}, {email}, {telefon}. Despre eveniment: {data_cursei}, {data_scurta}, {ora_start}, {ora_checkin}, {locul}, {numele_cursei}, {editia} — ține-le, altfel omul află că are loc, dar nu și când sau unde. Ține și {link_renunt}: cine tocmai a urcat de pe listă poate, la rândul lui, să nu mai poată veni, iar fără link locul lui se blochează exact cum se blocase al celui pe care l-a înlocuit.',
  },
  event_badge: {
    titlu: 'Badge eveniment (capul fiecărui email)',
    descriere:
      'Eticheta lime din capul fiecărui email. Contează doar câmpul „Text"; „Subiect" e ignorat, dar nu-l lăsa gol. Acceptă variabilele de eveniment — implicit „{numele_cursei} · {data_scurta}", ca să se alinieze singur la ediția publicată.',
  },
};

export const AdminTemplatesTab = ({ token, onAuthError }: Props) => {
  const [rows, setRows] = useState<AdminEmailTemplate[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [draft, setDraft] = useState<Record<string, { subiect: string; text: string }>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [mesaj, setMesaj] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const mesajTimerRef = useRef<number | null>(null);

  const arataMesaj = useCallback((kind: 'ok' | 'err', text: string) => {
    if (mesajTimerRef.current !== null) window.clearTimeout(mesajTimerRef.current);
    setMesaj({ kind, text });
    mesajTimerRef.current = window.setTimeout(() => setMesaj(null), 3500);
  }, []);

  const refresh = useCallback(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    listEmailTemplates(token, controller.signal)
      .then((data) => {
        setRows(data);
        setLoadError(false);
        // Populăm draft-ul doar pentru șabloanele needitate încă.
        setDraft((prev) => {
          const next = { ...prev };
          for (const t of data) {
            if (!next[t.cheie]) next[t.cheie] = { subiect: t.subiect, text: t.text_email };
          }
          return next;
        });
      })
      .catch((err) => {
        if (controller.signal.aborted || onAuthError(err)) return;
        setLoadError(true);
      });
  }, [token, onAuthError]);

  useEffect(() => {
    refresh();
    return () => {
      abortRef.current?.abort();
      if (mesajTimerRef.current !== null) window.clearTimeout(mesajTimerRef.current);
    };
  }, [refresh]);

  const salveaza = async (cheie: string) => {
    const d = draft[cheie];
    if (!d) return;
    if (!d.subiect.trim() || !d.text.trim()) {
      arataMesaj('err', 'Subiectul și textul nu pot fi goale.');
      return;
    }
    setSaving(cheie);
    try {
      await saveEmailTemplate(token, cheie, d.subiect.trim(), d.text);
      arataMesaj('ok', 'Șablon salvat. Se aplică imediat la următorul email.');
      refresh();
    } catch (err) {
      if (onAuthError(err)) return;
      arataMesaj('err', 'Nu am putut salva. Încearcă din nou.');
    } finally {
      setSaving(null);
    }
  };

  const modificat = (t: AdminEmailTemplate): boolean => {
    const d = draft[t.cheie];
    return !!d && (d.subiect !== t.subiect || d.text !== t.text_email);
  };

  return (
    <section className="admin-table-section">
      <div className="admin-table-head">
        <h2>Șabloane de email</h2>
      </div>

      {mesaj && (
        <p className={`admin-tpl-msg${mesaj.kind === 'err' ? ' err' : ''}`} role="status">
          {mesaj.text}
        </p>
      )}

      {rows === null && !loadError && <div className="admin-empty">Se încarcă…</div>}
      {rows === null && loadError && (
        <div className="admin-empty">Nu am putut încărca șabloanele.</div>
      )}
      {rows?.length === 0 && <div className="admin-empty">Niciun șablon configurat.</div>}

      {rows?.map((t) => {
        const eticheta = ETICHETE[t.cheie];
        const d = draft[t.cheie] ?? { subiect: t.subiect, text: t.text_email };
        return (
          <div key={t.cheie} className="admin-tpl">
            <div className="admin-tpl-head">
              <h3>{eticheta?.titlu ?? t.cheie}</h3>
              <span className="admin-tpl-meta">
                Actualizat: {new Date(t.actualizat_la).toLocaleString('ro-RO')}
              </span>
            </div>
            {eticheta && <p className="admin-tpl-desc">{eticheta.descriere}</p>}

            <label className="admin-tpl-field">
              <span>Subiect</span>
              <input
                type="text"
                value={d.subiect}
                onChange={(e) =>
                  setDraft((p) => ({ ...p, [t.cheie]: { ...d, subiect: e.target.value } }))
                }
              />
            </label>

            <label className="admin-tpl-field">
              <span>Text</span>
              <textarea
                rows={14}
                value={d.text}
                onChange={(e) =>
                  setDraft((p) => ({ ...p, [t.cheie]: { ...d, text: e.target.value } }))
                }
              />
            </label>

            <div className="admin-tpl-actions">
              {modificat(t) && <span className="admin-tpl-dirty">Modificări nesalvate</span>}
              <button
                type="button"
                className="admin-btn-ghost"
                disabled={!modificat(t) || saving === t.cheie}
                onClick={() => setDraft((p) => ({ ...p, [t.cheie]: { subiect: t.subiect, text: t.text_email } }))}
              >
                Anulează
              </button>
              <button
                type="button"
                className="admin-btn-accent"
                disabled={!modificat(t) || saving === t.cheie}
                onClick={() => salveaza(t.cheie)}
              >
                {saving === t.cheie ? 'Se salvează…' : 'Salvează'}
              </button>
            </div>
          </div>
        );
      })}
    </section>
  );
};
