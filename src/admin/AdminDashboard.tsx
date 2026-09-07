import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { toCsv } from '../lib/csv';
import {
  addRegistration,
  updateRegistration,
  deleteRegistration,
  undeleteRegistration,
  listRegistrations,
  listWaitlist,
  deleteWaitlist,
  undeleteWaitlist,
  promoteWaitlist,
  listAdminEvents,
  listEditions,
  createEdition,
  listEmailLog,
  listEventConfig,
  InvalidTokenError,
} from '../lib/adminApi';
import type {
  AdminRegistration,
  AdminWaitlistEntry,
  AdminEvent,
  AdminEdition,
  AdminEmailLogEntry,
} from '../lib/adminApi';
import { AdminEmailTab } from './AdminEmailTab';
import { AdminLaunchTab } from './AdminLaunchTab';
import { AdminEventTab } from './AdminEventTab';
import { AdminComingSoonTab } from './AdminComingSoonTab';
import { AdminNav } from './AdminNav';
import { AdminTemplatesTab } from './AdminTemplatesTab';
import { AdminEditionTabs } from './AdminEditionTabs';
import { AdminDeliveryTab } from './AdminDeliveryTab';
import { emailuriNelivrate, acoperire } from './deliveryLog';
import type { StareCelula } from './deliveryLog';
import { useAdminPolling } from './useAdminPolling';
import { isDuplicateError, sendConfirmationEmail } from '../lib/supabase';
import { EMAIL_RE, PHONE_RE, normalizePhone } from '../lib/validation';
import { useCountdown } from '../hooks/useCountdown';
import { useNow } from '../hooks/useNow';
import { useEventConfig, useEditionDates } from '../hooks/useEventConfig';
import { AdminSkeleton } from './AdminSkeleton';
import { AdminAcum } from './AdminAcum';
import { AdminActivitate } from './AdminActivitate';
import { AdminAsteptare } from './AdminAsteptare';
import { AdminCifre } from './AdminCifre';
import { AdminRandAdaugare } from './AdminRandAdaugare';
import { fazaSite, ETICHETA_FAZA, type TabAdmin } from './stareCurenta';
import { fetchBuildInfo, campuriVechiInBuild, type BuildInfo } from './buildFingerprint';
import { parseEventConfig } from '../content/eventConfig';
import { ziSiLuna } from '../lib/formatare';
import { FurnizorSesiuneAdmin } from './adminSession';
import { rezumaAcoperire, motivUndoEsuat } from './dashboardRezumate';

type Props = {
  token: string;
  onLogout: () => void;
};

type AdminToast = {
  kind: 'error' | 'success';
  msg: string;
  undo?: () => void;
};

/**
 * Tab-urile, cu etichete scrise ca sarcini, nu ca nume de tabel.
 *
 * „Anunță-mă la lansare" era numele butonului de pe pagina publică, nu al
 * lucrului din spatele tabului: lista celor care au cerut să fie anunțați.
 * `descriere` ajunge în `title` — răspunsul la „ce e aici?" fără să dai click.
 */
// Gruparea taburilor stă în `adminNavigatie.ts`, ca modul pur.


export const AdminDashboard = ({ token, onLogout }: Props) => {
  const [rows, setRows] = useState<AdminRegistration[] | null>(null);
  const [waitlist, setWaitlist] = useState<AdminWaitlistEntry[] | null>(null);
  const [events, setEvents] = useState<AdminEvent[] | null>(null);
  const [emailLog, setEmailLog] = useState<AdminEmailLogEntry[] | null>(null);
  const [editions, setEditions] = useState<AdminEdition[] | null>(null);
  // Ediția deschisă în backoffice. null = încă nu știm ce ediții există.
  const [editie, setEditie] = useState<number | null>(null);
  const [creatingEdition, setCreatingEdition] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [query, setQuery] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [draft, setDraft] = useState({ nume: '', telefon: '', email: '' });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<AdminToast | null>(null);
  const [confirmRow, setConfirmRow] = useState<AdminRegistration | null>(null);
  const [tab, setTab] = useState<TabAdmin>('participanti');
  // Semnalele pentru panoul „Acum". Ciorna și amprenta de build trăiesc în
  // tabul „Eveniment"; aici le citim doar ca să putem spune, din prima pagină,
  // că a rămas ceva nepublicat.
  const [ciornaNepublicata, setCiornaNepublicata] = useState(false);
  const [metaInUrma, setMetaInUrma] = useState(false);
  const toastTimerRef = useRef<number | null>(null);
  // Ediția și capacitatea vin din configul PUBLICAT, nu din bundle: după ce
  // publicarea nu mai cere deploy, un backoffice deschis dintr-un build vechi ar
  // filtra ediția greșită — și nu mai există banner care să explice de ce.
  const config = useEventConfig();
  const CURRENT_EDITION = config.number;
  const TOTAL_SLOTS = config.slots.total;
  const WAITLIST_SLOTS = config.slots.waitlist;
  const dates = useEditionDates();
  const { LAUNCH_DATE } = dates;
  const cd = useCountdown(LAUNCH_DATE);
  // Faza pentru chip-ul din antet. Un minut e destul: fazele se masoara in ore
  // si zile, iar countdown-ul la secunda exista deja langa el.
  const acumMs = useNow(60_000);
  const fazaAcum = fazaSite(config, dates, acumMs);

  // Ediția pe care backendul o consideră curentă. Doar ea acceptă modificări:
  // ascunderea butoanelor de aici e comoditate, refuzul real vine din RPC-urile
  // de scriere (`edition_archived` — vezi supabase-migration-editii-si-email-log.sql).
  const editieCurenta = editions?.find((e) => e.este_curenta)?.editie ?? null;
  const arhiva = editie !== null && editieCurenta !== null && editie !== editieCurenta;

  // Sesiune expirată — orice RPC o semnalează; ieșim la login.
  const handleAuthError = useCallback(
    (err: unknown): boolean => {
      if (err instanceof InvalidTokenError) {
        onLogout();
        return true;
      }
      return false;
    },
    [onLogout]
  );

  const showToast = useCallback((next: AdminToast) => {
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    setToast(next);
    toastTimerRef.current = window.setTimeout(() => setToast(null), next.undo ? 6000 : 3200);
  }, []);

  // refresh() e stabil; ref-ul evită să-l recreăm la fiecare schimbare de listă.
  const rowsRef = useRef<AdminRegistration[] | null>(null);
  rowsRef.current = rows;
  const waitlistRef = useRef<AdminWaitlistEntry[] | null>(null);
  waitlistRef.current = waitlist;
  // Id-urile evenimentelor deja văzute — ca să anunțăm (toast) doar promovările
  // automate NOI, nu pe cele preexistente la primul load.
  const seenEventsRef = useRef<Set<string> | null>(null);

  // Inventarul edițiilor — o dată la montare și după ce deschidem una nouă.
  const refreshEditions = useCallback(() => {
    listEditions(token)
      .then((data) => {
        setEditions(data);
        // Prima încărcare: deschidem ediția curentă.
        setEditie((prev) => prev ?? data.find((e) => e.este_curenta)?.editie ?? null);
      })
      .catch(handleAuthError);
  }, [token, handleAuthError]);

  useEffect(refreshEditions, [refreshEditions]);

  /**
   * Semnalele pentru panoul „Acum" care nu vin din ciclul de participanți:
   * există o ciornă nepublicată, și a rămas share preview-ul în urmă.
   *
   * O dată la montare, nu la fiecare poll: amândouă se schimbă doar când
   * organizatorul acționează în tabul „Eveniment", iar acolo se reîncarcă
   * oricum. Un poll pe ele ar fi două cereri în plus la fiecare ciclu, pentru
   * o informație care stă pe loc ore întregi.
   */
  useEffect(() => {
    const c = new AbortController();
    Promise.all([
      listEventConfig(token, undefined, c.signal),
      fetchBuildInfo(c.signal) as Promise<BuildInfo | null>,
    ])
      .then(([randuri, build]) => {
        setCiornaNepublicata(randuri.some((r) => r.status === 'draft'));
        const publicat = randuri.find((r) => r.status === 'published');
        // `parseEventConfig` întoarce `null` pe un document pe care nu-l
        // recunoaște; fără config publicat valid n-avem cu ce compara build-ul,
        // deci nu semnalăm nimic.
        const config = publicat ? parseEventConfig(publicat.config) : null;
        setMetaInUrma(
          build !== null && config !== null && campuriVechiInBuild(build, config).length > 0
        );
      })
      // Semnalele sunt un plus, nu o precondiție: dacă nu vin, panoul arată
      // restul stării în loc să blocheze pagina.
      .catch(() => {});
    return () => c.abort();
  }, [token]);

  const fetchAll = useCallback(
    (signal: AbortSignal) => {
    // Fără ediție știută n-avem ce cere — așteptăm inventarul.
    if (editie === null) return;
    listRegistrations(token, editie, signal)
      .then((data) => {
        setRows(data);
        setLoadError(false);
      })
      .catch((err) => {
        if (signal.aborted || handleAuthError(err)) return;
        // Păstrăm ultima listă cunoscută; eroarea contează doar la primul load.
        setLoadError((prev) => prev || rowsRef.current === null);
      });
    listWaitlist(token, editie, signal)
      .then(setWaitlist)
      .catch((err) => {
        if (signal.aborted) return;
        handleAuthError(err);
      });
    // Corpul emailurilor doar când e chiar folosit (tab-ul „Livrare"); în rest
    // avem nevoie doar de status, pentru badge + coloana din tabelul de participanți.
    listEmailLog(token, editie, tab === 'livrare', signal)
      .then(setEmailLog)
      .catch((err) => {
        if (signal.aborted) return;
        handleAuthError(err);
      });
    listAdminEvents(token, 200, signal)
      .then((data) => {
        // Primul load: marcăm tot ca „văzut" fără toast. Apoi anunțăm doar noutățile.
        if (seenEventsRef.current === null) {
          seenEventsRef.current = new Set(data.map((e) => e.id));
        } else {
          for (const e of data) {
            if (e.tip === 'auto_promote' && !seenEventsRef.current.has(e.id)) {
              const nume = typeof e.detaliu?.nume === 'string' ? e.detaliu.nume : 'Cineva';
              showToast({
                kind: 'success',
                msg: `${nume} a fost promovat automat din așteptare.`,
              });
            }
            seenEventsRef.current.add(e.id);
          }
        }
        setEvents(data);
      })
      .catch((err) => {
        if (signal.aborted) return;
        handleAuthError(err);
      });
    },
    [token, editie, tab, handleAuthError, showToast]
  );

  const refresh = useAdminPolling(fetchAll);

  // Schimbarea ediției înseamnă alt set de date — golim ca să nu se vadă o clipă
  // lista ediției anterioare sub numărul nou.
  const editiePrecedentaRef = useRef<number | null>(null);
  useEffect(() => {
    if (editiePrecedentaRef.current !== null && editiePrecedentaRef.current !== editie) {
      setRows(null);
      setWaitlist(null);
      setEmailLog(null);
      setQuery('');
      setAddOpen(false);
      setEditId(null);
      // Altfel dialogul de confirmare rămâne deschis peste ediția nouă și
      // „Da, șterge" ar lovi un rând care nu mai e în lista vizibilă.
      setConfirmRow(null);
    }
    editiePrecedentaRef.current = editie;
  }, [editie]);

  // Poll-ul stă în `useAdminPolling`; aici rămâne doar cronometrul toast-ului,
  // care nu ține de ciclul de date.
  useEffect(
    () => () => {
      if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    },
    []
  );

  const all = rows ?? [];
  const q = query.trim().toLowerCase();
  const filtered = all.filter(
    (r) => !q || `${r.nume} ${r.telefon} ${r.email}`.toLowerCase().includes(q)
  );
  const waitAll = waitlist ?? [];

  // Acoperirea per participant — pentru indicatorul din tabel.
  //
  // Înainte aici stătea „ultimul email", o hartă cheiată DOAR pe adresă: orice
  // trimitere reușită ulterioară acoperea un eșec anterior, așa că o bifă verde
  // putea coexista cu un reminder care n-a ajuns niciodată. Acum indicatorul
  // citește aceeași fișă ca tabul „Livrare", pe comunicare, nu pe adresă.
  const acoperirePerId = useMemo(() => {
    const m = new Map<string, Record<string, StareCelula>>();
    for (const r of acoperire(all, emailLog ?? [])) m.set(r.participant.id, r.celule);
    return m;
  }, [all, emailLog]);

  // Câte emailuri au rămas nelivrate (ultima încercare per adresă+subiect e eșec)
  // — badge-ul roșu de pe tabul „Livrare". Aceeași logică pe care o consumă și
  // tabul, din `deliveryLog.ts` — înainte era rescrisă aici, în paralel.
  const nelivrate = useMemo(() => emailuriNelivrate(emailLog ?? []).length, [emailLog]);

  /**
   * Contorul de pe fiecare tab. `null` = nu-l arătăm.
   *
   * Doar acolo unde numărul chiar spune ceva și îl avem deja încărcat. Un „0"
   * afișat cât timp datele se încarcă e o minciună scurtă — dar exact aia o
   * citește organizatorul în clipa în care intră.
   */
  const contorTab: Record<TabAdmin, number | null> = {
    participanti: rows === null ? null : all.length,
    email: null,
    livrare: null,
    lansare: null,
    eveniment: null,
    'coming-soon': null,
    sabloane: null,
  };

  const handleCreateEdition = () => {
    if (creatingEdition) return;
    setCreatingEdition(true);
    createEdition(token)
      .then((nou) => {
        setEditie(nou);
        refreshEditions();
        showToast({
          kind: 'success',
          msg: `Ediția ${nou} e deschisă. Actualizează edition.ts și redeployează.`,
        });
      })
      .catch((err) => {
        if (handleAuthError(err)) return;
        showToast({ kind: 'error', msg: 'Nu am putut deschide ediția nouă.' });
      })
      .finally(() => setCreatingEdition(false));
  };

  /**
   * Rândurile cu o acțiune în zbor.
   *
   * Pe rând, nu global: un rând ocupat n-are de ce să înghețe restul tabelului,
   * iar organizatorul lucrează pe mai multe rânduri în aceeași fereastră de
   * câteva secunde. Butoanele se randau fără `disabled` cât ținea dus-întorsul,
   * deci al doilea clic pleca la server ca și primul.
   */
  const [randuriOcupate, setRanduriOcupate] = useState<ReadonlySet<string>>(new Set());
  const elibereaza = (id: string) =>
    setRanduriOcupate((s) => {
      const fara = new Set(s);
      fara.delete(id);
      return fara;
    });
  const ocupa = (id: string) => setRanduriOcupate((s) => new Set(s).add(id));

  // Promovează o persoană din așteptare în participanți + email de confirmare.
  const handlePromote = (row: AdminWaitlistEntry) => {
    if (randuriOcupate.has(row.id)) return;
    const before = waitlistRef.current ?? [];
    ocupa(row.id);
    setWaitlist(before.filter((w) => w.id !== row.id));
    promoteWaitlist(token, row.id)
      .then((newId) => {
        if (newId) void sendConfirmationEmail(newId);
        refresh();
        showToast({ kind: 'success', msg: `${row.nume} a fost promovat la participanți.` });
      })
      .catch((err) => {
        if (handleAuthError(err)) return;
        setWaitlist(before);
        showToast({ kind: 'error', msg: 'Promovarea nu a mers. Încearcă din nou.' });
      })
      .finally(() => elibereaza(row.id));
  };

  const handleDeleteWaitlist = (row: AdminWaitlistEntry) => {
    if (randuriOcupate.has(row.id)) return;
    const before = waitlistRef.current ?? [];
    ocupa(row.id);
    setWaitlist(before.filter((w) => w.id !== row.id));
    deleteWaitlist(token, row.id)
      .then(() => {
        showToast({
          kind: 'error',
          msg: `${row.nume} a fost șters din așteptare.`,
          // Paritate cu ștergerea unei înscrieri, o funcție mai jos. Reversare,
          // nu reinserare: același rând, deci același `created_at` și aceeași
          // poziție în ordinea FIFO de promovare.
          undo: () => {
            undeleteWaitlist(token, row.id)
              .then(() => {
                refresh();
                showToast({ kind: 'success', msg: `${row.nume} a fost readus pe listă.` });
              })
              .catch((err) => {
                if (handleAuthError(err)) return;
                refresh();
                showToast({ kind: 'error', msg: motivUndoEsuat(err, row.nume) });
              });
          },
        });
      })
      .catch((err) => {
        if (handleAuthError(err)) return;
        setWaitlist(before);
        showToast({ kind: 'error', msg: 'Ștergerea nu a mers. Încearcă din nou.' });
      })
      .finally(() => elibereaza(row.id));
  };

  // Ștergerea efectivă — rulează doar după confirmarea din dialog.
  const handleDelete = (row: AdminRegistration) => {
    if (randuriOcupate.has(row.id)) return;
    const before = rowsRef.current ?? [];
    ocupa(row.id);
    setRows(before.filter((r) => r.id !== row.id));
    deleteRegistration(token, row.id)
      .then(() => {
        showToast({
          kind: 'error',
          msg: `${row.nume} a fost șters.`,
          // Reversare, nu reinserare: același rând, deci același `created_at` și
          // aceeași poziție în ordinea de promovare. Înainte, undo apela
          // `addRegistration`, care sărea peste garda de capacitate și dădea
          // rândului recreat un `created_at` nou.
          undo: () => {
            undeleteRegistration(token, row.id)
              .then(() => {
                refresh();
                showToast({ kind: 'success', msg: `${row.nume} a fost readus în listă.` });
              })
              .catch((err) => {
                if (handleAuthError(err)) return;
                refresh();
                showToast({ kind: 'error', msg: motivUndoEsuat(err, row.nume) });
              });
          },
        });
      })
      .catch((err) => {
        if (handleAuthError(err)) return;
        setRows(before);
        showToast({ kind: 'error', msg: 'Ștergerea nu a mers. Încearcă din nou.' });
      })
      .finally(() => elibereaza(row.id));
  };

  const handleAdd = () => {
    if (saving) return;
    const nume = draft.nume.trim();
    const telefon = normalizePhone(draft.telefon);
    const email = draft.email.trim();
    if (nume.split(/\s+/).length < 2) {
      showToast({ kind: 'error', msg: 'Scrie numele complet (nume și prenume).' });
      return;
    }
    if (!PHONE_RE.test(telefon)) {
      showToast({ kind: 'error', msg: 'Numărul de telefon nu arată valid.' });
      return;
    }
    if (!EMAIL_RE.test(email)) {
      showToast({ kind: 'error', msg: 'Emailul nu arată valid.' });
      return;
    }
    if (all.length >= TOTAL_SLOTS) {
      showToast({ kind: 'error', msg: `Toate cele ${TOTAL_SLOTS} locuri sunt ocupate.` });
      return;
    }
    setSaving(true);
    addRegistration(token, { nume, telefon, email })
      .then(() => {
        setAddOpen(false);
        setDraft({ nume: '', telefon: '', email: '' });
        refresh();
        showToast({ kind: 'success', msg: `${nume} a fost adăugat.` });
      })
      .catch((err) => {
        if (handleAuthError(err)) return;
        // Garda de capacitate stă acum pe server, nu doar în verificarea de mai
        // sus: numărătoarea din client e mereu cu până la 15 secunde în urmă.
        const text = err instanceof Error ? err.message : String(err);
        showToast({
          kind: 'error',
          msg: isDuplicateError(err)
            ? 'Există deja o înscriere cu acest email.'
            : text.includes('event_full')
            ? 'Ediția e plină — s-a ocupat ultimul loc între timp.'
            : 'Nu am putut salva. Încearcă din nou.',
        });
      })
      .finally(() => setSaving(false));
  };

  const startEdit = (row: AdminRegistration) => {
    setEditId(row.id);
    setDraft({ nume: row.nume, telefon: row.telefon, email: row.email });
    setAddOpen(true);
  };

  const handleUpdate = () => {
    if (saving || !editId) return;
    const nume = draft.nume.trim();
    const telefon = normalizePhone(draft.telefon);
    const email = draft.email.trim();
    if (nume.split(/\s+/).length < 2) {
      showToast({ kind: 'error', msg: 'Scrie numele complet (nume și prenume).' });
      return;
    }
    if (!PHONE_RE.test(telefon)) {
      showToast({ kind: 'error', msg: 'Numărul de telefon nu arată valid.' });
      return;
    }
    if (!EMAIL_RE.test(email)) {
      showToast({ kind: 'error', msg: 'Emailul nu arată valid.' });
      return;
    }
    setSaving(true);
    updateRegistration(token, editId, { nume, telefon, email })
      .then(() => {
        setAddOpen(false);
        setEditId(null);
        setDraft({ nume: '', telefon: '', email: '' });
        refresh();
        showToast({ kind: 'success', msg: `${nume} a fost actualizat.` });
      })
      .catch((err) => {
        if (handleAuthError(err)) return;
        showToast({
          kind: 'error',
          msg: isDuplicateError(err)
            ? 'Există deja o înscriere cu acest email.'
            : 'Nu am putut salva modificările. Încearcă din nou.',
        });
      })
      .finally(() => setSaving(false));
  };

  const exportCsv = () => {
    const header = ['Nr', 'Nume', 'Telefon', 'Email', 'Data înscrierii'];
    const lines = all.map((r, i) => [
      String(i + 1),
      r.nume,
      r.telefon,
      r.email,
      new Date(r.created_at).toLocaleString('ro-RO'),
    ]);
    const csv = toCsv([header, ...lines]);
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `run-lift-participanti-editia-${editie ?? CURRENT_EDITION}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <FurnizorSesiuneAdmin token={token} onAuthError={handleAuthError} showToast={showToast}>
      <header className="admin-topbar">
        <div className="brand">
          <span className="admin-logo">
            Run <span className="accent">+</span> Lift
          </span>
          <span className="admin-badge">Backoffice</span>
        </div>
        <div className="admin-topbar-meta">
          {/* Ce vede un vizitator ACUM, in antetul lipit. Intrebarea nu se pune
              o data la deschidere: se pune de fiecare data cand te pregatesti sa
              schimbi ceva, iar panoul din capul paginii dispare la primul scroll. */}
          <a
            className={`admin-faza faza-${fazaAcum}`}
            href="/"
            target="_blank"
            rel="noopener noreferrer"
            title="Deschide site-ul public intr-un tab nou"
          >
            <span className="admin-faza-punct" aria-hidden="true" />
            <span className="admin-faza-eticheta">Pe site</span>
            <span className="admin-faza-valoare">{ETICHETA_FAZA[fazaAcum]}</span>
            <span aria-hidden="true">↗</span>
          </a>
          {/* Numaratoarea spre anunt dispare dupa ce trece: un „Anuntul e live"
              lipit permanent in antet e zgomot, nu informatie. */}
          {!cd.done && (
            <span className="admin-cd">
              <span className="countdown-dot" />
              {`Anunț în ${cd.zile}z ${cd.ore}h ${cd.minute}m ${cd.secunde}s`}
            </span>
          )}
          <button type="button" className="admin-logout" onClick={onLogout}>
            Ieși din cont
          </button>
        </div>
      </header>

      <main className="admin-main">
        <AdminEditionTabs
          editions={editions}
          selected={editie}
          onSelect={setEditie}
          onCreate={handleCreateEdition}
          creating={creatingEdition}
        />

        {arhiva && (
          <div className="admin-banner" role="status">
            <strong>Ediția {editie} e încheiată.</strong> O vezi ca arhivă: datele rămân
            întregi, dar nu se mai poate adăuga, edita sau șterge nimic. Exportul CSV
            funcționează. Ediția activă acum e {editieCurenta}.
          </div>
        )}

        {/* Panoul de orientare stă ÎNAINTEA tabelelor și a tab-urilor: prima
            întrebare cu care se deschide backoffice-ul e „unde suntem?", nu
            „cine s-a înscris". */}
        <AdminAcum
          semnale={{ nelivrate, asteptare: waitAll.length, ciornaNepublicata, metaInUrma, arhiva }}
          onTab={setTab}
        />

        {/* Tab-urile poartă un contor, ca să știi ce e în spatele lor fără să
            le deschizi. Contorul lipsește cât timp datele nu au sosit — un „0"
            afișat în timpul încărcării ar fi o minciună scurtă, dar tocmai pe
            aia o citește organizatorul când intră. */}
        <AdminNav tab={tab} onTab={setTab} contorTab={contorTab} nelivrate={nelivrate} />

        {tab === 'sabloane' && (
          <AdminTemplatesTab />
        )}

        {tab === 'email' && (
          <AdminEmailTab
            rows={all}
            waitlist={waitAll}
            editie={editie ?? CURRENT_EDITION}
            emailLog={emailLog ?? []}
            readOnly={arhiva}
          />
        )}

        {tab === 'livrare' && (
          <AdminDeliveryTab
            editie={editie ?? CURRENT_EDITION}
            log={emailLog}
            participanti={all}
            readOnly={arhiva}
            onRefresh={refresh}
          />
        )}

        {tab === 'eveniment' && (
          <AdminEventTab
          />
        )}

        {tab === 'coming-soon' && (
          <AdminComingSoonTab
          />
        )}

        {tab === 'lansare' && (
          <div className="admin-launch">
            <AdminLaunchTab />
          </div>
        )}

        {tab === 'participanti' && (
        <>
        {/* Capacitatea (TOTAL_SLOTS) e a ediției CURENTE — pe arhivă ar minți
            (ediția 1 a avut 30 de locuri, nu 20), deci acolo arătăm doar cifrele reale. */}
        <AdminCifre
          inscrisi={all.length}
          peAsteptare={waitAll.length}
          TOTAL_SLOTS={TOTAL_SLOTS}
          WAITLIST_SLOTS={WAITLIST_SLOTS}
          nelivrate={nelivrate}
          arhiva={arhiva}
        />

        <section className="admin-table-section">
          <div className="admin-table-head admin-participanti-head">
            <h2>Participanți · ediția {editie ?? CURRENT_EDITION}</h2>
            <div className="admin-table-actions">
              <input
                // `search`, nu `text`: aduce butonul nativ de golire și
                // tastatura potrivită pe mobil. Nici corectorul, nici
                // autocompletarea n-au ce căuta pe nume proprii și adrese.
                type="search"
                className="admin-search"
                placeholder="Caută nume, telefon, email…"
                aria-label="Caută în lista de participanți"
                autoComplete="off"
                spellCheck={false}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {/* Doar cât filtrul e activ: pe lista întreagă, numărul e deja în
                  cartonașul „Înscriși" de deasupra. */}
              {q && (
                <span className="admin-table-rezultate" role="status">
                  {filtered.length} din {all.length}
                </span>
              )}
              {!arhiva && (
                <button
                  type="button"
                  className="admin-btn-outline"
                  onClick={() => {
                    setAddOpen((v) => !v);
                    setEditId(null);
                    setDraft({ nume: '', telefon: '', email: '' });
                  }}
                >
                  + Adaugă
                </button>
              )}
              <button type="button" className="admin-btn-accent" onClick={exportCsv}>
                Export CSV
              </button>
            </div>
          </div>

          <AdminRandAdaugare
            deschis={addOpen}
            arhiva={arhiva}
            ciorna={draft}
            setCiorna={setDraft}
            editId={editId}
            saving={saving}
            onSalveaza={editId ? handleUpdate : handleAdd}
            onRenunta={() => {
              setAddOpen(false);
              setEditId(null);
            }}
          />
          <div className="admin-table-wrap">
            <div className={`admin-table admin-participanti${arhiva ? ' arhiva' : ''}`}>
              <div className="admin-row admin-row-head">
                <span>#</span>
                <span>Nume</span>
                <span>Telefon</span>
                <span>Email</span>
                <span>Înscris</span>
                <span>Ultimul email</span>
                {!arhiva && <span className="right">Acțiuni</span>}
              </div>
              {filtered.map((r, i) => {
                const celule = acoperirePerId.get(r.id) ?? {};
                const rezumat = rezumaAcoperire(celule);
                return (
                <div key={r.id} className="admin-row" style={{ '--i': i } as CSSProperties}>
                  <span className="admin-cell-nr">{String(i + 1).padStart(2, '0')}</span>
                  <span className="admin-cell-name">{r.nume}</span>
                  <a className="admin-cell-link" href={`tel:${r.telefon}`}>
                    {r.telefon}
                  </a>
                  <a className="admin-cell-link ellipsis" href={`mailto:${r.email}`}>
                    {r.email}
                  </a>
                  <span className="admin-cell-date">{ziSiLuna(r.created_at)}</span>
                  <span>
                    <button
                      type="button"
                      className={`admin-mail-badge ${rezumat.clasa}`}
                      title={`${rezumat.detaliu} — click pentru fișa de acoperire`}
                      onClick={() => setTab('livrare')}
                    >
                      {rezumat.eticheta}
                    </button>
                  </span>
                  {!arhiva && (
                    <div className="admin-cell-actions">
                      <button
                        type="button"
                        className="admin-btn-promote"
                        title="Editează înscrierea"
                        disabled={randuriOcupate.has(r.id)}
                        onClick={() => startEdit(r)}
                      >
                        Editează
                      </button>
                      <button
                        type="button"
                        className="admin-btn-delete"
                        title="Șterge înscrierea"
                        disabled={randuriOcupate.has(r.id)}
                        onClick={() => setConfirmRow(r)}
                      >
                        Șterge
                      </button>
                    </div>
                  )}
                </div>
                );
              })}
              {rows === null && !loadError && <AdminSkeleton cols={arhiva ? 6 : 7} />}
              {rows === null && loadError && (
                <div className="admin-empty">Nu am putut încărca lista. Reîncercăm automat.</div>
              )}
              {rows !== null && filtered.length === 0 && (
                <div className="admin-empty">Niciun participant găsit.</div>
              )}
            </div>
          </div>
        </section>

        <AdminAsteptare
          waitAll={waitAll}
          ocupate={randuriOcupate}
          waitlist={waitlist}
          TOTAL_SLOTS={TOTAL_SLOTS}
          arhiva={arhiva}
          onPromote={handlePromote}
          onDelete={handleDeleteWaitlist}
        />

        <AdminActivitate events={events} />
        </>
        )}
      </main>

      {confirmRow && (
        <div
          className="admin-confirm-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setConfirmRow(null);
          }}
        >
          <div className="admin-confirm" role="alertdialog" aria-modal="true">
            <h3>Ștergi înscrierea?</h3>
            <p>
              <strong>{confirmRow.nume}</strong> ({confirmRow.email}) va fi șters din listă.
              Poți anula imediat după, din notificarea de jos.
            </p>
            <div className="admin-confirm-actions">
              <button
                type="button"
                className="admin-confirm-delete"
                onClick={() => {
                  handleDelete(confirmRow);
                  setConfirmRow(null);
                }}
              >
                Da, șterge
              </button>
              <button type="button" className="admin-confirm-cancel" onClick={() => setConfirmRow(null)}>
                Anulează
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className={`admin-toast${toast.kind === 'error' ? ' error' : ''}`} role="status">
          <span className="dot" />
          <span>{toast.msg}</span>
          {toast.undo && (
            <button
              type="button"
              onClick={() => {
                toast.undo?.();
                if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
                setToast(null);
              }}
            >
              Anulează
            </button>
          )}
        </div>
      )}
    </FurnizorSesiuneAdmin>
  );
};
