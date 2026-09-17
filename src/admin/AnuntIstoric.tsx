import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  listEmailTemplates,
  previewAnunt,
  trimiteAnunt,
  trimiteTestAnunt,
} from '../lib/adminApi';
import type { AdminEmailLogEntry, DestinatarAnunt } from '../lib/adminApi';
import { useSesiuneAdmin } from './adminSession';
import { useEventConfig } from '../hooks/useEventConfig';
import { fillTemplate } from './emailAudience';
import { cheieDifuzare } from './sendLock';
import { ziLunaOra } from '../lib/formatare';
import { EMAIL_RE } from '../lib/validation';
import {
  SABLON_ANUNT,
  VARIABILE_ANUNT,
  caDestinatar,
  cheieAdresa,
  destinatariRamasi,
  motivEroareAnunt,
  ultimulAnunt,
  variabileNesuportate,
} from './anunt';

/**
 * Anunțul unei ediții noi către toți participanții de până acum.
 *
 * Componentă separată de `AdminEmailTab`, deși stă în același tab: acolo lista
 * se construiește în client, din rândurile ediției deschise, iar mesajele pleacă
 * gata compuse. Aici lista vine de la server și cuprinde toate edițiile, iar
 * compunerea per destinatar o face tot serverul — cu linkul de dezabonare, pe
 * care trimiterea obișnuită nu-l pune. Două fluxuri cu reguli diferite, deci
 * două componente, nu o ramificare la fiecare rând.
 */

type Props = {
  /** Ediția curentă — anunțul se jurnalizează pe ea. */
  editie: number;
  /** Jurnalul ediției — ca să știm dacă ediția a mai fost anunțată. */
  emailLog: AdminEmailLogEntry[];
  readOnly: boolean;
  /** Rândul de butoane de audiență, randat de tab — ca să poți ieși de aici. */
  audiente: ReactNode;
};

export const AnuntIstoric = ({ editie, emailLog, readOnly, audiente }: Props) => {
  const { token, showToast } = useSesiuneAdmin();
  const configPublicat = useEventConfig();

  const [destinatari, setDestinatari] = useState<DestinatarAnunt[] | null>(null);
  const [eroareLista, setEroareLista] = useState<string | null>(null);
  const [excluse, setExcluse] = useState<ReadonlySet<string>>(new Set());
  const [sablon, setSablon] = useState<{ subiect: string; text: string } | null>(null);
  const [subiect, setSubiect] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [previewIdx, setPreviewIdx] = useState(0);
  const [adresaTest, setAdresaTest] = useState('');
  const [seTesteaza, setSeTesteaza] = useState(false);
  const [seTrimite, setSeTrimite] = useState(false);
  const [confirmare, setConfirmare] = useState(false);
  // Jetonul „Trimite oricum", legat de difuzarea pentru care a fost emis — același
  // tipar ca în `AdminEmailTab`.
  const [suprascriere, setSuprascriere] = useState<{ cheie: string; jeton: string } | null>(null);
  const textRef = useRef<HTMLTextAreaElement | null>(null);

  /**
   * Lista de la server. Întoarce funcția de anulare, ca un răspuns sosit după
   * demontare (sau după o comutare de audiență) să nu scrie peste nimic.
   */
  const incarca = useCallback(() => {
    let anulat = false;
    previewAnunt(token)
      .then((r) => {
        if (!anulat) setDestinatari(r.destinatari);
      })
      .catch((err) => {
        if (!anulat) setEroareLista(motivEroareAnunt(err));
      });
    return () => {
      anulat = true;
    };
  }, [token]);

  useEffect(incarca, [incarca]);

  useEffect(() => {
    const c = new AbortController();
    listEmailTemplates(token, c.signal)
      .then((rows) => {
        const t = rows.find((r) => r.cheie === SABLON_ANUNT);
        if (t) setSablon({ subiect: t.subiect, text: t.text_email });
      })
      .catch(() => {
        /* fără șablon, câmpurile rămân goale și editabile */
      });
    return () => c.abort();
  }, [token]);

  const subiectCur = subiect ?? sablon?.subiect ?? '';
  const textCur = text ?? sablon?.text ?? '';

  const ramasi = useMemo(
    () => (destinatari ? destinatariRamasi(destinatari, excluse) : []),
    [destinatari, excluse]
  );
  const pvIdx = Math.min(previewIdx, Math.max(0, ramasi.length - 1));
  const pv = ramasi.length ? caDestinatar(ramasi[pvIdx]) : null;
  const fill = (t: string) => (pv ? fillTemplate(t, pv, '', configPublicat) : t);

  const anterior = useMemo(() => ultimulAnunt(emailLog, editie), [emailLog, editie]);
  const cheieCurenta = cheieDifuzare(editie, 'istoric', subiectCur);
  const jetonValid = suprascriere?.cheie === cheieCurenta ? suprascriere.jeton : null;
  const blocat = anterior !== null && jetonValid === null;
  const nesuportate = variabileNesuportate(subiectCur, textCur);
  const continutGata = subiectCur.trim() !== '' && textCur.trim() !== '';

  const comuta = (email: string) => {
    const cheie = cheieAdresa(email);
    const next = new Set(excluse);
    if (next.has(cheie)) next.delete(cheie);
    else next.add(cheie);
    setExcluse(next);
    setPreviewIdx(0);
  };

  const comutaToti = () => {
    setExcluse(
      excluse.size === 0 && destinatari
        ? new Set(destinatari.map((d) => cheieAdresa(d.email)))
        : new Set()
    );
    setPreviewIdx(0);
  };

  const insereaza = (v: string) => {
    const el = textRef.current;
    if (el && typeof el.selectionStart === 'number') {
      const s = el.selectionStart;
      const e = el.selectionEnd;
      setText(textCur.slice(0, s) + v + textCur.slice(e));
    } else {
      setText(textCur + v);
    }
  };

  const trimiteTest = async () => {
    if (seTesteaza || !EMAIL_RE.test(adresaTest.trim()) || !continutGata) return;
    setSeTesteaza(true);
    try {
      const r = await trimiteTestAnunt(token, {
        catre: adresaTest.trim(),
        subiect: subiectCur,
        text: textCur,
        sablon: SABLON_ANUNT,
      });
      showToast(
        r.sent > 0
          ? { kind: 'success', msg: `Test trimis la ${adresaTest.trim()}.` }
          : { kind: 'error', msg: 'Testul nu a plecat — vezi motivul în „Livrare".' }
      );
    } catch (err) {
      showToast({ kind: 'error', msg: motivEroareAnunt(err) });
    } finally {
      setSeTesteaza(false);
    }
  };

  const trimite = async () => {
    setConfirmare(false);
    if (seTrimite || readOnly || ramasi.length === 0 || !continutGata) return;
    setSeTrimite(true);
    try {
      const r = await trimiteAnunt(token, {
        subiect: subiectCur,
        text: textCur,
        exclude: [...excluse],
        onceKey: cheieDifuzare(editie, 'istoric', subiectCur, jetonValid ?? undefined),
        sablon: SABLON_ANUNT,
      });
      if (r.skipped) {
        showToast({
          kind: 'error',
          msg: 'Anunțul ăsta a plecat deja. Folosește „Trimite oricum" dacă chiar vrei să-l repeți.',
        });
        return;
      }
      setSuprascriere(null);
      showToast(
        r.failed > 0
          ? {
              kind: r.sent > 0 ? 'success' : 'error',
              msg: `Anunț trimis la ${r.sent}, eșuat la ${r.failed}. Eșecurile se pot rejuca din „Livrare".`,
            }
          : { kind: 'success', msg: `Anunț trimis la ${r.sent} ${r.sent === 1 ? 'om' : 'oameni'}.` }
      );
    } catch (err) {
      showToast({ kind: 'error', msg: motivEroareAnunt(err) });
    } finally {
      setSeTrimite(false);
    }
  };

  return (
    <section className="admin-email">
      <div className="admin-email-recipients">
        <div className="admin-email-recipients-head">
          <h2>Destinatari</h2>
          <span className="admin-email-count">
            {destinatari ? `${ramasi.length} selectați` : '…'}
          </span>
        </div>

        {audiente}

        <p className="admin-config-hint">
          Toți cei care s-au înscris la o ediție, o dată pe persoană. Nu apar cei deja înscriși la
          ediția curentă și nici cei care s-au dezabonat — lista o calculează serverul.
        </p>

        {eroareLista ? (
          <div className="admin-empty" role="alert">
            {eroareLista}{' '}
            <button type="button" className="admin-btn-outline" onClick={() => {
                setEroareLista(null);
                incarca();
              }}>
              Reîncearcă
            </button>
          </div>
        ) : destinatari === null ? (
          <div className="admin-empty">Se calculează lista…</div>
        ) : destinatari.length === 0 ? (
          <div className="admin-empty">
            Nimeni de anunțat — toți sunt deja înscriși la ediția curentă sau s-au dezabonat.
          </div>
        ) : (
          <>
            <label className="admin-email-recipient all">
              <input type="checkbox" checked={excluse.size === 0} onChange={comutaToti} />
              <span className="admin-email-all-label">
                Toți participanții de până acum ({destinatari.length})
              </span>
            </label>
            <div className="admin-email-recipient-list">
              {destinatari.map((d) => (
                <label key={cheieAdresa(d.email)} className="admin-email-recipient">
                  <input
                    type="checkbox"
                    checked={!excluse.has(cheieAdresa(d.email))}
                    onChange={() => comuta(d.email)}
                  />
                  <span className="admin-email-recipient-info">
                    <span className="name">{d.nume}</span>
                    <span className="email">
                      {d.email} · ultima dată la ediția {d.ultima_editie}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="admin-email-compose-col">
        <div className="admin-email-compose">
          <label className="admin-email-field">
            <span className="admin-email-label">Subiect</span>
            <input
              type="text"
              placeholder="Subiectul anunțului"
              value={subiectCur}
              onChange={(e) => setSubiect(e.target.value)}
            />
          </label>

          <div className="admin-email-field">
            <div className="admin-email-body-head">
              <span className="admin-email-label">Mesaj</span>
              <div className="admin-email-vars">
                <span>Inserează câmp:</span>
                {VARIABILE_ANUNT.map((v) => (
                  <button key={v} type="button" onClick={() => insereaza(v)}>
                    {v}
                  </button>
                ))}
              </div>
            </div>
            <textarea
              ref={textRef}
              rows={12}
              placeholder="Scrie anunțul aici…"
              value={textCur}
              onChange={(e) => setText(e.target.value)}
            />
            <p className="admin-config-hint">
              Linkul de dezabonare se adaugă automat la finalul fiecărui email.
            </p>
            {nesuportate.length > 0 && (
              <p className="admin-config-eroare" role="status">
                {nesuportate.join(', ')} nu se completează într-un anunț — serverul știe despre
                destinatar doar numele și adresa. Scoate-le din text.
              </p>
            )}
          </div>
        </div>

        <div className="admin-email-preview">
          <div className="admin-email-preview-head">
            <span className="admin-email-label">Previzualizare cu datele destinatarului</span>
            <div className="admin-email-pager">
              <button type="button" onClick={() => setPreviewIdx(Math.max(0, pvIdx - 1))}>
                ‹
              </button>
              <span>{pv ? `${pvIdx + 1} / ${ramasi.length}` : '0 / 0'}</span>
              <button
                type="button"
                onClick={() => setPreviewIdx(Math.min(Math.max(0, ramasi.length - 1), pvIdx + 1))}
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
                <span className="subject">{fill(subiectCur)}</span>
              </div>
              <div className="admin-email-preview-text">{fill(textCur)}</div>
            </div>
          ) : (
            <div className="admin-email-preview-empty">
              Niciun destinatar selectat pentru previzualizare.
            </div>
          )}
        </div>

        <div className="admin-email-field">
          <span className="admin-email-label">Trimite-mi întâi un test</span>
          <div className="admin-email-test">
            <input
              type="email"
              placeholder="adresa ta"
              autoComplete="email"
              value={adresaTest}
              onChange={(e) => setAdresaTest(e.target.value)}
            />
            <button
              type="button"
              className="admin-btn-outline"
              onClick={trimiteTest}
              disabled={seTesteaza || !EMAIL_RE.test(adresaTest.trim()) || !continutGata}
            >
              {seTesteaza ? 'Se trimite…' : 'Trimite testul'}
            </button>
          </div>
        </div>

        {anterior && !readOnly && (
          <div className="admin-banner warn" role="status">
            <strong>
              Ediția asta a fost deja anunțată pe {ziLunaOra(anterior.cand)}, către{' '}
              {anterior.catreCati} {anterior.catreCati === 1 ? 'om' : 'oameni'}.
            </strong>{' '}
            Un al doilea anunț ajunge la aceiași oameni. Dacă e intenționat — o corectură, o
            schimbare de dată — deblochează-l explicit.
            <div className="admin-confirm-actions">
              <button
                type="button"
                className="admin-btn-outline"
                onClick={() => setSuprascriere({ cheie: cheieCurenta, jeton: `${Date.now()}` })}
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
            onClick={() => setConfirmare(true)}
            disabled={seTrimite || readOnly || blocat || ramasi.length === 0 || !continutGata}
          >
            {seTrimite ? 'Se trimite…' : `Trimite anunțul (${ramasi.length})`}
          </button>
          <span className="admin-email-note">
            {readOnly
              ? 'Ediția deschisă e arhivată — trimiterea e blocată. Comută pe ediția curentă.'
              : 'Fiecare email pleacă separat, cu link de dezabonare, și apare în „Livrare".'}
          </span>
        </div>
      </div>

      {confirmare && (
        <div
          className="admin-confirm-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setConfirmare(false);
          }}
        >
          <div className="admin-confirm" role="alertdialog" aria-modal="true">
            <h3>Trimiți anunțul?</h3>
            <p>
              Pleacă la <strong>{ramasi.length}</strong>{' '}
              {ramasi.length === 1 ? 'om care a alergat' : 'oameni care au alergat'} cu voi.
              Emailul pleacă acum și nu se poate retrage.
            </p>
            <div className="admin-confirm-actions">
              <button type="button" className="admin-confirm-delete" onClick={trimite}>
                Da, trimite
              </button>
              <button
                type="button"
                className="admin-confirm-cancel"
                onClick={() => setConfirmare(false)}
              >
                Anulează
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
