import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import {
  listEventConfig,
  saveEventConfigDraft,
  publishEventConfig,
  restoreEventConfig,
  type AdminEventConfigRow,
} from '../lib/adminApi';
import {
  parseEventConfig,
  MAX_REELS,
  type EventConfig,
  type SectionKey,
} from '../content/eventConfig';
import {
  validateEventConfig,
  avertismenteEventConfig,
  mutaSectiune,
  comutaVizibilitatea,
  layoutComplet,
  cioarnaPentruEditiaUrmatoare,
  parseInstagramUrl,
  adaugaReel,
  stergeReel,
  mutaReel,
  seteazaReel,
  type CampInvalid,
} from './eventConfigForm';
import { fetchBuildInfo, campuriVechiInBuild, type BuildInfo } from './buildFingerprint';
import {
  laDatetimeLocal,
  dinDatetimeLocal,
  descrieMoment,
  problemePeCamp,
  linkHarta,
} from './eventConfigFields';
import { useNow } from '../hooks/useNow';

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
  reels: 'Instagram',
};

/**
 * Valorile din listele formularului.
 *
 * Câmpurile astea erau text sau `number` liber, iar greșeala nu se vedea la
 * tastare: „+3:00” în loc de „+03:00”, „6:30” în loc de „06:30”, o durată de
 * 20 în loc de 2. Toate treceau de input și cădeau abia la „Publică”, ca refuz
 * al serverului. O listă nu poate produce niciuna dintre ele.
 *
 * Valorile din afara listei nu se pierd: fiecare select adaugă valoarea curentă
 * ca opțiune dacă nu e printre ele, altfel un document scris manual în DB ar
 * părea că are altă valoare decât are.
 */
const DURATE = [1, 1.5, 2, 2.5, 3, 4, 5, 6] as const;

/** Sferturi de oră între 05:00 și 12:00 — fereastra în care începe o cursă. */
const ORE_CHECKIN: string[] = Array.from({ length: (12 - 5) * 4 + 1 }, (_, i) => {
  const minuteTotale = 5 * 60 + i * 15;
  const h = String(Math.floor(minuteTotale / 60)).padStart(2, '0');
  const m = String(minuteTotale % 60).padStart(2, '0');
  return `${h}:${m}`;
});

/** Doar fusurile Moldovei; restul n-au ce căuta într-o cursă din Chișinău. */
const FUSURI: [string, string][] = [
  ['+03:00', '+03:00 · Chișinău vara (EEST)'],
  ['+02:00', '+02:00 · Chișinău iarna (EET)'],
];

/**
 * Cât ține o publicare, formularul e inert.
 *
 * `publicaCiorna` închide dialogul pe prima linie, iar cele două apeluri await
 * țin documentul pe care l-au capturat. Un câmp rămas viu ar însemna că poți
 * tasta în timpul dus-întorsului: s-ar publica instantaneul vechi ȘI s-ar
 * anunța succesul — exact divergența dintre ecran și site pe care tabul o
 * închide.
 *
 * Context, nu prop: `Camp` e un component separat, iar altfel fiecare dintre
 * cele optsprezece câmpuri ar căra aceeași valoare de mână.
 */
const Blocat = createContext(false);

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
  // Aceleași probleme, dar indexate pe câmp — ca să apară lângă inputul vinovat.
  const erori = problemePeCamp(probleme);
  // Doar pentru „peste 3 luni” de sub datele calendaristice. Un minut e destul:
  // nimeni nu se uită la ecoul ăsta ca la un cronometru.
  const acum = useNow(60_000);
  const hartaUrl = ciorna ? linkHarta(ciorna.venue.mapQuery) : null;

  /**
   * Are vreunul dintre câmpurile grupului o problemă?
   *
   * Un grup cu erori se deschide singur și nu se mai poate închide: altfel
   * „Publică" ar rămâne blocat de o eroare ascunsă sub un capac, iar bannerul
   * de sus ar spune CE e greșit fără să arate UNDE.
   */
  const areEroare = (campuri: string[]): boolean => campuri.some((c) => erori.has(c));

  const seteaza = <K extends keyof EventConfig>(cheie: K, valoare: EventConfig[K]) => {
    atinsa.current = true;
    setCiorna((c) => (c ? { ...c, [cheie]: valoare } : c));
  };

  /**
   * Textul brut din câmpurile de link ale clipurilor, pe index.
   *
   * De ce nu se poate randa direct din `code`: câmpul ar fi controlat de o
   * valoare RECOMPUSĂ din ce s-a parsat, iar la tastare (nu lipire) fiecare
   * caracter în parte e un URL invalid — deci câmpul s-ar goli singur la prima
   * literă. Ciorna primește codul; câmpul păstrează ce a scris omul.
   *
   * Se golește la orice schimbare de structură (adăugare, ștergere, mutare):
   * rândurile sunt identificate prin index, iar altfel textul ar rămâne agățat
   * de poziție, nu de clip.
   */
  const [linkBrut, setLinkBrut] = useState<Record<number, string>>({});
  const seteazaReels = (items: EventConfig['reels']['items'], structural = false) => {
    if (structural) setLinkBrut({});
    setCiorna((c) => {
      atinsa.current = true;
      return c ? { ...c, reels: { ...c.reels, items } } : c;
    });
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
      showToast({
        kind: 'success',
        msg: `Ciorna ediției ${ciorna.number} a fost salvată.`,
      });
      atinsa.current = false;
      incarca();
    } catch (err) {
      if (!onAuthError(err)) showToast({ kind: 'error', msg: mesajRefuz(err) });
    } finally {
      setSalveaza(false);
    }
  };

  /**
   * „Publică" salvează întâi ce e pe ecran, apoi publică.
   *
   * `admin_publish_event_config` primește doar `p_editie`: publică rândul
   * `draft` de pe server, nu documentul din câmpuri. Fără salvarea asta,
   * apăsarea pe „Publică" fără „Salvează" înainte n-avea ce publica
   * (`no_draft`) — iar cu o ciornă VECHE pe server publica documentul vechi
   * și raporta succes. Al doilea e mai rău: nimic nu te trimite să verifici.
   *
   * Cele două apeluri nu sînt o tranzacție. Dacă salvarea trece și publicarea
   * e refuzată, rămîi cu ciorna salvată și cu site-ul pe configul vechi — o
   * stare din care poți relua, și exact ce obții azi apăsînd „Salvează" și
   * eșuînd apoi la „Publică".
   */
  const publicaCiorna = async () => {
    if (!ciorna) return;
    setConfirmPublicare(false);
    setPublica(true);
    try {
      await saveEventConfigDraft(token, ciorna.number, ciorna);
      await publishEventConfig(token, ciorna.number);
      showToast({
        kind: 'success',
        msg: `Ediția ${ciorna.number} e publicată.`,
      });
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
      showToast({
        kind: 'success',
        msg: `Ai revenit la o versiune anterioară a ediției ${editie}.`,
      });
      atinsa.current = false;
      incarca();
    } catch (err) {
      if (!onAuthError(err)) showToast({ kind: 'error', msg: mesajRefuz(err) });
    }
  };

  if (randuri === null) {
    return (
      <section className="admin-table-section">
        <div className="admin-empty">Se încarcă…</div>
      </section>
    );
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
              {/* Salveaza / Previzualizeaza / Publica traiesc DOAR in bara
                  lipita jos. Aceleasi trei butoane si sus, si jos, inseamna ca
                  la fiecare apasare intrebi care set e cel „real". */}
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
            {/* Scria „2026-08-22 07:00:00" — formatul în care o ține documentul,
                nu unul în care cineva citește o dată. Ziua săptămânii e chiar
                lucrul pe care organizatorul îl verifică: o cursă mutată din
                greșeală de sâmbătă pe duminică arată identic în cifre. */}
            <span className="admin-stat-value admin-stat-value--text">
              {descrieMoment(publicat.start, publicat.tz, acum) || publicat.start}
            </span>
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
          <strong>Share preview-ul e mai vechi decât configul publicat.</strong> Build-ul deployat
          încă poartă{' '}
          {campuriVechi.map((c, i) => (
            <span key={c.camp}>
              {i > 0 && ', '}
              {c.camp} „{c.inBuild}” (publicat: „{c.publicat}”)
            </span>
          ))}
          . Linkurile trimise pe WhatsApp/Facebook vor arăta valorile vechi până la următorul deploy
          — scraper-ele citesc HTML-ul static, fără să ruleze JS. Restul paginii e deja pe configul
          publicat.
        </div>
      )}

      {ciorna === null ? (
        <div className="admin-empty">
          Nicio ciornă deschisă. Pornește una ca să schimbi ediția — nimic nu ajunge pe site până nu
          apeși „Publică”.
        </div>
      ) : (
        <Blocat.Provider value={publica}>
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

          <Grup
            titlu="Ediția"
            ajutor="Cum se numește și a câta e."
            deschisImplicit
            areEroare={areEroare(['number', 'launchNumber', 'eventName', 'concept'])}
            rezumat={`Ediția ${ciorna.number} · ${ciorna.eventName}`}
          >
            <Camp
              eticheta="Numărul ediției"
              ajutor="Ediția la care se înscrie lumea acum."
              eroare={erori.get('number')}
            >
              {(p) => (
                <input
                  {...p}
                  type="number"
                  min={1}
                  value={ciorna.number}
                  onChange={(e) => seteaza('number', Number(e.target.value))}
                />
              )}
            </Camp>
            <Camp
              eticheta="Ediția de lansare"
              ajutor="Numărul din emailuri și din paginile /confirmare și /unsubscribe. De obicei același cu cel de sus — bumpează-l DUPĂ cursă."
              eroare={erori.get('launchNumber')}
            >
              {(p) => (
                <input
                  {...p}
                  type="number"
                  min={1}
                  value={ciorna.launchNumber}
                  onChange={(e) => seteaza('launchNumber', Number(e.target.value))}
                />
              )}
            </Camp>
            <Camp
              eticheta="Numele evenimentului"
              ajutor="Apare în titlul paginii și în emailuri."
              eroare={erori.get('eventName')}
            >
              {(p) => (
                <input
                  {...p}
                  value={ciorna.eventName}
                  onChange={(e) => seteaza('eventName', e.target.value)}
                />
              )}
            </Camp>
            <Camp
              eticheta="Concept"
              ajutor="Linia scurtă de sub titlu — ex. „outdoor adaptive”."
              eroare={erori.get('concept')}
            >
              {(p) => (
                <input
                  {...p}
                  value={ciorna.concept}
                  onChange={(e) => seteaza('concept', e.target.value)}
                />
              )}
            </Camp>
          </Grup>

          <Grup
            titlu="Când"
            ajutor="Toate orele sunt locale, în fusul de mai jos. Sub fiecare dată scrie ce înseamnă — verifică mai ales ziua săptămânii."
            areEroare={areEroare([
              'start',
              'durationHours',
              'checkinFrom',
              'registrationDeadline',
              'launchAt',
              'nextEditionAt',
              'leaderboardLeadHours',
              'tz',
            ])}
            rezumat={descrieMoment(ciorna.start, ciorna.tz, acum) || ciorna.start}
          >
            <Camp
              eticheta="Startul cursei"
              eroare={erori.get('start')}
              ecou={descrieMoment(ciorna.start, ciorna.tz, acum)}
            >
              {(p) => (
                <input
                  {...p}
                  type="datetime-local"
                  value={laDatetimeLocal(ciorna.start)}
                  onChange={(e) => seteaza('start', dinDatetimeLocal(e.target.value))}
                />
              )}
            </Camp>
            <Camp
              eticheta="Durata"
              ajutor="Ore. După start + durată, pagina trece pe countdown-ul următorului antrenament."
              eroare={erori.get('durationHours')}
            >
              {(p) => (
                <select
                  {...p}
                  value={String(ciorna.durationHours)}
                  onChange={(e) => seteaza('durationHours', Number(e.target.value))}
                >
                  {DURATE.map((h) => (
                    <option key={h} value={h}>
                      {h === 1 ? '1 oră' : `${String(h).replace('.', ',')} ore`}
                    </option>
                  ))}
                </select>
              )}
            </Camp>
            <Camp
              eticheta="Check-in de la"
              ajutor="Doar ora, în ziua cursei."
              eroare={erori.get('checkinFrom')}
            >
              {(p) => (
                <select
                  {...p}
                  value={ciorna.checkinFrom}
                  onChange={(e) => seteaza('checkinFrom', e.target.value)}
                >
                  {/* O valoare scrisa de mana care nu e in lista ramane vizibila,
                      altfel selectul ar arata alta ora decat cea din document. */}
                  {!ORE_CHECKIN.includes(ciorna.checkinFrom) && (
                    <option value={ciorna.checkinFrom}>{ciorna.checkinFrom}</option>
                  )}
                  {ORE_CHECKIN.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              )}
            </Camp>
            <Camp
              eticheta="Se închid înscrierile"
              ajutor="Nu poate fi după start."
              eroare={erori.get('registrationDeadline')}
              ecou={descrieMoment(ciorna.registrationDeadline, ciorna.tz, acum)}
            >
              {(p) => (
                <input
                  {...p}
                  type="datetime-local"
                  value={laDatetimeLocal(ciorna.registrationDeadline)}
                  onChange={(e) =>
                    seteaza('registrationDeadline', dinDatetimeLocal(e.target.value))
                  }
                />
              )}
            </Camp>
            <Camp
              eticheta="Se anunță ediția"
              ajutor="Până atunci homepage-ul poate sta pe Coming Soon, cu numărătoarea inversă spre momentul ăsta."
              eroare={erori.get('launchAt')}
              ecou={descrieMoment(ciorna.launchAt, ciorna.tz, acum)}
            >
              {(p) => (
                <input
                  {...p}
                  type="datetime-local"
                  value={laDatetimeLocal(ciorna.launchAt)}
                  onChange={(e) => seteaza('launchAt', dinDatetimeLocal(e.target.value))}
                />
              )}
            </Camp>
            <Camp
              eticheta="Următorul antrenament"
              ajutor="După ce se termină cursa, pagina numără invers spre data asta. Trebuie să fie după finalul cursei."
              eroare={erori.get('nextEditionAt')}
              ecou={descrieMoment(ciorna.nextEditionAt, ciorna.tz, acum)}
            >
              {(p) => (
                <input
                  {...p}
                  type="datetime-local"
                  value={laDatetimeLocal(ciorna.nextEditionAt)}
                  onChange={(e) => seteaza('nextEditionAt', dinDatetimeLocal(e.target.value))}
                />
              )}
            </Camp>
            <Camp
              eticheta={'„Cine vine” apare cu'}
              ajutor="Ore înainte de start. Atunci pagina scoate formularul și urcă lista de participanți sub hero."
              eroare={erori.get('leaderboardLeadHours')}
            >
              {(p) => (
                <input
                  {...p}
                  type="number"
                  min={0}
                  value={ciorna.leaderboardLeadHours}
                  onChange={(e) => seteaza('leaderboardLeadHours', Number(e.target.value))}
                />
              )}
            </Camp>
            <Camp
              eticheta="Fusul orar"
              ajutor="Decalajul față de UTC, scris ca „+03:00”. Moldova: +03:00 vara, +02:00 iarna."
              eroare={erori.get('tz')}
            >
              {(p) => (
                <select {...p} value={ciorna.tz} onChange={(e) => seteaza('tz', e.target.value)}>
                  {!FUSURI.some(([v]) => v === ciorna.tz) && (
                    <option value={ciorna.tz}>{ciorna.tz}</option>
                  )}
                  {FUSURI.map(([valoare, eticheta]) => (
                    <option key={valoare} value={valoare}>
                      {eticheta}
                    </option>
                  ))}
                </select>
              )}
            </Camp>
          </Grup>

          <Grup
            titlu="Unde"
            ajutor="Ce scrie în secțiunea „Locația” și ce se vede pe hartă."
            areEroare={areEroare(['venue.name', 'venue.city', 'venue.mapQuery', 'venue.zoom'])}
            rezumat={`${ciorna.venue.name}, ${ciorna.venue.city}`}
          >
            <Camp
              eticheta="Numele locului"
              ajutor="Ex. „Scările de Granit”."
              eroare={erori.get('venue.name')}
            >
              {(p) => (
                <input
                  {...p}
                  value={ciorna.venue.name}
                  onChange={(e) => seteaza('venue', { ...ciorna.venue, name: e.target.value })}
                />
              )}
            </Camp>
            <Camp
              eticheta="Orașul sau zona"
              ajutor="Ex. „Valea Morilor, Chișinău”."
              eroare={erori.get('venue.city')}
            >
              {(p) => (
                <input
                  {...p}
                  value={ciorna.venue.city}
                  onChange={(e) => seteaza('venue', { ...ciorna.venue, city: e.target.value })}
                />
              )}
            </Camp>
            <Camp
              eticheta="Coordonatele"
              ajutor="Punct exact, „lat,lng” — nu text căutat pe hartă. Le iei din Google Maps: click dreapta pe punct → prima linie din meniu le copiază."
              eroare={erori.get('venue.mapQuery')}
              ecou={
                // Verificarea cu un click: harta e singurul câmp în care o
                // greșeală nu se vede în admin, ci abia pe pagina publică.
                hartaUrl ? (
                  <a href={hartaUrl} target="_blank" rel="noopener noreferrer">
                    Verifică punctul pe Google Maps ↗
                  </a>
                ) : undefined
              }
            >
              {(p) => (
                <input
                  {...p}
                  value={ciorna.venue.mapQuery}
                  placeholder="47.0182357,28.8213041"
                  onChange={(e) =>
                    seteaza('venue', {
                      ...ciorna.venue,
                      mapQuery: e.target.value,
                    })
                  }
                />
              )}
            </Camp>
          </Grup>

          <Grup
            titlu="Locuri"
            ajutor="Câți încap și ce se întâmplă când se umple."
            areEroare={areEroare(['slots.total', 'slots.waitlist'])}
            rezumat={`${ciorna.slots.total} locuri · ${ciorna.slots.waitlist} pe lista de așteptare`}
          >
            <Camp
              eticheta="Locuri disponibile"
              ajutor="Bara de pe pagină are exact atâtea segmente."
              eroare={erori.get('slots.total')}
            >
              {(p) => (
                <input
                  {...p}
                  type="number"
                  min={1}
                  value={ciorna.slots.total}
                  onChange={(e) =>
                    seteaza('slots', {
                      ...ciorna.slots,
                      total: Number(e.target.value),
                    })
                  }
                />
              )}
            </Camp>
            <Camp
              eticheta="Locuri pe lista de așteptare"
              ajutor="După ce se umplu locurile, formularul înscrie pe listă. Când se eliberează un loc, primul de pe listă urcă automat."
              eroare={erori.get('slots.waitlist')}
            >
              {(p) => (
                <input
                  {...p}
                  type="number"
                  min={0}
                  value={ciorna.slots.waitlist}
                  onChange={(e) =>
                    seteaza('slots', {
                      ...ciorna.slots,
                      waitlist: Number(e.target.value),
                    })
                  }
                />
              )}
            </Camp>
          </Grup>

          <Grup
            titlu="Ce arată pagina"
            ajutor="Ecranul de pornire și ordinea secțiunilor."
            rezumat={`${ciorna.showComingSoon ? 'Coming Soon' : 'Landing'} · ${
              ciorna.layout.filter((x) => x.visible).length
            } secțiuni vizibile`}
          >
            <Camp
              eticheta="Homepage-ul arată"
              ajutor="„Coming Soon” ține pagina pe numărătoarea inversă spre momentul anunțului, fără formular."
            >
              {(p) => (
                <select
                  {...p}
                  value={ciorna.showComingSoon ? 'soon' : 'landing'}
                  onChange={(e) => seteaza('showComingSoon', e.target.value === 'soon')}
                >
                  <option value="landing">Landing, cu înscrieri</option>
                  <option value="soon">Coming Soon</option>
                </select>
              )}
            </Camp>
          </Grup>

          <Grup
            titlu="Instagram"
            ajutor="Clipurile din bandă. Lipești linkul din Instagram — codul se extrage singur."
            areEroare={probleme.some((x) => x.camp.startsWith('reels'))}
            rezumat={
              ciorna.reels.items.length === 0
                ? 'Niciun clip · secțiunea nu apare pe pagină'
                : `${ciorna.reels.items.length} ${
                    ciorna.reels.items.length === 1 ? 'clip' : 'clipuri'
                  }`
            }
          >
            <Camp
              eticheta="Titlul secțiunii"
              eroare={erori.get('reels.headline')}
            >
              {(p) => (
                <input
                  {...p}
                  value={ciorna.reels.headline}
                  onChange={(e) =>
                    seteaza('reels', { ...ciorna.reels, headline: e.target.value })
                  }
                />
              )}
            </Camp>
            <Camp
              eticheta="Textul de lângă bandă"
              ajutor="Două rânduri. Ce vede cineva care nu ne-a văzut niciodată alergând."
            >
              {(p) => (
                <textarea
                  {...p}
                  rows={3}
                  value={ciorna.reels.body}
                  onChange={(e) => seteaza('reels', { ...ciorna.reels, body: e.target.value })}
                />
              )}
            </Camp>
          </Grup>

          <h3>Clipurile din bandă</h3>
          <p className="admin-config-hint">
            Ordinea de aici e ordinea din bandă. Fără niciun clip, secțiunea nu apare pe pagină,
            oricât ar fi de vizibilă în lista de mai jos.
          </p>
          {erori.get('reels') && (
            <div className="admin-banner warn" role="status">
              {erori.get('reels')}
            </div>
          )}
          <ol className="admin-reels-list">
            {ciorna.reels.items.map((r, i) => {
              const eroareCod = erori.get(`reels.${i}.code`);
              return (
                <li key={i} className={eroareCod ? 'invalid' : ''}>
                  <div className="admin-reels-rand">
                    <span className="admin-layout-nr">{String(i + 1).padStart(2, '0')}</span>
                    <div className="admin-reels-campuri">
                      <label className="admin-config-eticheta" htmlFor={`reel-link-${i}`}>
                        Linkul clipului
                      </label>
                      <input
                        id={`reel-link-${i}`}
                        autoComplete="off"
                        disabled={publica}
                        aria-invalid={eroareCod ? true : undefined}
                        placeholder="https://www.instagram.com/reel/ABC12345/"
                        // Textul brut cât timp se scrie; URL-ul canonic recompus
                        // din cod după ce câmpul e părăsit. Așa tastarea nu se
                        // autodistruge, iar la final se vede ce am înțeles.
                        value={
                          linkBrut[i] ??
                          (r.code ? `https://www.instagram.com/${r.kind}/${r.code}/` : '')
                        }
                        onChange={(e) => {
                          const text = e.target.value;
                          setLinkBrut((m) => ({ ...m, [i]: text }));
                          const parsat = parseInstagramUrl(text);
                          seteazaReels(
                            parsat
                              ? ciorna.reels.items.map((x, j) =>
                                  j === i ? { ...x, code: parsat.code, kind: parsat.kind } : x
                                )
                              : seteazaReel(ciorna.reels.items, i, 'code', '')
                          );
                        }}
                        onBlur={() =>
                          // Ce a rămas în câmp după ce s-a extras codul nu mai
                          // interesează: la ieșire arătăm forma canonică.
                          setLinkBrut((m) => {
                            const { [i]: _, ...rest } = m;
                            return rest;
                          })
                        }
                      />
                      {eroareCod ? (
                        <span className="admin-config-eroare" role="alert">
                          {eroareCod}
                        </span>
                      ) : (
                        r.code && (
                          <span className="admin-config-ecou">
                            cod: {r.code} · {r.kind === 'p' ? 'postare' : 'reel'}
                          </span>
                        )
                      )}

                      <label className="admin-config-eticheta" htmlFor={`reel-poster-${i}`}>
                        Poster (opțional)
                      </label>
                      <input
                        id={`reel-poster-${i}`}
                        autoComplete="off"
                        disabled={publica}
                        placeholder="/reels/marti.jpg"
                        value={r.poster}
                        onChange={(e) =>
                          seteazaReels(seteazaReel(ciorna.reels.items, i, 'poster', e.target.value))
                        }
                      />

                      <label className="admin-config-eticheta" htmlFor={`reel-caption-${i}`}>
                        Textul de sub card
                      </label>
                      <input
                        id={`reel-caption-${i}`}
                        autoComplete="off"
                        disabled={publica}
                        placeholder="Marți dimineața, Râșcani"
                        value={r.caption}
                        onChange={(e) =>
                          seteazaReels(seteazaReel(ciorna.reels.items, i, 'caption', e.target.value))
                        }
                      />
                    </div>
                    <div className="admin-reels-actiuni">
                      <button
                        type="button"
                        className="admin-btn-ghost"
                        disabled={publica || i === 0}
                        aria-label={`Mută clipul ${i + 1} mai devreme`}
                        onClick={() => seteazaReels(mutaReel(ciorna.reels.items, i, -1), true)}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="admin-btn-ghost"
                        disabled={publica || i === ciorna.reels.items.length - 1}
                        aria-label={`Mută clipul ${i + 1} mai târziu`}
                        onClick={() => seteazaReels(mutaReel(ciorna.reels.items, i, 1), true)}
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        className="admin-btn-ghost"
                        disabled={publica}
                        aria-label={`Șterge clipul ${i + 1}`}
                        onClick={() => seteazaReels(stergeReel(ciorna.reels.items, i), true)}
                      >
                        Șterge
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
          <button
            type="button"
            className="admin-btn-ghost"
            disabled={publica || ciorna.reels.items.length >= MAX_REELS}
            onClick={() => seteazaReels(adaugaReel(ciorna.reels.items), true)}
          >
            + Adaugă clip
          </button>

          <h3>Secțiunile paginii</h3>
          <p className="admin-config-hint">
            Ordinea de aici e ordinea de pe pagină. Numerele (01, 02…) se recalculează singure — o
            secțiune ascunsă nu lasă gaură.
          </p>
          <ol className="admin-layout-list">
            {ciorna.layout.map((s, i) => (
              <li key={s.key} className={s.visible ? '' : 'ascunsa'}>
                <span className="admin-layout-nr">
                  {s.visible
                    ? String(ciorna.layout.filter((x, j) => x.visible && j <= i).length).padStart(
                        2,
                        '0'
                      )
                    : '—'}
                </span>
                <span className="admin-layout-nume">{ETICHETE_SECTIUNI[s.key]}</span>
                <button
                  type="button"
                  className="admin-btn-ghost"
                  onClick={() => seteaza('layout', mutaSectiune(ciorna.layout, s.key, -1))}
                  disabled={publica || i === 0}
                  aria-label={`Mută „${ETICHETE_SECTIUNI[s.key]}” mai sus`}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="admin-btn-ghost"
                  onClick={() => seteaza('layout', mutaSectiune(ciorna.layout, s.key, 1))}
                  disabled={publica || i === ciorna.layout.length - 1}
                  aria-label={`Mută „${ETICHETE_SECTIUNI[s.key]}” mai jos`}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="admin-btn-ghost"
                  onClick={() => seteaza('layout', comutaVizibilitatea(ciorna.layout, s.key))}
                  disabled={publica}
                >
                  {s.visible ? 'Ascunde' : 'Arată'}
                </button>
              </li>
            ))}
          </ol>
        </div>
        </Blocat.Provider>
      )}

      {/* Bara lipita jos.
          „Salveaza" si „Publica" stateau doar in capul tabului, adica la doua
          ecrane si jumatate deasupra locului in care editezi ultimul camp. Ca sa
          publici trebuia sa derulezi inapoi, iar starea ciornei (salvata sau nu)
          nu se vedea deloc de jos. */}
      {ciorna !== null && (
        <div className="admin-bara-actiuni" role="status">
          <span className="admin-bara-stare">
            {probleme.length > 0 ? (
              <span className="admin-bara-problema">
                {probleme.length === 1
                  ? '1 câmp de reparat'
                  : `${probleme.length} câmpuri de reparat`}
              </span>
            ) : (
              <>
                <strong>Ediția {ciorna.number}</strong>
                <span className="admin-bara-detaliu">
                  {descrieMoment(ciorna.start, ciorna.tz, acum) || ciorna.start}
                </span>
              </>
            )}
          </span>
          <div className="admin-bara-butoane">
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
              className="admin-btn-ghost"
              onClick={salveazaCiorna}
              // `publica` la fel de mult ca `salveaza`: publicarea salvează ea
              // însăși, deci un al doilea „Salvează" din zbor ar scrie peste.
              disabled={salveaza || publica || !poatePublica}
            >
              {salveaza ? 'Se salvează…' : 'Salvează'}
            </button>
            <button
              type="button"
              className="admin-btn-accent"
              onClick={() => setConfirmPublicare(true)}
              disabled={publica || !poatePublica}
            >
              {publica ? 'Se publică…' : 'Publică'}
            </button>
          </div>
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
              Se <strong>salvează ciorna așa cum arată acum</strong>, apoi se publică. Site-ul
              public trece pe configul ăsta imediat, fără deploy. Vizitatorii vor vedea{' '}
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

/**
 * Un grup de câmpuri, sub o întrebare („Când”, „Unde”, „Locuri”).
 *
 * Formularul avea optsprezece câmpuri într-o singură coloană plată, în ordinea
 * în care apar în tipul TypeScript — o ordine care are sens pentru cod, nu
 * pentru omul care deschide pagina ca să mute ora cursei.
 */
/**
 * O secțiune a formularului, pliabilă, cu rezumat pe capac.
 *
 * De ce pliabilă: cele șase grupuri însemnau douăzeci de câmpuri deschise
 * simultan, pe două ecrane și jumătate. Organizatorul vine însă să schimbe un
 * lucru — ora, locul, capacitatea — nu douăzeci. Cu grupurile închise, tot
 * documentul încape într-un ecran, iar cel deschis e cel la care lucrezi.
 *
 * `rezumat` e ce ține locul câmpurilor când grupul e închis. Fără el, plierea
 * ar ascunde informația în loc s-o comprime, iar organizatorul ar fi nevoit să
 * deschidă fiecare grup ca să verifice ce a pus.
 *
 * Un grup cu erori se deschide singur și rămâne deschis: o problemă ascunsă
 * sub un capac e o problemă pe care „Publică" o raportează fără să arate unde.
 */
const Grup = ({
  titlu,
  ajutor,
  rezumat,
  areEroare = false,
  deschisImplicit = false,
  children,
}: {
  titlu: string;
  ajutor?: string;
  rezumat?: ReactNode;
  areEroare?: boolean;
  deschisImplicit?: boolean;
  children: ReactNode;
}) => {
  const [deschisManual, setDeschisManual] = useState(deschisImplicit);
  const deschis = deschisManual || areEroare;
  const idCorp = useId();

  return (
    <section className={`admin-config-grup${deschis ? ' deschis' : ''}${areEroare ? ' invalid' : ''}`}>
      <button
        type="button"
        className="admin-config-grup-cap"
        aria-expanded={deschis}
        // `aria-expanded` singur spune „e deschis" fără să spună CE e deschis.
        aria-controls={idCorp}
        onClick={() => setDeschisManual((v) => !v)}
      >
        <span className="admin-config-grup-sageata" aria-hidden="true">
          {deschis ? '▾' : '▸'}
        </span>
        <span className="admin-config-grup-titlu">{titlu}</span>
        {!deschis && rezumat && <span className="admin-config-grup-rezumat">{rezumat}</span>}
        {areEroare && <span className="admin-tab-alert">!</span>}
      </button>
      {deschis && (
        <div className="admin-config-grup-corp" id={idCorp}>
          {ajutor && <p className="admin-config-hint">{ajutor}</p>}
          <div className="admin-config-grup-campuri">{children}</div>
        </div>
      )}
    </section>
  );
};

/** Ce primește controlul din interiorul unui `Camp`, gata de împrăștiat pe el. */
type ControlCamp = {
  id: string;
  'aria-describedby'?: string;
  'aria-invalid'?: true;
  autoComplete: 'off';
  disabled?: true;
};

/**
 * Un câmp: etichetă, control, și — sub el — explicația, ecoul sau eroarea.
 *
 * `ecou` e confirmarea a ceea ce tocmai s-a ales, scrisă cu litere („sâmbătă,
 * 22 august 2026 · peste 3 luni”). Eroarea îl înlocuiește: cât timp valoarea e
 * invalidă, n-are ce confirma.
 *
 * Controlul vine ca funcție, nu ca element: eticheta e legată prin `htmlFor`,
 * iar ajutorul și eroarea prin `aria-describedby`. Un `<label>` care le-ar
 * înveli pe toate ar lipi și explicația de NUMELE accesibil al inputului —
 * cititorul de ecran ar anunța „Numărul ediției Ediția la care se înscrie lumea
 * acum" în loc de „Numărul ediției", iar `getByLabelText` n-ar mai găsi câmpul.
 */
const Camp = ({
  eticheta,
  ajutor,
  eroare,
  ecou,
  children,
}: {
  eticheta: string;
  ajutor?: string;
  eroare?: string;
  ecou?: ReactNode;
  children: (control: ControlCamp) => ReactNode;
}) => {
  const id = useId();
  const idAjutor = `${id}-ajutor`;
  const idEroare = `${id}-eroare`;
  const blocat = useContext(Blocat);
  // Eroarea prima: e cea care cere o acțiune acum.
  const descrieri = [eroare && idEroare, ajutor && idAjutor].filter(Boolean).join(' ');

  return (
    <div className={`admin-config-camp${eroare ? ' invalid' : ''}`}>
      <label className="admin-config-eticheta" htmlFor={id}>
        {eticheta}
      </label>
      {children({
        id,
        'aria-describedby': descrieri || undefined,
        'aria-invalid': eroare ? true : undefined,
        // Niciun câmp de aici nu e dată personală. Autocompletarea browserului
        // n-are ce oferi, dar poate acoperi valoarea reală cu una veche.
        autoComplete: 'off',
        disabled: blocat || undefined,
      })}
      {eroare ? (
        <span id={idEroare} className="admin-config-eroare" role="alert">
          {eroare}
        </span>
      ) : (
        ecou && <span className="admin-config-ecou">{ecou}</span>
      )}
      {ajutor && (
        <span id={idAjutor} className="admin-config-ajutor">
          {ajutor}
        </span>
      )}
    </div>
  );
};
