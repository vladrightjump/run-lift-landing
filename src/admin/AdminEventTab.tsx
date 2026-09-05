import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { useSesiuneAdmin } from './adminSession';
import { Blocat } from './eventTab/primitive';
import { refuzCuPas, type Pas } from './eventTab/ajutoare';
import { GrupCeArata } from './eventTab/grupuri/GrupCeArata';
import { GrupLocuri } from './eventTab/grupuri/GrupLocuri';
import { GrupUnde } from './eventTab/grupuri/GrupUnde';
import { GrupEditia } from './eventTab/grupuri/GrupEditia';
import { GrupRemindere } from './eventTab/grupuri/GrupRemindere';
import { GrupInstagram } from './eventTab/grupuri/GrupInstagram';
import { GrupCand } from './eventTab/grupuri/GrupCand';
import { fetchBuildInfo, campuriVechiInBuild, type BuildInfo } from './buildFingerprint';
import { descrieMoment, problemePeCamp } from './eventConfigFields';
import {
  reperele,
  mutaReperele,
  reperiiCareSeMuta,
} from './reperele';
import { useNow } from '../hooks/useNow';

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
export const AdminEventTab = () => {
  const { token, onAuthError, showToast } = useSesiuneAdmin();
  const [randuri, setRanduri] = useState<AdminEventConfigRow[] | null>(null);
  const [ciorna, setCiorna] = useState<EventConfig | null>(null);
  const [salveaza, setSalveaza] = useState(false);
  const [publica, setPublica] = useState(false);
  const [confirmPublicare, setConfirmPublicare] = useState(false);
  /**
   * Ultimul refuz, până la următoarea încercare.
   *
   * Toastul a pornit și n-a fost văzut: 3,2 secunde, peste bara pe care tocmai
   * ai apăsat, fix când se închide dialogul. Rămâne — e semnalul „tocmai s-a
   * întâmplat" — dar mesajul stă și în bară, unde e „încă e adevărat".
   */
  const [refuz, setRefuz] = useState<string | null>(null);
  // Ciorna nu se rescrie sub degetele organizatorului la fiecare poll.
  const atinsa = useRef(false);
  const [build, setBuild] = useState<BuildInfo | null>(null);
  /**
   * Startul de la care s-a plecat — reperul față de care se măsoară o mutare.
   *
   * NU e „valoarea anterioară a câmpului": un `datetime-local` trimite `change`
   * la fiecare componentă parcursă (ziua, apoi luna, apoi ora), deci un delta
   * calculat din ultima valoare ar fi trei mutări mărunte în loc de una. Ancora
   * stă pe loc până când mutarea e acceptată sau refuzată explicit, iar oferta
   * spune atunci cât s-a mutat startul cu totul.
   */
  const [ancoraStart, setAncoraStart] = useState<string | null>(null);

  const incarca = useCallback(
    (signal?: AbortSignal) => {
      listEventConfig(token, undefined, signal)
        .then((rows) => {
          setRanduri(rows);
          if (atinsa.current) return;
          const draft = rows.find((r) => r.status === 'draft');
          if (draft) {
            const cfg = parseEventConfig(draft.config);
            setCiorna(cfg);
            setAncoraStart(cfg?.start ?? null);
          }
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

  /**
   * O scriere e în zbor — formularul și toate butoanele care ating serverul
   * sunt inerte.
   *
   * Salvarea contează la fel de mult ca publicarea: și ea ține documentul pe
   * care l-a capturat, iar la succes resetează `atinsa` și cheamă `incarca()`,
   * care rescrie ciorna din server. Ce s-a tastat în timpul dus-întorsului
   * dispărea fără urmă.
   */
  const ocupat = salveaza || publica;

  const probleme: CampInvalid[] = ciorna ? validateEventConfig(ciorna) : [];
  const avertismente = ciorna ? avertismenteEventConfig(ciorna) : [];
  const poatePublica = ciorna !== null && probleme.length === 0;
  // Aceleași probleme, dar indexate pe câmp — ca să apară lângă inputul vinovat.
  const erori = problemePeCamp(probleme);
  // Doar pentru „peste 3 luni” de sub datele calendaristice. Un minut e destul:
  // nimeni nu se uită la ecoul ăsta ca la un cronometru.
  const acum = useNow(60_000);

  // Desfășurarea ediției, în ordine. Lista e goală cât timp un format e stricat
  // — validarea spune deja care câmp, iar o linie de timp desenată din `NaN`
  // ar fi o afirmație falsă despre document.
  const repere = useMemo(() => (ciorna ? reperele(ciorna, acum) : []), [ciorna, acum]);

  // Orarul reminderelor, tradus în momente concrete. Rândurile se afișează în
  // ordinea în care pleacă emailurile, dar se editează prin `index`, care e
  // poziția din DOCUMENT — resortarea nu trebuie să rescrie alt rând decât cel
  // atins. `acum` se împrospătează la un minut, deci „peste 2 zile" nu îmbătrânește.

  /**
   * Startul s-a mutat — și odată cu el ar trebui să se mute și ce atârnă de el.
   *
   * Oferit, nu aplicat: un formular care rescrie patru câmpuri pe care nu le-ai
   * atins e un formular în care nu mai știi ce ai setat tu. Dar netratat deloc
   * înseamnă ce se întâmpla până acum — ciorna ediției următoare pornește de la
   * cea publicată, deci moștenește momentul de anunț al ediției TRECUTE, iar
   * nimic nu-l semnala până pe site.
   *
   * Deltele absurde (câmp golit, an tastat pe jumătate) nu produc ofertă: sub
   * un minut n-are ce muta, peste doi ani e o stare de trecere, nu o decizie.
   */
  const mutareOferita = useMemo(() => {
    if (!ciorna || ancoraStart === null || ancoraStart === ciorna.start) return null;
    const delta =
      new Date(`${ciorna.start}${ciorna.tz}`).getTime() -
      new Date(`${ancoraStart}${ciorna.tz}`).getTime();
    if (!Number.isFinite(delta) || Math.abs(delta) < 60_000 || Math.abs(delta) > 730 * 86_400_000) {
      return null;
    }
    const nume = reperiiCareSeMuta({ ...ciorna, start: ancoraStart }, ciorna.start);
    return nume.length > 0 ? { delta, nume } : null;
  }, [ciorna, ancoraStart]);

  const mutaTot = () => {
    if (!ciorna || ancoraStart === null) return;
    atinsa.current = true;
    setCiorna(mutaReperele({ ...ciorna, start: ancoraStart }, ciorna.start));
    setAncoraStart(ciorna.start);
  };

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

  const seteazaRemindere = (reminders: EventConfig['reminders']) => {
    setCiorna((c) => {
      atinsa.current = true;
      return c ? { ...c, reminders } : c;
    });
  };

  // Un refuz descrie documentul care l-a produs. Când se schimbă ciorna
  // deschisă, reproșul nu mai are despre ce să fie.
  const porneste = () => {
    const baza = publicat;
    if (!baza) return;
    atinsa.current = true;
    setRefuz(null);
    setCiorna(cioarnaPentruEditiaUrmatoare(baza));
    setAncoraStart(baza.start);
  };

  const porneteDinPublicat = () => {
    if (!publicat) return;
    atinsa.current = true;
    setRefuz(null);
    setCiorna({ ...publicat, layout: layoutComplet(publicat.layout) });
    setAncoraStart(publicat.start);
  };

  const salveazaCiorna = async () => {
    if (!ciorna || probleme.length > 0) return;
    setRefuz(null);
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
      if (!onAuthError(err)) {
        const msg = refuzCuPas('salvare', err);
        setRefuz(msg);
        showToast({ kind: 'error', msg });
      }
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
    // Aceeași gardă ca la salvare: butonul dezactivat nu e o gardă, iar
    // dialogul nu prinde focusul în capcană.
    if (!ciorna || probleme.length > 0) return;
    setConfirmPublicare(false);
    setRefuz(null);
    setPublica(true);
    // Care apel a picat — singurul lucru care spune dacă editările au ajuns
    // sau nu pe server. Motivul serverului nu-l poate spune.
    let pas: Pas = 'salvare';
    try {
      await saveEventConfigDraft(token, ciorna.number, ciorna);
      pas = 'publicare';
      await publishEventConfig(token, ciorna.number);
      showToast({
        kind: 'success',
        msg: `Ediția ${ciorna.number} e publicată.`,
      });
      atinsa.current = false;
      incarca();
    } catch (err) {
      if (!onAuthError(err)) {
        const msg = refuzCuPas(pas, err);
        setRefuz(msg);
        showToast({ kind: 'error', msg });
      }
    } finally {
      setPublica(false);
    }
  };

  const revino = async (id: string, editie: number) => {
    setRefuz(null);
    try {
      await restoreEventConfig(token, id);
      showToast({
        kind: 'success',
        msg: `Ai revenit la o versiune anterioară a ediției ${editie}.`,
      });
      atinsa.current = false;
      incarca();
    } catch (err) {
      if (!onAuthError(err)) {
        // Republicarea e singurul buton care schimbă site-ul dintr-un click.
        // Refuzul ei merită aceeași bară ca al celorlalte două scrieri, nu doar
        // toastul de 3,2 secunde.
        const msg = refuzCuPas('revenire', err);
        setRefuz(msg);
        showToast({ kind: 'error', msg });
      }
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
                // Abandonul demontează bara, deci un refuz apărut după el n-ar
                // avea unde să se afișeze — exact garanția pe care o dăm.
                disabled={ocupat}
                onClick={() => {
                  atinsa.current = false;
                  setRefuz(null);
                  setCiorna(null);
                  setAncoraStart(null);
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
        <>
          {/* Fără ciornă deschisă bara nu se randează, iar „Revino la asta" e
              tocmai butonul care se apasă de aici. Refuzul lui are nevoie de un
              loc al lui, altfel rămâne doar pe toast. */}
          {refuz && (
            <div className="admin-banner warn" role="status">
              {refuz}
            </div>
          )}
          <div className="admin-empty">
            Nicio ciornă deschisă. Pornește una ca să schimbi ediția — nimic nu ajunge pe site până
            nu apeși „Publică”.
          </div>
        </>
      ) : (
        <Blocat.Provider value={ocupat}>
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

          <GrupEditia
            ciorna={ciorna}
            seteaza={seteaza}
            erori={erori}
            areEroare={areEroare}
          />

          <GrupCand
            ciorna={ciorna}
            seteaza={seteaza}
            erori={erori}
            areEroare={areEroare}
            acum={acum}
            repere={repere}
            mutareOferita={mutareOferita}
            onMutaTot={mutaTot}
            onAncoreaza={setAncoraStart}
          />

          <GrupUnde
            ciorna={ciorna}
            seteaza={seteaza}
            erori={erori}
            areEroare={areEroare}
          />

          <GrupLocuri
            ciorna={ciorna}
            seteaza={seteaza}
            erori={erori}
            areEroare={areEroare}
          />

          <GrupRemindere
            ciorna={ciorna}
            seteazaRemindere={seteazaRemindere}
            erori={erori}
            areEroare={areEroare}
            acum={acum}
          />

          <GrupCeArata
            ciorna={ciorna}
            seteaza={seteaza}
          />

          <GrupInstagram
            ciorna={ciorna}
            seteaza={seteaza}
            erori={erori}
          />

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
                        disabled={ocupat}
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
                        disabled={ocupat}
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
                        disabled={ocupat}
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
                        disabled={ocupat || i === 0}
                        aria-label={`Mută clipul ${i + 1} mai devreme`}
                        onClick={() => seteazaReels(mutaReel(ciorna.reels.items, i, -1), true)}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="admin-btn-ghost"
                        disabled={ocupat || i === ciorna.reels.items.length - 1}
                        aria-label={`Mută clipul ${i + 1} mai târziu`}
                        onClick={() => seteazaReels(mutaReel(ciorna.reels.items, i, 1), true)}
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        className="admin-btn-ghost"
                        disabled={ocupat}
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
            disabled={ocupat || ciorna.reels.items.length >= MAX_REELS}
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
                  disabled={ocupat || i === 0}
                  aria-label={`Mută „${ETICHETE_SECTIUNI[s.key]}” mai sus`}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="admin-btn-ghost"
                  onClick={() => seteaza('layout', mutaSectiune(ciorna.layout, s.key, 1))}
                  disabled={ocupat || i === ciorna.layout.length - 1}
                  aria-label={`Mută „${ETICHETE_SECTIUNI[s.key]}” mai jos`}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="admin-btn-ghost"
                  onClick={() => seteaza('layout', comutaVizibilitatea(ciorna.layout, s.key))}
                  disabled={ocupat}
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
            {/* Problemele de validare au întâietate: ele dezactivează „Publică",
                deci un refuz vechi n-are ce concura cu ele. */}
            {probleme.length > 0 ? (
              <span className="admin-bara-problema">
                {probleme.length === 1
                  ? '1 câmp de reparat'
                  : `${probleme.length} câmpuri de reparat`}
              </span>
            ) : refuz ? (
              <span className="admin-bara-problema">{refuz}</span>
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
              disabled={ocupat || !poatePublica}
            >
              {salveaza ? 'Se salvează…' : 'Salvează'}
            </button>
            <button
              type="button"
              className="admin-btn-accent"
              onClick={() => setConfirmPublicare(true)}
              disabled={ocupat || !poatePublica}
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
                    // Republicare imediată — n-are ce căuta în paralel cu o
                    // salvare sau o publicare pe același rând.
                    disabled={ocupat}
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
