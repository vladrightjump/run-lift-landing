import { useCallback, useEffect, useRef, useState } from 'react';
import {
  listEmailTemplates,
  listRegistrations,
  previewEmailHtml,
  saveEmailTemplate,
} from '../lib/adminApi';
import type { AdminEmailTemplate, EmailPreview } from '../lib/adminApi';
import { useSesiuneAdmin } from './adminSession';
import { useAdminResource } from './useAdminResource';

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

export const AdminTemplatesTab = () => {
  const { token, onAuthError } = useSesiuneAdmin();
  const [draft, setDraft] = useState<Record<string, { subiect: string; text: string }>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [mesaj, setMesaj] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const mesajTimerRef = useRef<number | null>(null);

  const arataMesaj = useCallback((kind: 'ok' | 'err', text: string) => {
    if (mesajTimerRef.current !== null) window.clearTimeout(mesajTimerRef.current);
    setMesaj({ kind, text });
    mesajTimerRef.current = window.setTimeout(() => setMesaj(null), 3500);
  }, []);

  const { date: rows, eroare: loadError, reincarca: refresh } = useAdminResource(
    listEmailTemplates,
    // Formular în care se SCRIE: nu-l reîmprospătăm sub cursor. Se reîncarcă
    // doar la montare și după fiecare salvare.
    null
  );

  // Ciorna se populează doar pentru șabloanele needitate încă: o reîmprospătare
  // nu are voie să calce peste ce tocmai a scris organizatorul.
  useEffect(() => {
    if (!rows) return;
    setDraft((prev) => {
      const next = { ...prev };
      for (const t of rows) {
        if (!next[t.cheie]) next[t.cheie] = { subiect: t.subiect, text: t.text_email };
      }
      return next;
    });
  }, [rows]);

  useEffect(
    () => () => {
      if (mesajTimerRef.current !== null) window.clearTimeout(mesajTimerRef.current);
    },
    []
  );

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

  /**
   * Previzualizarea deschisă, dacă e vreuna — HTML-ul randat de aceeași funcție
   * prin care trec toate trimiterile.
   *
   * O previzualizare de TEXT exista deja (în tabul „Emailuri"); gaura era exact
   * HTML-ul, adică locul unde se strică lucrurile: linkuri rupte și variabile
   * necompletate nu se văd în textul brut cu `{prenume}` în el.
   */
  const [previzualizare, setPrevizualizare] = useState<
    { cheie: string; date: EmailPreview | null; eroare: string | null } | null
  >(null);
  /** Destinatarul ales — variabilele se completează cu datele lui reale. */
  const [destinatar, setDestinatar] = useState('');

  // Lista de destinatari posibili. Aceleași rânduri ca tabul „Participanți";
  // serverul alege oricum primul dacă nu se cere niciunul anume.
  const { date: participanti } = useAdminResource(
    useCallback((t: string, signal: AbortSignal) => listRegistrations(t, undefined, signal), []),
    null
  );

  /**
   * `pentru` se dă explicit, nu se citește din `destinatar`: schimbarea
   * destinatarului cheamă randarea din același handler care setează starea, iar
   * închiderea ar purta încă valoarea veche — previzualizarea ar rămâne cu un
   * pas în urma selectului, tăcut.
   */
  /**
   * Numărul cererii de previzualizare aflate în curs.
   *
   * Schimbarea destinatarului cheamă o randare nouă peste una încă în zbor.
   * Fără număr de ordine, un răspuns mai lent al cererii ANTERIOARE ar ateriza
   * ultimul și ar rămâne pe ecran: HTML-ul altcuiva, cu linkurile și tokenurile
   * lui, sub un select care arată alt nume. Aceeași gardă pe care restul
   * backoffice-ului o face cu `signal.aborted`.
   */
  const cerereaCurenta = useRef(0);

  const previzualizeaza = async (cheie: string, pentru = destinatar) => {
    const aMea = ++cerereaCurenta.current;
    setPrevizualizare({ cheie, date: null, eroare: null });
    try {
      const date = await previewEmailHtml(token, cheie, pentru || undefined);
      if (aMea !== cerereaCurenta.current) return;
      setPrevizualizare({ cheie, date, eroare: null });
    } catch (err) {
      if (aMea !== cerereaCurenta.current) return;
      if (onAuthError(err)) return;
      const text = err instanceof Error ? err.message : String(err);
      setPrevizualizare({
        cheie,
        date: null,
        eroare: text.includes('recipient_not_eligible')
          ? 'Persoana aleasă nu mai e destinatar al ediției — s-a dezabonat sau a fost ștearsă. Alege pe altcineva.'
          : text.includes('no_recipient')
            ? 'Ediția n-are niciun destinatar înscris, deci variabilele n-au cu ce fi completate.'
            : 'Nu am putut randa previzualizarea.',
      });
    }
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
                // Randează șablonul SALVAT. Cu modificări nesalvate pe ecran,
                // previzualizarea ar răspunde la altă întrebare decât cea pusă:
                // ce pleacă e ce e în DB.
                disabled={modificat(t)}
                title={
                  modificat(t)
                    ? 'Salvează întâi — previzualizarea arată șablonul din baza de date'
                    : 'Vezi HTML-ul exact cum pleacă'
                }
                onClick={() => previzualizeaza(t.cheie)}
              >
                Previzualizează
              </button>
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

            {previzualizare?.cheie === t.cheie && (
              <div className="admin-tpl-preview">
                <div className="admin-tpl-preview-bar">
                  <label>
                    <span>Pentru</span>
                    <select
                      value={destinatar}
                      onChange={(e) => {
                        setDestinatar(e.target.value);
                        void previzualizeaza(t.cheie, e.target.value);
                      }}
                    >
                      <option value="">Primul înscris al ediției</option>
                      {(participanti ?? []).map((p) => (
                        <option key={p.id} value={p.email}>
                          {p.nume} · {p.email}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    className="admin-btn-ghost"
                    onClick={() => setPrevizualizare(null)}
                  >
                    Închide
                  </button>
                </div>

                {previzualizare.eroare && (
                  <p className="admin-tpl-msg err" role="status">
                    {previzualizare.eroare}
                  </p>
                )}
                {!previzualizare.eroare && !previzualizare.date && (
                  <div className="admin-empty">Se randează…</div>
                )}
                {previzualizare.date && (
                  <>
                    <p className="admin-tpl-preview-meta">
                      <strong>{previzualizare.date.subiect}</strong> — completat pentru{' '}
                      {previzualizare.date.pentru.nume} ({previzualizare.date.pentru.email})
                    </p>
                    {/* `sandbox` gol: fără scripturi, fără forme, fără navigare.
                        Emailul e HTML static, iar CSP-ul paginii de admin rămâne
                        neatins — randarea nu se amestecă cu documentul gazdă. */}
                    <iframe
                      title={`Previzualizare ${eticheta?.titlu ?? t.cheie}`}
                      className="admin-tpl-preview-frame"
                      sandbox=""
                      srcDoc={previzualizare.date.html}
                    />
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
};
