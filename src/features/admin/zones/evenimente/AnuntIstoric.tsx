import adminStyles from '../../components/AdminStyles.module.css';
import { useQuery } from '@tanstack/react-query';
import { useAdminResource } from '../../data/useAdminResource';
import { useAdminMutation } from '../../data/useAdminMutation';
import shared1 from './EvenimenteStyles.module.css';
import { useId, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { listEmailTemplates, previewAnunt, trimiteAnunt, trimiteTestAnunt } from './api';
import type { AdminEmailLogEntry, DestinatarAnunt } from './api';
import { useSesiuneAdmin } from '../../data/adminSession';
import { useEventConfig } from '../../../../shared/lib/useEventConfig';
import { fillTemplate } from './emailAudience';
import { cheieDifuzare } from './sendLock';
import { ziLunaOra } from '../../../../shared/lib/formatare';
import { EMAIL_RE } from '../../../../shared/lib/validation';
import { SABLON_ANUNT, VARIABILE_ANUNT, caDestinatar, cheieAdresa, destinatariRamasi, motivEroareAnunt, ultimulAnunt, variabileNesuportate } from './anunt';
import { Dialog } from '../../../../shared/ui/Dialog';

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

  const listaId = useId();
  const { data: lista, error: listaEsuata, refetch: incarca } = useQuery({
    queryKey: ['admin-anunt', token, listaId], queryFn: ({ signal }) => previewAnunt(token, signal), gcTime: 0,
  });
  useEffect(() => {
    if (lista) setDestinatari(lista.destinatari);
    if (listaEsuata) setEroareLista(motivEroareAnunt(listaEsuata));
  }, [lista, listaEsuata]);
  const { date: templates } = useAdminResource(listEmailTemplates, null);
  useEffect(() => {
    const t = templates?.find((r) => r.cheie === SABLON_ANUNT);
    if (t) setSablon({ subiect: t.subiect, text: t.text_email });
  }, [templates]);
  const sendTest = useAdminMutation(trimiteTestAnunt);
  const sendAnnouncement = useAdminMutation(trimiteAnunt);

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
      const r = await sendTest(token, {
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
      const r = await sendAnnouncement(token, {
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
    <section className={shared1['admin-email']} data-css="admin-email">
      <div className={shared1['admin-email-recipients']} data-css="admin-email-recipients">
        <div className={shared1['admin-email-recipients-head']} data-css="admin-email-recipients-head">
          <h2>Destinatari</h2>
          <span className={shared1['admin-email-count']} data-css="admin-email-count">
            {destinatari ? `${ramasi.length} selectați` : '…'}
          </span>
        </div>

        {audiente}

        <p className={adminStyles['admin-config-hint']} data-css="admin-config-hint">
          Toți cei care s-au înscris la o ediție, o dată pe persoană. Nu apar cei deja înscriși la
          ediția curentă și nici cei care s-au dezabonat — lista o calculează serverul.
        </p>

        {eroareLista ? (
          <div className={shared1['admin-empty']} data-css="admin-empty" role="alert">
            {eroareLista}{' '}
            <button type="button" className={shared1['admin-btn-outline']} data-css="admin-btn-outline" onClick={() => {
                setEroareLista(null);
                incarca();
              }}>
              Reîncearcă
            </button>
          </div>
        ) : destinatari === null ? (
          <div className={shared1['admin-empty']} data-css="admin-empty">Se calculează lista…</div>
        ) : destinatari.length === 0 ? (
          <div className={shared1['admin-empty']} data-css="admin-empty">
            Nimeni de anunțat — toți sunt deja înscriși la ediția curentă sau s-au dezabonat.
          </div>
        ) : (
          <>
            <label className={shared1['admin-email-recipient'] + ' all'} data-css="admin-email-recipient all">
              <input type="checkbox" checked={excluse.size === 0} onChange={comutaToti} />
              <span className={shared1['admin-email-all-label']} data-css="admin-email-all-label">
                Toți participanții de până acum ({destinatari.length})
              </span>
            </label>
            <div className={shared1['admin-email-recipient-list']} data-css="admin-email-recipient-list">
              {destinatari.map((d) => (
                <label key={cheieAdresa(d.email)} className={shared1['admin-email-recipient']} data-css="admin-email-recipient">
                  <input
                    type="checkbox"
                    checked={!excluse.has(cheieAdresa(d.email))}
                    onChange={() => comuta(d.email)}
                  />
                  <span className={shared1['admin-email-recipient-info']} data-css="admin-email-recipient-info">
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

      <div className={shared1['admin-email-compose-col']} data-css="admin-email-compose-col">
        <div className={shared1['admin-email-compose']} data-css="admin-email-compose">
          <label className={shared1['admin-email-field']} data-css="admin-email-field">
            <span className={shared1['admin-email-label']} data-css="admin-email-label">Subiect</span>
            <input
              type="text"
              placeholder="Subiectul anunțului"
              value={subiectCur}
              onChange={(e) => setSubiect(e.target.value)}
            />
          </label>

          <div className={shared1['admin-email-field']} data-css="admin-email-field">
            <div className={shared1['admin-email-body-head']} data-css="admin-email-body-head">
              <span className={shared1['admin-email-label']} data-css="admin-email-label">Mesaj</span>
              <div className={shared1['admin-email-vars']} data-css="admin-email-vars">
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
            <p className={adminStyles['admin-config-hint']} data-css="admin-config-hint">
              Linkul de dezabonare se adaugă automat la finalul fiecărui email.
            </p>
            {nesuportate.length > 0 && (
              <p className={shared1['admin-config-eroare']} data-css="admin-config-eroare" role="status">
                {nesuportate.join(', ')} nu se completează într-un anunț — serverul știe despre
                destinatar doar numele și adresa. Scoate-le din text.
              </p>
            )}
          </div>
        </div>

        <div className={shared1['admin-email-preview']} data-css="admin-email-preview">
          <div className={shared1['admin-email-preview-head']} data-css="admin-email-preview-head">
            <span className={shared1['admin-email-label']} data-css="admin-email-label">Previzualizare cu datele destinatarului</span>
            <div className={shared1['admin-email-pager']} data-css="admin-email-pager">
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
            <div className={shared1['admin-email-preview-body']} data-css="admin-email-preview-body">
              <div className={shared1['admin-email-preview-meta']} data-css="admin-email-preview-meta">
                <span className="to">
                  Către: {pv.nume} &lt;{pv.email}&gt;
                </span>
                <span className="subject">{fill(subiectCur)}</span>
              </div>
              <div className={shared1['admin-email-preview-text']} data-css="admin-email-preview-text">{fill(textCur)}</div>
            </div>
          ) : (
            <div className={shared1['admin-email-preview-empty']} data-css="admin-email-preview-empty">
              Niciun destinatar selectat pentru previzualizare.
            </div>
          )}
        </div>

        <div className={shared1['admin-email-field']} data-css="admin-email-field">
          <span className={shared1['admin-email-label']} data-css="admin-email-label">Trimite-mi întâi un test</span>
          <div className="admin-email-test" data-css="admin-email-test">
            <input
              type="email"
              placeholder="adresa ta"
              autoComplete="email"
              value={adresaTest}
              onChange={(e) => setAdresaTest(e.target.value)}
            />
            <button
              type="button"
              className={shared1['admin-btn-outline']} data-css="admin-btn-outline"
              onClick={trimiteTest}
              disabled={seTesteaza || !EMAIL_RE.test(adresaTest.trim()) || !continutGata}
            >
              {seTesteaza ? 'Se trimite…' : 'Trimite testul'}
            </button>
          </div>
        </div>

        {anterior && !readOnly && (
          <div className={`${adminStyles['admin-banner']} warn`} data-css="admin-banner warn" role="status">
            <strong>
              Ediția asta a fost deja anunțată pe {ziLunaOra(anterior.cand)}, către{' '}
              {anterior.catreCati} {anterior.catreCati === 1 ? 'om' : 'oameni'}.
            </strong>{' '}
            Un al doilea anunț ajunge la aceiași oameni. Dacă e intenționat — o corectură, o
            schimbare de dată — deblochează-l explicit.
            <div className={adminStyles['admin-confirm-actions']} data-css="admin-confirm-actions">
              <button
                type="button"
                className={shared1['admin-btn-outline']} data-css="admin-btn-outline"
                onClick={() => setSuprascriere({ cheie: cheieCurenta, jeton: `${Date.now()}` })}
                disabled={jetonValid !== null}
              >
                {jetonValid ? 'Deblocat — poți trimite' : 'Trimite oricum'}
              </button>
            </div>
          </div>
        )}

        <div className={shared1['admin-email-actions']} data-css="admin-email-actions">
          <button
            type="button"
            className={adminStyles['admin-btn-accent']} data-css="admin-btn-accent"
            onClick={() => setConfirmare(true)}
            disabled={seTrimite || readOnly || blocat || ramasi.length === 0 || !continutGata}
          >
            {seTrimite ? 'Se trimite…' : `Trimite anunțul (${ramasi.length})`}
          </button>
          <span className={shared1['admin-email-note']} data-css="admin-email-note">
            {readOnly
              ? 'Ediția deschisă e arhivată — trimiterea e blocată. Comută pe ediția curentă.'
              : 'Fiecare email pleacă separat, cu link de dezabonare, și apare în „Livrare".'}
          </span>
        </div>
      </div>

      {confirmare && (
        <Dialog titlu="Trimiți anunțul?" rol="alertdialog" clasa={adminStyles['admin-confirm--neutru']} onInchide={() => setConfirmare(false)}>
          <p>
            Pleacă la <strong>{ramasi.length}</strong>{' '}
            {ramasi.length === 1 ? 'om care a alergat' : 'oameni care au alergat'} cu voi.
            Emailul pleacă acum și nu se poate retrage.
          </p>
          <div className={adminStyles['admin-confirm-actions']} data-css="admin-confirm-actions">
            <button type="button" className={shared1['admin-confirm-delete']} data-css="admin-confirm-delete" onClick={trimite}>
              Da, trimite
            </button>
            <button
              type="button"
              className={adminStyles['admin-confirm-cancel']} data-css="admin-confirm-cancel"
              onClick={() => setConfirmare(false)}
            >
              Anulează
            </button>
          </div>
        </Dialog>
      )}
    </section>
  );
};
