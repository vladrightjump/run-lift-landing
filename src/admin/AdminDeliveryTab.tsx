import { useEffect, useMemo, useState } from 'react';
import { toCsv } from '../lib/csv';
import { sendBulkEmail, listEmailTemplates, InvalidTokenError } from '../lib/adminApi';
import type { AdminEmailLogEntry, AdminRegistration } from '../lib/adminApi';
import { normalizeParticipant, fillTemplate } from './emailAudience';
import {
  motivEsec as motiv,
  ultimaIncercarePerCheie,
  emailuriRetrimisibile,
  participantiFaraEmail,
  acoperire,
  COMUNICARI_EDITIE,
} from './deliveryLog';
import type { StareCelula } from './deliveryLog';

type Props = {
  token: string;
  editie: number;
  log: AdminEmailLogEntry[] | null;
  /** Participanții ediției — ca să vedem cine n-a primit NIMIC. */
  participanti: AdminRegistration[];
  /** Ediție de arhivă: nu retrimitem emailuri în trecut. */
  readOnly: boolean;
  onRefresh: () => void;
  showToast: (toast: { kind: 'error' | 'success'; msg: string }) => void;
};

type Filtru = 'toate' | 'esuate' | 'trimise' | 'fara-email';

/** Cum se citește o celulă din fișă. `lipsa` e o stare, nu o absență. */
const CELULA: Record<StareCelula, { semn: string; titlu: string }> = {
  trimis: { semn: '✓', titlu: 'trimis' },
  esuat: { semn: '✕', titlu: 'eșuat' },
  lipsa: { semn: '–', titlu: 'nu s-a încercat niciodată' },
};

const MOD_LABELS: Record<string, string> = {
  admin: 'Trimis manual',
  confirm: 'Confirmare înscriere',
  promoted: 'Promovat din așteptare',
  info: 'Confirmare adresă',
  broadcast: 'Reminder / anunț',
};

const timpFmt = new Intl.DateTimeFormat('ro-RO', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Chisinau',
});

export const AdminDeliveryTab = ({
  token,
  editie,
  log,
  participanti,
  readOnly,
  onRefresh,
  showToast,
}: Props) => {
  const [filtru, setFiltru] = useState<Filtru>('toate');
  const [query, setQuery] = useState('');
  const [deschis, setDeschis] = useState<string | null>(null);
  const [retrimit, setRetrimit] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [confTpl, setConfTpl] = useState<{ subiect: string; text_email: string } | null>(null);

  // Șablonul de confirmare (editabil din „Șabloane"), pentru retrimiterea manuală
  // către un participant care nu a primit (ex. s-a înscris cu email greșit, apoi
  // l-ai corectat în „Participanți"). Fallback generic dacă lipsește din DB.
  useEffect(() => {
    const c = new AbortController();
    listEmailTemplates(token, c.signal)
      .then((ts) => setConfTpl(ts.find((t) => t.cheie === 'bulk_participant_confirmare') ?? null))
      .catch(() => {
        /* liniște — folosim fallback-ul */
      });
    return () => c.abort();
  }, [token]);

  const intrari = useMemo(() => log ?? [], [log]);

  // Ultima încercare pentru fiecare (adresă + subiect). O retrimitere reușită
  // „repară" un eșec vechi, deci contorul de eșecuri se uită doar la ultima stare.
  const ultimele = useMemo(() => ultimaIncercarePerCheie(intrari), [intrari]);

  const nelivrate = useMemo(
    () => [...ultimele.values()].filter((e) => e.status === 'esuat'),
    [ultimele]
  );

  /**
   * Ce putem retrimite de aici: DOAR emailurile trimise manual din backoffice.
   *
   * Retrimiterea reface mesajul din jurnal și-l trece prin modul `admin`, care nu
   * știe de contextul celorlalte moduri:
   *  • `broadcast` — textul e salvat ÎNAINTE ca funcția Edge să adauge linkul de
   *    dezabonare, iar modul `admin` nu-l adaugă deloc; în plus s-ar sări peste
   *    filtrul `dezabonat_la is null`, deci ar pleca email și către cine s-a
   *    dezabonat între timp;
   *  • `info` (double opt-in) — s-ar sări peste cooldown-ul de 10 minute și peste
   *    `mark_confirmation_sent`, deci adresa ar rămâne eligibilă pentru încă unul;
   *  • `confirm`/`promoted` — se re-declanșează din fluxul lor, nu de aici.
   * Pentru astea reîncercarea corectă e din fluxul propriu, nu o retrimitere oarbă.
   */
  const retrimisibile = useMemo(() => emailuriRetrimisibile(nelivrate), [nelivrate]);
  const nerezolvabile = nelivrate.length - retrimisibile.length;

  // Participanți care nu apar deloc în jurnal — n-au primit niciun email.
  const fataDeEmail = useMemo(
    () => participantiFaraEmail(participanti, intrari),
    [participanti, intrari]
  );

  // Fișa de acoperire — participanții ediției × comunicările datorate.
  // Rămâne alături de „fără niciun email": aceea e cazul tot-sau-nimic, pe care
  // matricea nu-l scoate în evidență.
  const randuriAcoperire = useMemo(
    () => acoperire(participanti, intrari),
    [participanti, intrari]
  );

  const nrTrimise = intrari.filter((e) => e.status === 'trimis').length;
  const destinatari = new Set(intrari.map((e) => e.email.toLowerCase())).size;

  // „Nelivrate" = ultima încercare per adresă+subiect e eșec. Un eșec urmat de o
  // retrimitere reușită NU mai apare aici — altfel contorul din etichetă (care
  // numără exact asta) ar arăta altceva decât lista de dedesubt.
  const idNelivrate = useMemo(() => new Set(nelivrate.map((e) => e.id)), [nelivrate]);

  const q = query.trim().toLowerCase();
  const filtrate = intrari.filter((e) => {
    if (filtru === 'esuate' && !idNelivrate.has(e.id)) return false;
    if (filtru === 'trimise' && e.status !== 'trimis') return false;
    if (!q) return true;
    return `${e.email} ${e.nume} ${e.subiect}`.toLowerCase().includes(q);
  });

  const retrimiteEsuate = async () => {
    if (retrimit || retrimisibile.length === 0) return;
    setRetrimit(true);
    try {
      const res = await sendBulkEmail(
        token,
        retrimisibile.map((e) => ({ to: e.email, subject: e.subiect, text: e.text_email })),
        {
          audience: retrimisibile[0].audienta === 'asteptare' ? 'asteptare' : 'participanti',
          editie,
        }
      );
      showToast({
        kind: res.failed === 0 ? 'success' : 'error',
        msg:
          res.failed === 0
            ? `Retrimis cu succes către ${res.sent}.`
            : `Retrimise ${res.sent}, tot eșuate ${res.failed}.`,
      });
      onRefresh();
    } catch (err) {
      showToast({
        kind: 'error',
        msg:
          err instanceof InvalidTokenError
            ? 'Sesiune expirată — reautentifică-te.'
            : 'Retrimiterea nu a mers. Încearcă din nou.',
      });
    } finally {
      setRetrimit(false);
    }
  };

  // Retrimite confirmarea către UN participant, la adresa lui curentă (după ce ai
  // corectat un email greșit). Merge prin modul `admin` (spre deosebire de `confirm`,
  // care are fereastră de 15 min) și apare în jurnal.
  const CONF_FALLBACK = {
    subiect: 'Confirmare înscriere — Run + Lift',
    text_email:
      'Salut, {prenume}!\n\nÎnscrierea ta la Run + Lift este confirmată. Ne vedem la start!\n\nEchipa Run + Lift',
  };

  const trimiteConfirmare = async (p: AdminRegistration) => {
    if (sendingId || readOnly) return;
    const tpl = confTpl ?? CONF_FALLBACK;
    const r = normalizeParticipant(p);
    const data = new Date(p.created_at).toLocaleDateString('ro-RO');
    setSendingId(p.id);
    try {
      const res = await sendBulkEmail(
        token,
        [
          {
            to: p.email,
            subject: fillTemplate(tpl.subiect, r, data),
            text: fillTemplate(tpl.text_email, r, data),
          },
        ],
        { audience: 'participanti', editie }
      );
      showToast({
        kind: res.sent > 0 ? 'success' : 'error',
        msg:
          res.sent > 0
            ? `Confirmare trimisă către ${p.email}.`
            : 'Nu s-a putut trimite. Verifică adresa și încearcă din nou.',
      });
      onRefresh();
    } catch (err) {
      showToast({
        kind: 'error',
        msg:
          err instanceof InvalidTokenError
            ? 'Sesiune expirată — reautentifică-te.'
            : 'Trimiterea nu a mers. Încearcă din nou.',
      });
    } finally {
      setSendingId(null);
    }
  };

  const exportCsv = () => {
    // Filtrul „fără niciun email" arată participanți, nu rânduri de jurnal —
    // exportul trebuie să scoată exact ce e pe ecran.
    const header =
      filtru === 'fara-email'
        ? ['Nume', 'Telefon', 'Email', 'Înscris', 'Status']
        : ['Data', 'Nume', 'Email', 'Tip', 'Subiect', 'Status', 'Cod', 'Motiv'];
    const lines =
      filtru === 'fara-email'
        ? fataDeEmail.map((p) => [
            p.nume,
            p.telefon,
            p.email,
            new Date(p.created_at).toLocaleString('ro-RO'),
            'niciun email',
          ])
        : filtrate.map((e) => [
            new Date(e.created_at).toLocaleString('ro-RO'),
            e.nume,
            e.email,
            MOD_LABELS[e.mod] ?? e.mod,
            e.subiect,
            e.status === 'trimis' ? 'trimis' : 'eșuat',
            e.provider_status === null ? '' : String(e.provider_status),
            e.status === 'esuat' ? motiv(e) : '',
          ]);
    const csv = toCsv([header, ...lines]);
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download =
      filtru === 'fara-email'
        ? `run-lift-fara-email-editia-${editie}.csv`
        : `run-lift-livrare-editia-${editie}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <section className="admin-table-section">
      <div className="admin-stats">
        <div className="admin-stat">
          <span className="admin-stat-label">Emailuri trimise</span>
          <span className="admin-stat-value accent">{nrTrimise}</span>
        </div>
        <div className="admin-stat">
          <span className="admin-stat-label">Nelivrate acum</span>
          <span className={`admin-stat-value${nelivrate.length > 0 ? ' low' : ''}`}>
            {nelivrate.length}
          </span>
        </div>
        <div className="admin-stat">
          <span className="admin-stat-label">Adrese atinse</span>
          <span className="admin-stat-value">{destinatari}</span>
        </div>
        <div className="admin-stat">
          <span className="admin-stat-label">Participanți fără niciun email</span>
          <span className={`admin-stat-value${fataDeEmail.length > 0 ? ' low' : ''}`}>
            {fataDeEmail.length}
          </span>
        </div>
      </div>

      <section className="admin-acoperire">
        <div className="admin-table-head">
          <h3>Fișa de acoperire</h3>
          <p className="admin-hint">
            Cine n-a primit ce. Rândurile sunt participanții ediției, coloanele sunt comunicările
            pe care ediția le datorează. Un email reușit de un tip nu mai poate ascunde un eșec de
            alt tip.
          </p>
        </div>
        <div className="admin-table-wrap">
          <div className="admin-table admin-acoperire-table">
            <div className="admin-row admin-row-head">
              <span>Persoană</span>
              {COMUNICARI_EDITIE.map((c) => (
                <span key={c.cheie}>{c.eticheta}</span>
              ))}
            </div>
            {randuriAcoperire.length === 0 && (
              <div className="admin-empty">Nu sunt participanți pe ediția asta.</div>
            )}
            {randuriAcoperire.map(({ participant, celule }) => (
              <div key={participant.id} className="admin-row">
                <span className="admin-cell-name">{participant.nume}</span>
                {COMUNICARI_EDITIE.map((c) => {
                  const stare = celule[c.cheie] ?? 'lipsa';
                  return (
                    <span
                      key={c.cheie}
                      className={`admin-celula ${stare}`}
                      title={`${c.eticheta}: ${CELULA[stare].titlu}`}
                    >
                      {CELULA[stare].semn}
                    </span>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="admin-sursa-tabs">
        {(
          [
            ['toate', `Toate (${intrari.length})`],
            ['trimise', `Trimise (${nrTrimise})`],
            ['esuate', `Nelivrate (${nelivrate.length})`],
            ['fara-email', `Fără niciun email (${fataDeEmail.length})`],
          ] as const
        ).map(([val, eticheta]) => (
          <button
            key={val}
            type="button"
            className={`admin-sursa-tab${filtru === val ? ' activ' : ''}`}
            onClick={() => setFiltru(val)}
          >
            {eticheta}
          </button>
        ))}
      </div>

      {!readOnly && nerezolvabile > 0 && (
        <div className="admin-banner" role="status">
          <strong>
            {nerezolvabile}{' '}
            {nerezolvabile === 1 ? 'email nelivrat nu se poate' : 'emailuri nelivrate nu se pot'}{' '}
            retrimite de aici.
          </strong>{' '}
          Sunt automate (confirmare, promovare, reminder, confirmare de adresă) și depind de
          contextul lor — linkul de dezabonare, cooldown-ul anti-spam, filtrul de dezabonați. O
          retrimitere oarbă le-ar ocoli. Le reîncerci din fluxul lor: reminderul din „Emailuri",
          confirmarea prin re-înscriere.
        </div>
      )}

      <div className="admin-table-head">
        <h2>Livrare emailuri · ediția {editie}</h2>
        <div className="admin-table-actions">
          <input
            type="text"
            className="admin-search"
            placeholder="Caută nume, email, subiect…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {!readOnly && retrimisibile.length > 0 && (
            <button
              type="button"
              className="admin-btn-outline"
              onClick={retrimiteEsuate}
              disabled={retrimit}
            >
              {retrimit ? 'Se retrimite…' : `Retrimite nelivratele (${retrimisibile.length})`}
            </button>
          )}
          <button type="button" className="admin-btn-accent" onClick={exportCsv}>
            Export CSV
          </button>
        </div>
      </div>

      {filtru === 'fara-email' ? (
        <div className="admin-table-wrap">
          <div className="admin-table admin-wait">
            <div className="admin-row admin-row-head">
              <span>#</span>
              <span>Nume</span>
              <span>Telefon</span>
              <span>Email</span>
              <span>Înscris</span>
              <span className="right">Status</span>
            </div>
            {fataDeEmail.map((p, i) => (
              <div key={p.id} className="admin-row">
                <span className="admin-cell-nr">{String(i + 1).padStart(2, '0')}</span>
                <span className="admin-cell-name">{p.nume}</span>
                <a className="admin-cell-link" href={`tel:${p.telefon}`}>
                  {p.telefon}
                </a>
                <a className="admin-cell-link ellipsis" href={`mailto:${p.email}`}>
                  {p.email}
                </a>
                <span className="admin-cell-date">
                  {new Date(p.created_at).toLocaleDateString('ro-RO')}
                </span>
                <span className="admin-cell-actions">
                  {readOnly ? (
                    <span className="admin-mail-badge niciunul">niciun email</span>
                  ) : (
                    <button
                      type="button"
                      className="admin-btn-outline"
                      onClick={() => trimiteConfirmare(p)}
                      disabled={sendingId !== null}
                      title={`Trimite confirmarea către ${p.email}`}
                    >
                      {sendingId === p.id ? 'Se trimite…' : 'Trimite confirmarea'}
                    </button>
                  )}
                </span>
              </div>
            ))}
            {fataDeEmail.length === 0 && (
              <div className="admin-empty">
                Toți participanții ediției au primit cel puțin un email.
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="admin-table-wrap">
          <div className="admin-table admin-livrare">
            <div className="admin-row admin-row-head">
              <span>Când</span>
              <span>Destinatar</span>
              <span>Tip</span>
              <span>Subiect</span>
              <span className="right">Status</span>
            </div>
            {filtrate.map((e) => (
              <div
                key={e.id}
                className={`admin-row admin-livrare-row${e.status === 'esuat' ? ' esuat' : ''}${
                  deschis === e.id ? ' deschis' : ''
                }`}
              >
                <button
                  type="button"
                  className="admin-livrare-main"
                  onClick={() => setDeschis(deschis === e.id ? null : e.id)}
                  title={e.status === 'esuat' ? 'Vezi motivul eșecului' : 'Vezi textul trimis'}
                >
                  <span className="admin-cell-date">{timpFmt.format(new Date(e.created_at))}</span>
                  <span className="admin-cell-name">
                    {e.nume || e.email}
                    {e.nume && <span className="admin-livrare-email">{e.email}</span>}
                  </span>
                  <span className="admin-cell-date">{MOD_LABELS[e.mod] ?? e.mod}</span>
                  <span className="admin-cell-subject ellipsis">{e.subiect}</span>
                  <span className="right">
                    <span className={`admin-mail-badge ${e.status}`}>
                      {e.status === 'trimis' ? '✓ trimis' : '✕ nelivrat'}
                    </span>
                  </span>
                </button>
                {deschis === e.id && (
                  <div className="admin-livrare-detaliu">
                    {e.status === 'esuat' && (
                      <p className="admin-livrare-eroare">
                        <strong>Motiv:</strong> {motiv(e)}
                        {e.provider_status !== null && ` (HTTP ${e.provider_status})`}
                      </p>
                    )}
                    <pre className="admin-livrare-text">{e.text_email || '(fără text)'}</pre>
                  </div>
                )}
              </div>
            ))}
            {log === null && <div className="admin-empty">Se încarcă…</div>}
            {log !== null && filtrate.length === 0 && (
              <div className="admin-empty">
                {query
                  ? 'Nicio potrivire pentru căutarea ta.'
                  : intrari.length === 0
                    ? 'Niciun email trimis pentru ediția asta încă. Jurnalul se completează automat de la prima trimitere.'
                    : 'Nimic pe filtrul ăsta.'}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
};
