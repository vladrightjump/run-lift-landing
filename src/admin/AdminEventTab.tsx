import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  listEventConfig,
  saveEventConfigDraft,
  publishEventConfig,
  restoreEventConfig,
  type AdminEventConfigRow,
} from '../lib/adminApi';
import { parseEventConfig, type EventConfig, type SectionKey } from '../content/eventConfig';
import {
  validateEventConfig,
  avertismenteEventConfig,
  mutaSectiune,
  comutaVizibilitatea,
  layoutComplet,
  cioarnaPentruEditiaUrmatoare,
  type CampInvalid,
} from './eventConfigForm';
import { fetchBuildInfo, campuriVechiInBuild, type BuildInfo } from './buildFingerprint';

type Props = {
  token: string;
  onAuthError: (err: unknown) => boolean;
  showToast: (t: { kind: 'error' | 'success'; msg: string }) => void;
};

const ETICHETE_SECTIUNI: Record<SectionKey, string> = {
  format: 'Formatul',
  venue: 'Locația',
  registration: 'Înscriere',
  participants: 'Cine vine',
};

/** Traduce refuzurile serverului în ceva citibil, fără să le reformuleze regula. */
const mesajRefuz = (err: unknown): string => {
  const text = err instanceof Error ? err.message : String(err);
  if (text.includes('registration_hidden_while_open')) {
    return 'Nu poți ascunde secțiunea de înscriere cât timp înscrierile sunt deschise. Mută deadline-ul sau lasă secțiunea vizibilă.';
  }
  if (text.includes('no_draft')) return 'Nu există nicio ciornă de publicat.';
  if (text.includes('config_invalid')) {
    const m = /config_invalid: ([^"\\}]+)/.exec(text);
    return `Serverul a respins configul: ${m?.[1]?.trim() ?? 'document invalid'}.`;
  }
  return 'Nu am putut salva. Încearcă din nou.';
};

export const AdminEventTab = ({ token, onAuthError, showToast }: Props) => {
  const [randuri, setRanduri] = useState<AdminEventConfigRow[] | null>(null);
  const [ciorna, setCiorna] = useState<EventConfig | null>(null);
  const [salveaza, setSalveaza] = useState(false);
  const [publica, setPublica] = useState(false);
  const [confirmPublicare, setConfirmPublicare] = useState(false);
  // Ciorna nu se rescrie sub degetele organizatorului la fiecare poll.
  const atinsa = useRef(false);
  const [build, setBuild] = useState<BuildInfo | null>(null);

  const incarca = useCallback(
    (signal?: AbortSignal) => {
      listEventConfig(token, undefined, signal)
        .then((rows) => {
          setRanduri(rows);
          if (atinsa.current) return;
          const draft = rows.find((r) => r.status === 'draft');
          if (draft) setCiorna(parseEventConfig(draft.config));
        })
        .catch((err) => {
          if (signal?.aborted || onAuthError(err)) return;
        });
    },
    [token, onAuthError]
  );

  useEffect(() => {
    const c = new AbortController();
    incarca(c.signal);
    return () => c.abort();
  }, [incarca]);

  useEffect(() => {
    const c = new AbortController();
    fetchBuildInfo(c.signal).then(setBuild);
    return () => c.abort();
  }, []);

  const publicat = useMemo(() => {
    const row = randuri?.find((r) => r.status === 'published');
    return row ? parseEventConfig(row.config) : null;
  }, [randuri]);

  const versiuni = useMemo(
    () =>
      (randuri ?? [])
        .filter((r) => r.status === 'superseded' && r.published_at)
        .sort((a, b) => (b.published_at ?? '').localeCompare(a.published_at ?? '')),
    [randuri]
  );

  // Meta de share e injectată la build, deci o publicare o lasă în urmă până la
  // următorul deploy. Notificare, nu blocaj.
  const campuriVechi = build && publicat ? campuriVechiInBuild(build, publicat) : [];

  const probleme: CampInvalid[] = ciorna ? validateEventConfig(ciorna) : [];
  const avertismente = ciorna ? avertismenteEventConfig(ciorna) : [];
  const poatePublica = ciorna !== null && probleme.length === 0;

  const seteaza = <K extends keyof EventConfig>(cheie: K, valoare: EventConfig[K]) => {
    atinsa.current = true;
    setCiorna((c) => (c ? { ...c, [cheie]: valoare } : c));
  };

  const porneste = () => {
    const baza = publicat;
    if (!baza) return;
    atinsa.current = true;
    setCiorna(cioarnaPentruEditiaUrmatoare(baza));
  };

  const porneteDinPublicat = () => {
    if (!publicat) return;
    atinsa.current = true;
    setCiorna({ ...publicat, layout: layoutComplet(publicat.layout) });
  };

  const salveazaCiorna = async () => {
    if (!ciorna || probleme.length > 0) return;
    setSalveaza(true);
    try {
      await saveEventConfigDraft(token, ciorna.number, ciorna);
      showToast({ kind: 'success', msg: `Ciorna ediției ${ciorna.number} a fost salvată.` });
      atinsa.current = false;
      incarca();
    } catch (err) {
      if (!onAuthError(err)) showToast({ kind: 'error', msg: mesajRefuz(err) });
    } finally {
      setSalveaza(false);
    }
  };

  const publicaCiorna = async () => {
    if (!ciorna) return;
    setConfirmPublicare(false);
    setPublica(true);
    try {
      await publishEventConfig(token, ciorna.number);
      showToast({ kind: 'success', msg: `Ediția ${ciorna.number} e publicată.` });
      atinsa.current = false;
      incarca();
    } catch (err) {
      if (!onAuthError(err)) showToast({ kind: 'error', msg: mesajRefuz(err) });
    } finally {
      setPublica(false);
    }
  };

  const revino = async (id: string, editie: number) => {
    try {
      await restoreEventConfig(token, id);
      showToast({ kind: 'success', msg: `Ai revenit la o versiune anterioară a ediției ${editie}.` });
      atinsa.current = false;
      incarca();
    } catch (err) {
      if (!onAuthError(err)) showToast({ kind: 'error', msg: mesajRefuz(err) });
    }
  };

  if (randuri === null) {
    return <section className="admin-table-section"><div className="admin-empty">Se încarcă…</div></section>;
  }

  return (
    <section className="admin-table-section">
      <div className="admin-table-head">
        <h2>Eveniment</h2>
        <div className="admin-table-actions">
          {ciorna === null ? (
            <>
              <button type="button" className="admin-btn-ghost" onClick={porneteDinPublicat}>
                Editează ediția {publicat?.number ?? ''}
              </button>
              <button type="button" className="admin-btn-accent" onClick={porneste}>
                + Ciornă pentru ediția {(publicat?.number ?? 0) + 1}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="admin-btn-ghost"
                onClick={() => {
                  atinsa.current = false;
                  setCiorna(null);
                }}
              >
                Renunță
              </button>
              <button
                type="button"
                className="admin-btn-ghost"
                onClick={salveazaCiorna}
                disabled={salveaza || !poatePublica}
              >
                {salveaza ? 'Se salvează…' : 'Salvează ciorna'}
              </button>
              <a
                className="admin-btn-ghost"
                href="/?config=draft"
                target="_blank"
                rel="noopener noreferrer"
              >
                Previzualizează
              </a>
              <button
                type="button"
                className="admin-btn-accent"
                onClick={() => setConfirmPublicare(true)}
                disabled={publica || !poatePublica}
              >
                {publica ? 'Se publică…' : 'Publică'}
              </button>
            </>
          )}
        </div>
      </div>

      {publicat && (
        <div className="admin-stats">
          <div className="admin-stat">
            <span className="admin-stat-label">Publicat acum</span>
            <span className="admin-stat-value accent">Ediția {publicat.number}</span>
          </div>
          <div className="admin-stat">
            <span className="admin-stat-label">Start</span>
            <span className="admin-stat-value">{publicat.start.replace('T', ' ')}</span>
          </div>
          <div className="admin-stat">
            <span className="admin-stat-label">Locuri</span>
            <span className="admin-stat-value">{publicat.slots.total}</span>
          </div>
          <div className="admin-stat">
            <span className="admin-stat-label">Pagina arată</span>
            <span className="admin-stat-value">
              {publicat.showComingSoon ? 'Coming Soon' : 'Landing'}
            </span>
          </div>
        </div>
      )}

      {campuriVechi.length > 0 && (
        <div className="admin-banner" role="status">
          <strong>Share preview-ul e mai vechi decât configul publicat.</strong> Build-ul
          deployat încă poartă{' '}
          {campuriVechi.map((c, i) => (
            <span key={c.camp}>
              {i > 0 && ', '}
              {c.camp} „{c.inBuild}" (publicat: „{c.publicat}")
            </span>
          ))}
          . Linkurile trimise pe WhatsApp/Facebook vor arăta valorile vechi până la următorul
          deploy — scraper-ele citesc HTML-ul static, fără să ruleze JS. Restul paginii e deja
          pe configul publicat.
        </div>
      )}

      {ciorna === null ? (
        <div className="admin-empty">
          Nicio ciornă deschisă. Pornește una ca să schimbi ediția — nimic nu ajunge pe site
          până nu apeși „Publică".
        </div>
      ) : (
        <div className="admin-config-form">
          {probleme.length > 0 && (
            <div className="admin-banner warn" role="status">
              <strong>Configul nu se poate publica încă:</strong>
              <ul>
                {probleme.map((p) => (
                  <li key={`${p.camp}-${p.mesaj}`}>{p.mesaj}</li>
                ))}
              </ul>
            </div>
          )}

          {avertismente.map((a) => (
            <div className="admin-banner" role="status" key={a.mesaj}>
              {a.mesaj}
            </div>
          ))}

          <Camp eticheta="Ediția evenimentului">
            <input
              type="number"
              value={ciorna.number}
              onChange={(e) => seteaza('number', Number(e.target.value))}
            />
          </Camp>
          <Camp eticheta="Ediția de lansare">
            <input
              type="number"
              value={ciorna.launchNumber}
              onChange={(e) => seteaza('launchNumber', Number(e.target.value))}
            />
          </Camp>
          <Camp eticheta="Numele evenimentului">
            <input value={ciorna.eventName} onChange={(e) => seteaza('eventName', e.target.value)} />
          </Camp>
          <Camp eticheta="Concept">
            <input value={ciorna.concept} onChange={(e) => seteaza('concept', e.target.value)} />
          </Camp>
          <Camp eticheta="Start (local, fără fus)">
            <input value={ciorna.start} onChange={(e) => seteaza('start', e.target.value)} />
          </Camp>
          <Camp eticheta="Deadline înscriere">
            <input
              value={ciorna.registrationDeadline}
              onChange={(e) => seteaza('registrationDeadline', e.target.value)}
            />
          </Camp>
          <Camp eticheta="Momentul lansării">
            <input value={ciorna.launchAt} onChange={(e) => seteaza('launchAt', e.target.value)} />
          </Camp>
          <Camp eticheta="Următorul antrenament">
            <input
              value={ciorna.nextEditionAt}
              onChange={(e) => seteaza('nextEditionAt', e.target.value)}
            />
          </Camp>
          <Camp eticheta="Check-in de la">
            <input
              value={ciorna.checkinFrom}
              onChange={(e) => seteaza('checkinFrom', e.target.value)}
            />
          </Camp>
          <Camp eticheta="Durata (ore)">
            <input
              type="number"
              value={ciorna.durationHours}
              onChange={(e) => seteaza('durationHours', Number(e.target.value))}
            />
          </Camp>
          <Camp eticheta={'„Cine vine" cu (ore) înainte'}>
            <input
              type="number"
              value={ciorna.leaderboardLeadHours}
              onChange={(e) => seteaza('leaderboardLeadHours', Number(e.target.value))}
            />
          </Camp>
          <Camp eticheta="Fus orar">
            <input value={ciorna.tz} onChange={(e) => seteaza('tz', e.target.value)} />
          </Camp>
          <Camp eticheta="Locul — nume">
            <input
              value={ciorna.venue.name}
              onChange={(e) => seteaza('venue', { ...ciorna.venue, name: e.target.value })}
            />
          </Camp>
          <Camp eticheta="Locul — oraș/zonă">
            <input
              value={ciorna.venue.city}
              onChange={(e) => seteaza('venue', { ...ciorna.venue, city: e.target.value })}
            />
          </Camp>
          <Camp eticheta={'Locul — coordonate „lat,lng"'}>
            <input
              value={ciorna.venue.mapQuery}
              onChange={(e) => seteaza('venue', { ...ciorna.venue, mapQuery: e.target.value })}
            />
          </Camp>
          <Camp eticheta="Locuri">
            <input
              type="number"
              value={ciorna.slots.total}
              onChange={(e) =>
                seteaza('slots', { ...ciorna.slots, total: Number(e.target.value) })
              }
            />
          </Camp>
          <Camp eticheta="Lista de așteptare">
            <input
              type="number"
              value={ciorna.slots.waitlist}
              onChange={(e) =>
                seteaza('slots', { ...ciorna.slots, waitlist: Number(e.target.value) })
              }
            />
          </Camp>
          <Camp eticheta="Homepage-ul arată">
            <select
              value={ciorna.showComingSoon ? 'soon' : 'landing'}
              onChange={(e) => seteaza('showComingSoon', e.target.value === 'soon')}
            >
              <option value="landing">Landing (înscrieri)</option>
              <option value="soon">Coming Soon</option>
            </select>
          </Camp>

          <h3>Secțiunile paginii</h3>
          <p className="admin-config-hint">
            Ordinea de aici e ordinea de pe pagină. Numerele (01, 02…) se recalculează singure —
            o secțiune ascunsă nu lasă gaură.
          </p>
          <ol className="admin-layout-list">
            {ciorna.layout.map((s, i) => (
              <li key={s.key} className={s.visible ? '' : 'ascunsa'}>
                <span className="admin-layout-nr">
                  {s.visible
                    ? String(ciorna.layout.filter((x, j) => x.visible && j <= i).length).padStart(2, '0')
                    : '—'}
                </span>
                <span className="admin-layout-nume">{ETICHETE_SECTIUNI[s.key]}</span>
                <button
                  type="button"
                  className="admin-btn-ghost"
                  onClick={() => seteaza('layout', mutaSectiune(ciorna.layout, s.key, -1))}
                  disabled={i === 0}
                  aria-label={`Mută „${ETICHETE_SECTIUNI[s.key]}" mai sus`}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="admin-btn-ghost"
                  onClick={() => seteaza('layout', mutaSectiune(ciorna.layout, s.key, 1))}
                  disabled={i === ciorna.layout.length - 1}
                  aria-label={`Mută „${ETICHETE_SECTIUNI[s.key]}" mai jos`}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="admin-btn-ghost"
                  onClick={() => seteaza('layout', comutaVizibilitatea(ciorna.layout, s.key))}
                >
                  {s.visible ? 'Ascunde' : 'Arată'}
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}

      {versiuni.length > 0 && (
        <>
          <h3>Versiuni anterioare</h3>
          <div className="admin-table-wrap">
            <div className="admin-table">
              {versiuni.map((v) => (
                <div key={v.id} className="admin-row">
                  <span className="admin-cell-name">Ediția {v.editie}</span>
                  <span className="admin-cell-date">
                    {v.published_at ? new Date(v.published_at).toLocaleString('ro-RO') : ''}
                  </span>
                  <button
                    type="button"
                    className="admin-btn-ghost"
                    onClick={() => revino(v.id, v.editie)}
                  >
                    Revino la asta
                  </button>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {confirmPublicare && ciorna && (
        <div
          className="admin-confirm-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setConfirmPublicare(false);
          }}
        >
          <div className="admin-confirm" role="alertdialog" aria-modal="true">
            <h3>Publici ediția {ciorna.number}?</h3>
            <p>
              Site-ul public trece pe configul ăsta imediat, fără deploy. Vizitatorii vor vedea{' '}
              <strong>{ciorna.showComingSoon ? 'Coming Soon' : 'landing-ul cu înscrieri'}</strong>.
            </p>
            <p className="admin-confirm-note">
              Share preview-ul (WhatsApp/Facebook) rămâne pe datele build-ului deployat până la
              următorul deploy — scraper-ele nu rulează JS, deci meta nu se poate schimba la
              runtime. Versiunea publicată acum rămâne salvată, deci poți reveni la ea.
            </p>
            <div className="admin-confirm-actions">
              <button type="button" className="admin-btn-accent" onClick={publicaCiorna}>
                Da, publică
              </button>
              <button
                type="button"
                className="admin-confirm-cancel"
                onClick={() => setConfirmPublicare(false)}
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

const Camp = ({ eticheta, children }: { eticheta: string; children: ReactNode }) => (
  <label className="admin-config-camp">
    <span>{eticheta}</span>
    {children}
  </label>
);
