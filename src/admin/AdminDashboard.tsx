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
import { emailuriNelivrate, acoperire, COMUNICARI_EDITIE } from './deliveryLog';
import type { StareCelula } from './deliveryLog';
import { useAdminPolling } from './useAdminPolling';
import {
  isDuplicateError,
  isTimeoutError,
  isNetworkOrCspError,
  sendConfirmationEmail,
} from '../lib/supabase';
import { EMAIL_RE, PHONE_RE, normalizePhone } from '../lib/validation';
import { useCountdown } from '../hooks/useCountdown';
import { useNow } from '../hooks/useNow';
import { useEventConfig, useEditionDates } from '../hooks/useEventConfig';
import { AdminSkeleton, AdminFeedSkeleton } from './AdminSkeleton';
import { AdminAcum } from './AdminAcum';
import { fazaSite, ETICHETA_FAZA, type TabAdmin } from './stareCurenta';
import { fetchBuildInfo, campuriVechiInBuild, type BuildInfo } from './buildFingerprint';
import { parseEventConfig } from '../content/eventConfig';

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

const dateFmt = new Intl.DateTimeFormat('ro-RO', { day: 'numeric', month: 'short' });
const formatDate = (iso: string): string => dateFmt.format(new Date(iso)).replace('.', '');

const eventFmt = new Intl.DateTimeFormat('ro-RO', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Chisinau',
});
const formatEventTime = (iso: string): string => eventFmt.format(new Date(iso));

/**
 * Insigna din tabelul de participanți — cea mai PROASTĂ stare dintre comunicările
 * datorate, nu cea mai recentă trimitere. Un eșec rămâne vizibil chiar dacă altă
 * comunicare a plecat cu bine după el.
 */
const rezumaAcoperire = (
  celule: Record<string, StareCelula>
): { clasa: string; eticheta: string; detaliu: string } => {
  const stari = COMUNICARI_EDITIE.map((c) => ({ com: c, stare: celule[c.cheie] ?? 'lipsa' }));
  const detaliu = stari.map(({ com, stare }) => `${com.eticheta}: ${STARE_TEXT[stare]}`).join(' · ');
  const esuate = stari.filter((s) => s.stare === 'esuat');
  if (esuate.length) {
    return {
      clasa: 'esuat',
      eticheta: `✕ ${esuate.map((s) => s.com.eticheta.toLowerCase()).join(', ')}`,
      detaliu,
    };
  }
  const lipsa = stari.filter((s) => s.stare === 'lipsa');
  if (lipsa.length === stari.length) return { clasa: 'niciunul', eticheta: '— niciunul', detaliu };
  if (lipsa.length) {
    return {
      clasa: 'partial',
      eticheta: `${stari.length - lipsa.length}/${stari.length}`,
      detaliu,
    };
  }
  return { clasa: 'trimis', eticheta: '✓ complet', detaliu };
};

/**
 * De ce n-a mers reversarea. Ambele cauze sunt reale și au apărut exact în
 * fereastra dintre ștergere și undo: locul poate fi luat de auto-promovare, iar
 * adresa poate fi re-înscrisă. Înainte, undo-ul trecea peste amândouă în tăcere.
 */
const motivUndoEsuat = (err: unknown, nume: string): string => {
  // `SubmitHttpError.message` poartă corpul răspunsului, deci și numele excepției
  // ridicate de RPC (`event_full`, `duplicate_email`).
  const text = err instanceof Error ? err.message : String(err);
  if (text.includes('event_full')) {
    return `Locul lui ${nume} a fost ocupat între timp — ediția e plină. Șterge pe altcineva sau adaugă-l manual peste capacitate.`;
  }
  if (text.includes('duplicate_email')) {
    return `Adresa lui ${nume} a fost re-înscrisă între timp, deci nu se mai poate readuce rândul vechi.`;
  }
  if (isTimeoutError(err)) return 'Serverul răspunde greu. Verifică lista și încearcă din nou.';
  if (isNetworkOrCspError(err)) return 'Conexiune blocată sau indisponibilă. Reîncearcă.';
  return 'Nu am putut anula ștergerea.';
};

const STARE_TEXT: Record<StareCelula, string> = {
  trimis: 'trimis',
  esuat: 'eșuat',
  lipsa: 'lipsă',
};

/**
 * Ce intră în „Activitate recentă".
 *
 * `admin_events` e un jurnal de audit și primește și tipuri pe care feed-ul nu
 * le arată (`admin_delete`, `config_publish` — lucruri făcute chiar de cel care
 * se uită la feed). Aici rămân doar cele întâmplate FĂRĂ el: cineva a renunțat,
 * cineva a fost promovat automat, s-a deschis o ediție.
 */
const TIPURI_ACTIVITATE = ['renuntare', 'auto_promote', 'editie_noua'];

const activitateVizibila = (e: AdminEvent): boolean => TIPURI_ACTIVITATE.includes(e.tip);

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
  const remaining = Math.max(0, TOTAL_SLOTS - all.length);
  const percent = Math.round((all.length / TOTAL_SLOTS) * 100);
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

  // Promovează o persoană din așteptare în participanți + email de confirmare.
  const handlePromote = (row: AdminWaitlistEntry) => {
    const before = waitlistRef.current ?? [];
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
      });
  };

  const handleDeleteWaitlist = (row: AdminWaitlistEntry) => {
    const before = waitlistRef.current ?? [];
    setWaitlist(before.filter((w) => w.id !== row.id));
    deleteWaitlist(token, row.id)
      .then(() => showToast({ kind: 'error', msg: `${row.nume} a fost șters din așteptare.` }))
      .catch((err) => {
        if (handleAuthError(err)) return;
        setWaitlist(before);
        showToast({ kind: 'error', msg: 'Ștergerea nu a mers. Încearcă din nou.' });
      });
  };

  // Ștergerea efectivă — rulează doar după confirmarea din dialog.
  const handleDelete = (row: AdminRegistration) => {
    const before = rowsRef.current ?? [];
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
      });
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
    <>
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
          <AdminTemplatesTab token={token} onAuthError={handleAuthError} />
        )}

        {tab === 'email' && (
          <AdminEmailTab
            token={token}
            rows={all}
            waitlist={waitAll}
            editie={editie ?? CURRENT_EDITION}
            emailLog={emailLog ?? []}
            readOnly={arhiva}
            formatDate={formatDate}
            showToast={showToast}
          />
        )}

        {tab === 'livrare' && (
          <AdminDeliveryTab
            token={token}
            editie={editie ?? CURRENT_EDITION}
            log={emailLog}
            participanti={all}
            readOnly={arhiva}
            onRefresh={refresh}
            showToast={showToast}
          />
        )}

        {tab === 'eveniment' && (
          <AdminEventTab
            token={token}
            onAuthError={handleAuthError}
            showToast={showToast}
          />
        )}

        {tab === 'coming-soon' && (
          <AdminComingSoonTab
            token={token}
            onAuthError={handleAuthError}
            showToast={showToast}
          />
        )}

        {tab === 'lansare' && (
          <div className="admin-launch">
            <AdminLaunchTab token={token} formatDate={formatDate} onAuthError={handleAuthError} />
          </div>
        )}

        {tab === 'participanti' && (
        <>
        {/* Capacitatea (TOTAL_SLOTS) e a ediției CURENTE — pe arhivă ar minți
            (ediția 1 a avut 30 de locuri, nu 20), deci acolo arătăm doar cifrele reale. */}
        <section className="admin-stats">
          <div className="admin-stat">
            <span className="admin-stat-label">Înscriși</span>
            <span className="admin-stat-value" key={all.length}>
              {all.length}
              {!arhiva && <span className="admin-stat-total"> / {TOTAL_SLOTS}</span>}
            </span>
          </div>
          {!arhiva && (
            <>
              <div className="admin-stat">
                <span className="admin-stat-label">Locuri rămase</span>
                <span className={`admin-stat-value${remaining <= 3 ? ' low' : ''}`} key={remaining}>
                  {remaining}
                </span>
              </div>
              <div className="admin-stat">
                <span className="admin-stat-label">Grad de ocupare</span>
                <span className="admin-stat-value accent" key={percent}>
                  {percent}%
                </span>
              </div>
            </>
          )}
          <div className="admin-stat">
            <span className="admin-stat-label">În așteptare</span>
            <span className="admin-stat-value" key={waitAll.length}>
              {waitAll.length}
              {!arhiva && <span className="admin-stat-total"> / {WAITLIST_SLOTS}</span>}
            </span>
          </div>
          <div className="admin-stat">
            <span className="admin-stat-label">Emailuri nelivrate</span>
            <span className={`admin-stat-value${nelivrate > 0 ? ' low' : ''}`} key={nelivrate}>
              {nelivrate}
            </span>
          </div>
        </section>

        {!arhiva && (
          <section className="admin-occupancy">
            <div className="slots-head">
              <span className="slots-label">Ocupare locuri</span>
              <span className="admin-occupancy-count">
                {all.length} din {TOTAL_SLOTS} locuri ocupate
              </span>
            </div>
            <div className="slots-grid">
              {Array.from({ length: TOTAL_SLOTS }, (_, i) => (
                <div key={i} className={`slot admin-slot${i < all.length ? ' filled' : ''}`} />
              ))}
            </div>
          </section>
        )}

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

          {addOpen && !arhiva && (
            <div className="admin-add-row">
              <label className="admin-add-field grow">
                <span>Nume</span>
                <input
                  type="text"
                  placeholder="Ana Popescu"
                  value={draft.nume}
                  onChange={(e) => setDraft((d) => ({ ...d, nume: e.target.value }))}
                />
              </label>
              <label className="admin-add-field">
                <span>Telefon</span>
                <input
                  type="tel"
                  placeholder="069 xxx xxx"
                  value={draft.telefon}
                  onChange={(e) => setDraft((d) => ({ ...d, telefon: e.target.value }))}
                />
              </label>
              <label className="admin-add-field grow">
                <span>Email</span>
                <input
                  type="email"
                  placeholder="ana@email.md"
                  value={draft.email}
                  onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))}
                />
              </label>
              <button
                type="button"
                className="admin-btn-accent"
                onClick={editId ? handleUpdate : handleAdd}
                disabled={saving}
              >
                {saving ? 'Se salvează…' : editId ? 'Salvează modificările' : 'Salvează'}
              </button>
              <button
                type="button"
                className="admin-add-cancel"
                onClick={() => {
                  setAddOpen(false);
                  setEditId(null);
                }}
              >
                Anulează
              </button>
            </div>
          )}

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
                  <span className="admin-cell-date">{formatDate(r.created_at)}</span>
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
                        onClick={() => startEdit(r)}
                      >
                        Editează
                      </button>
                      <button
                        type="button"
                        className="admin-btn-delete"
                        title="Șterge înscrierea"
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

        <section className="admin-table-section">
          <div className="admin-table-head admin-wait-head">
            <h2>
              Lista de așteptare <span className="admin-wait-count">{waitAll.length}</span>
            </h2>
            <span className="admin-wait-note">
              Se completează automat când locurile sunt pline — promovează când se eliberează un loc.
            </span>
          </div>
          <div className="admin-table-wrap">
            <div className={`admin-table admin-wait${arhiva ? ' arhiva' : ''}`}>
              <div className="admin-row admin-row-head">
                <span>#</span>
                <span>Nume</span>
                <span>Telefon</span>
                <span>Email</span>
                <span>Înscris</span>
                {!arhiva && <span className="right">Acțiuni</span>}
              </div>
              {waitAll.map((w, i) => (
                <div key={w.id} className="admin-row" style={{ '--i': i } as CSSProperties}>
                  <span className="admin-cell-nr">{String(i + 1).padStart(2, '0')}</span>
                  <span className="admin-cell-name">{w.nume}</span>
                  <a className="admin-cell-link" href={`tel:${w.telefon}`}>
                    {w.telefon}
                  </a>
                  <a className="admin-cell-link ellipsis" href={`mailto:${w.email}`}>
                    {w.email}
                  </a>
                  <span className="admin-cell-date">{formatDate(w.created_at)}</span>
                  {!arhiva && (
                    <div className="admin-cell-actions">
                      <button
                        type="button"
                        className="admin-btn-promote"
                        title="Mută la participanți"
                        onClick={() => handlePromote(w)}
                      >
                        Promovează
                      </button>
                      <button
                        type="button"
                        className="admin-btn-delete"
                        title="Șterge din lista de așteptare"
                        onClick={() => handleDeleteWaitlist(w)}
                      >
                        Șterge
                      </button>
                    </div>
                  )}
                </div>
              ))}
              {waitlist === null && <AdminSkeleton cols={arhiva ? 5 : 6} rows={3} />}
              {waitlist !== null && waitAll.length === 0 && (
                <div className="admin-empty">
                  Nicio persoană în așteptare. Lista se completează automat când toate cele{' '}
                  {TOTAL_SLOTS} locuri sunt ocupate.
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="admin-table-section">
          <div className="admin-table-head admin-wait-head">
            <h2>
              Activitate recentă{' '}
              <span className="admin-wait-count">{(events ?? []).length}</span>
            </h2>
            <span className="admin-wait-note">
              Renunțări din linkul de email, promovări automate din lista de așteptare (când se
              eliberează un loc, se umple singur) și deschiderea edițiilor noi. Feed-ul e comun
              tuturor edițiilor.
            </span>
          </div>
          <div className="admin-activity">
            {(events ?? [])
              .filter(activitateVizibila)
              .map((e) => {
                if (e.tip === 'editie_noua') {
                  const ed = e.detaliu?.editie;
                  return (
                    <div key={e.id} className="admin-activity-item">
                      <span className="admin-activity-dot" />
                      <span className="admin-activity-text">
                        S-a deschis <strong>ediția {typeof ed === 'number' ? ed : '?'}</strong> —
                        înscrierile noi intră aici
                      </span>
                      <span className="admin-activity-time">{formatEventTime(e.created_at)}</span>
                    </div>
                  );
                }
                const nume = typeof e.detaliu?.nume === 'string' ? e.detaliu.nume : 'Cineva';
                const email = typeof e.detaliu?.email === 'string' ? e.detaliu.email : '';
                const emailed = e.detaliu?.email_queued === true;

                // Renunțarea vine mereu însoțită, în aceeași secundă, de un
                // `auto_promote` — dacă era cineva pe listă. Nu le comasăm:
                // sunt două fapte, iar cel de-al doilea poate să LIPSEASCĂ
                // (listă goală), caz în care locul rămâne liber și trebuie văzut.
                if (e.tip === 'renuntare') {
                  return (
                    <div key={e.id} className="admin-activity-item">
                      <span className="admin-activity-dot" />
                      <span className="admin-activity-text">
                        <strong>{nume}</strong> a renunțat la loc, din linkul din email
                        {email && <span className="admin-activity-email"> · {email}</span>}
                      </span>
                      <span className="admin-activity-time">{formatEventTime(e.created_at)}</span>
                    </div>
                  );
                }

                return (
                  <div key={e.id} className="admin-activity-item">
                    <span className="admin-activity-dot" />
                    <span className="admin-activity-text">
                      <strong>{nume}</strong> promovat automat din așteptare
                      {email && <span className="admin-activity-email"> · {email}</span>}
                    </span>
                    <span
                      className={`admin-activity-mail${emailed ? ' ok' : ''}`}
                      title={emailed ? 'Email de confirmare trimis' : 'Emailul nu a plecat'}
                    >
                      {emailed ? '✉ trimis' : '✉ eșuat'}
                    </span>
                    <span className="admin-activity-time">{formatEventTime(e.created_at)}</span>
                  </div>
                );
              })}
            {events === null && <AdminFeedSkeleton />}
            {events !== null && (events ?? []).filter(activitateVizibila).length === 0 && (
              <div className="admin-empty">Nicio activitate încă.</div>
            )}
          </div>
        </section>
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
    </>
  );
};
