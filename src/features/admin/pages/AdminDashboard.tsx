import shared1 from '../zones/evenimente/EvenimenteStyles.module.css';
import styles from './AdminDashboard.module.css';
import { useQueryClient } from '@tanstack/react-query';
import { useAdminResource } from '../data/useAdminResource';
import { useAdminMutation } from '../data/useAdminMutation';
import { useSesiuneAdmin } from '../data/adminSession';
import { useDashboardData } from '../zones/evenimente/useDashboardData';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { toCsv, durataCsv } from '../../../lib/csv';
import { addRegistration, updateRegistration, deleteRegistration, undeleteRegistration, deleteWaitlist, undeleteWaitlist, promoteWaitlist, listEditions, createEdition, listEventConfig, setPrezenta, refuzPrezenta, InvalidTokenError } from '../zones/evenimente/api';
import type { AdminRegistration, AdminWaitlistEntry, Prezenta } from '../zones/evenimente/api';
import { AdminEmailTab } from '../zones/evenimente/AdminEmailTab';
import { AdminLaunchTab } from '../zones/evenimente/AdminLaunchTab';
import { AdminEventTab } from '../zones/evenimente/AdminEventTab';
import { AdminComingSoonTab } from '../zones/site/AdminComingSoonTab';
import { AdminClipuriTab } from '../zones/site/AdminClipuriTab';
import { EcranAcum } from '../zones/acum/EcranAcum';
import { FurnizorSala } from '../data/useSala';
import { useEcranCurent } from '../navigatie/useEcranCurent';

import { ECRAN_IMPLICIT } from '../navigatie/adminNavigatie';
import { estePeEditie } from '../navigatie/adminNavigatie';
import { LiniaDeTimp } from '../components/LiniaDeTimp';
import { FurnizorSesiuneAdmin } from '../data/adminSession';
import { AdminAntrenamentTab } from '../../../admin/AdminAntrenamentTab';
import { EcranPrezente } from '../../../admin/sala/EcranPrezente';
import { EcranMembri } from '../../../admin/sala/EcranMembri';
import { EcranAnaliza } from '../../../admin/sala/EcranAnaliza';
import { EcranGhidBot } from '../../../admin/sala/EcranGhidBot';
import { EcranProbe } from '../../../admin/sala/EcranProbe';
import { EcranBot } from '../../../admin/sala/EcranBot';
import { CadruCuSemnale } from '../components/CadruCuSemnale';
import { AdminTemplatesTab } from '../zones/evenimente/AdminTemplatesTab';
import { AdminEditionTabs } from '../zones/evenimente/AdminEditionTabs';
import { AdminDeliveryTab } from '../zones/evenimente/AdminDeliveryTab';
import { emailuriNelivrate, acoperire } from '../zones/evenimente/deliveryLog';
import type { StareCelula } from '../zones/evenimente/deliveryLog';
import { isDuplicateError, sendConfirmationEmail } from '../../inscriere';
import { EMAIL_RE, PHONE_RE, normalizePhone } from '../../../shared/lib/validation';
import { useCountdown } from '../../../shared/lib/useCountdown';
import { useNow } from '../../../shared/lib/useNow';
import { useEventConfig, useEditionDates } from '../../../shared/lib/useEventConfig';
import { AdminSkeleton } from '../zones/evenimente/AdminSkeleton';
import { AdminActivitate } from '../zones/evenimente/AdminActivitate';
import { AdminAsteptare } from '../zones/evenimente/AdminAsteptare';
import { AdminCifre } from '../zones/evenimente/AdminCifre';
import { AdminRandAdaugare } from '../zones/evenimente/AdminRandAdaugare';
import { DialogPrezenta } from '../zones/evenimente/DialogPrezenta';
import { fazaSite, type EcranAdmin } from '../data/stareCurenta';
import { fetchBuildInfo, campuriVechiInBuild } from '../zones/evenimente/buildFingerprint';
import { parseEventConfig } from '../../../shared/content/eventConfig';
import { ziSiLuna } from '../../../shared/lib/formatare';
import { Toast, useToast } from '../../../admin/controale/Toast';
import { rezumaAcoperire, motivUndoEsuat } from '../zones/evenimente/dashboardRezumate';
import { Dialog } from '../../../shared/ui/Dialog';

type Props = {
  token: string;
  onLogout: () => void;
};

export const AdminDashboard = ({ token, onLogout }: Props) => {
  const { toast, arata: showToast, inchide: inchideToast } = useToast();
  const handleAuthError = useCallback((err: unknown): boolean => {
    if (err instanceof InvalidTokenError) { onLogout(); return true; }
    return false;
  }, [onLogout]);
  return <FurnizorSesiuneAdmin token={token} onAuthError={handleAuthError} showToast={showToast}>
    <ContinutDashboard onLogout={onLogout} />
    <Toast toast={toast} onInchide={inchideToast} />
  </FurnizorSesiuneAdmin>;
};

const ContinutDashboard = ({ onLogout }: Omit<Props, 'token'>) => {
  const { token, onAuthError: handleAuthError, showToast } = useSesiuneAdmin();
  const client = useQueryClient();
  const addRegistrationMutation = useAdminMutation(addRegistration);
  const updateRegistrationMutation = useAdminMutation(updateRegistration);
  const deleteRegistrationMutation = useAdminMutation(deleteRegistration);
  const undeleteRegistrationMutation = useAdminMutation(undeleteRegistration);
  const deleteWaitlistMutation = useAdminMutation(deleteWaitlist);
  const undeleteWaitlistMutation = useAdminMutation(undeleteWaitlist);
  const promoteWaitlistMutation = useAdminMutation(promoteWaitlist);
  const createEditionMutation = useAdminMutation(createEdition);
  const setPrezentaMutation = useAdminMutation(setPrezenta);

  // Ediția deschisă în backoffice. null = încă nu știm ce ediții există.
  const [editie, setEditie] = useState<number | null>(null);
  const [creatingEdition, setCreatingEdition] = useState(false);
  const [query, setQuery] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [draft, setDraft] = useState({ nume: '', telefon: '', email: '' });
  const [saving, setSaving] = useState(false);
  const [confirmRow, setConfirmRow] = useState<AdminRegistration | null>(null);
  const [prezentaRow, setPrezentaRow] = useState<AdminRegistration | null>(null);
  // Ecranul curent, garda de ieșire și fragmentul din adresă trăiesc împreună
  // în `useEcranCurent`: se navighează din trei locuri (registrul de ecrane,
  // acțiunile liniei de timp, semnalele de atenție), iar o gardă pusă pe unul
  // singur ar fi o gardă cu trei sferturi de gaură.
  const { ecran: tab, schimba: schimbaTab, inregistreazaGardaIesire } =
    useEcranCurent(ECRAN_IMPLICIT);
  // Cerere venită de pe linia de timp: deschide tabul „Evenimentul" cu dialogul
  // de ediție nouă pe ecran. Se stinge imediat ce tabul a onorat-o.
  const [deschideDialogEditie, setDeschideDialogEditie] = useState(false);
  // Ediția și capacitatea vin din configul PUBLICAT, nu din bundle: după ce
  // publicarea nu mai cere deploy, un backoffice deschis dintr-un build vechi ar
  // filtra ediția greșită — și nu mai există banner care să explice de ce.
  const config = useEventConfig();
  const CURRENT_EDITION = config.number;
  const { date: editions } = useAdminResource(
    useCallback((t: string, signal: AbortSignal) => listEditions(t, signal), []),
    null, { queryKey: ['evenimente', 'editions', CURRENT_EDITION] }
  );
  useEffect(() => {
    if (editions) setEditie((prev) => prev ?? editions.find((e) => e.este_curenta)?.editie ?? null);
  }, [editions]);
  const refreshEditions = () => void client.invalidateQueries({ queryKey: ['admin-resource', token, 'evenimente', 'editions'] });
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
  // de scriere (`edition_archived` — vezi supabase/sql/supabase-migration-editii-si-email-log.sql).
  const editieCurenta = editions?.find((e) => e.este_curenta)?.editie ?? null;
  // Selecția arhivei aparține numai ecranelor de ediție. Acum și celelalte
  // zone citesc ediția publicată, folosind același ciclu de încărcare.
  const editieDate = estePeEditie(tab) ? editie : (editions === null ? null : CURRENT_EDITION);
  const { rows, waitlist, emailLog, events, loadError, setRows, setWaitlist, refresh, semnaleEditieCurenta } = useDashboardData(editieDate, CURRENT_EDITION, tab);
  const arhiva = editieDate !== null && editieCurenta !== null && editieDate !== editieCurenta;

  /**
   * Semnalele pentru panoul „Acum" care nu vin din ciclul de participanți:
   * există o ciornă nepublicată, și a rămas share preview-ul în urmă.
   *
   * O dată la montare, nu la fiecare poll: amândouă se schimbă doar când
   * organizatorul acționează în tabul „Eveniment", iar acolo se reîncarcă
   * oricum. Un poll pe ele ar fi două cereri în plus la fiecare ciclu, pentru
   * o informație care stă pe loc ore întregi.
   */
  const { date: signalsConfig } = useAdminResource(useCallback((t: string, signal: AbortSignal) => listEventConfig(t, undefined, signal), []), null);
  const { date: buildInfo } = useAdminResource(useCallback((_token: string, signal: AbortSignal) => fetchBuildInfo(signal), []), null);
  const ciornaNepublicata = signalsConfig?.some((r) => r.status === 'draft') ?? false;
  const publicat = signalsConfig?.find((r) => r.status === 'published');
  const configPublicat = publicat ? parseEventConfig(publicat.config) : null;
  const metaInUrma = buildInfo !== null && configPublicat !== null
    && campuriVechiInBuild(buildInfo, configPublicat).length > 0;

  // Schimbarea ediției înseamnă alt set de date — golim ca să nu se vadă o clipă
  // lista ediției anterioare sub numărul nou.
  const [editieDatePrecedenta, setEditieDatePrecedenta] = useState(editieDate);
  if (editieDatePrecedenta !== editieDate) {
    // Ajustarea înaintea randării copiilor evită afișarea pentru un cadru a
    // cifrelor vechi sub titlul ediției noi (inclusiv la Back/Forward).
    setEditieDatePrecedenta(editieDate);
    setQuery('');
    setAddOpen(false);
    setEditId(null);
    // Altfel dialogul de confirmare rămâne deschis peste ediția nouă și
    // „Da, șterge" ar lovi un rând care nu mai e în lista vizibilă.
    setConfirmRow(null);
    setPrezentaRow(null);
  }

  const deschideDinAcum = (ecran: EcranAdmin) => {
    if (estePeEditie(ecran)) setEditie(CURRENT_EDITION);
    schimbaTab(ecran);
  };

  const all = useMemo(() => rows ?? [], [rows]);
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
  const contorEcran: Record<EcranAdmin, number | null> = {
    acum: null,
    desfasurare: null,
    participanti: rows === null ? null : all.length,
    email: null,
    livrare: null,
    lansare: null,
    eveniment: null,
    clipuri: null,
    antrenament: null,
    'coming-soon': null,
    sabloane: null,
    'grup-prezente': null,
    'grup-membri': null,
    'grup-probe': null,
    'grup-analiza': null,
    'grup-bot': null,
    'grup-ghid': null,
  };

  /**
   * Calea scurtă de creare, chemată de pe ultimul nod al liniei de timp.
   *
   * Deschide tabul „Evenimentul" CU dialogul de trei câmpuri deja pe ecran.
   * Ideal ar fi fost dialogul chiar peste linie, dar ciorna pe care o produce
   * e ținută în starea locală a tabului, iar mutarea ei în dashboard e un
   * refactor al unui fișier de o mie de linii — disproporționat față de ce
   * câștigă. Organizatorul tot nu mai caută unde stă calea scurtă, ceea ce era
   * problema.
   */
  const porneșteEditiaUrmatoare = () => {
    setDeschideDialogEditie(true);
    schimbaTab('eveniment');
  };

  const handleCreateEdition = () => {
    if (creatingEdition) return;
    setCreatingEdition(true);
    createEditionMutation(token)
      .then((nou) => {
        setEditie(nou);
        refreshEditions();
        showToast({
          kind: 'success',
          msg: `Ediția ${nou} e deschisă. Datele ei le pui din Setup → Evenimentul.`,
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
    const before = waitlist ?? [];
    ocupa(row.id);
    setWaitlist(before.filter((w) => w.id !== row.id));
    promoteWaitlistMutation(token, row.id)
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
    const before = waitlist ?? [];
    ocupa(row.id);
    setWaitlist(before.filter((w) => w.id !== row.id));
    deleteWaitlistMutation(token, row.id)
      .then(() => {
        showToast({
          kind: 'error',
          msg: `${row.nume} a fost șters din așteptare.`,
          // Paritate cu ștergerea unei înscrieri, o funcție mai jos. Reversare,
          // nu reinserare: același rând, deci același `created_at` și aceeași
          // poziție în ordinea FIFO de promovare.
          undo: () => {
            undeleteWaitlistMutation(token, row.id)
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
    const before = rows ?? [];
    ocupa(row.id);
    setRows(before.filter((r) => r.id !== row.id));
    deleteRegistrationMutation(token, row.id)
      .then(() => {
        showToast({
          kind: 'error',
          msg: `${row.nume} a fost șters.`,
          // Reversare, nu reinserare: același rând, deci același `created_at` și
          // aceeași poziție în ordinea de promovare. Înainte, undo apela
          // `addRegistration`, care sărea peste garda de capacitate și dădea
          // rândului recreat un `created_at` nou.
          undo: () => {
            undeleteRegistrationMutation(token, row.id)
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
    addRegistrationMutation(token, { nume, telefon, email })
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

  /** Motivele refuzului, traduse. Fiecare cere altceva de la operator. */
  const MESAJ_PREZENTA: Record<NonNullable<ReturnType<typeof refuzPrezenta>>, string> = {
    numar_duplicat: 'Numărul e deja dat altcuiva din ediția asta.',
    numar_invalid: 'Numărul de concurs e un întreg pozitiv.',
    timp_invalid: 'Timpul nu a fost înțeles. Scrie-l ca 32:15 sau 1:02:15.',
    not_found: 'Înscrierea nu mai există — poate a fost ștearsă între timp.',
  };

  const handlePrezenta = (row: AdminRegistration, date: Prezenta) => {
    if (randuriOcupate.has(row.id)) return;
    ocupa(row.id);
    setPrezentaMutation(token, row.id, date)
      .then(() => {
        setPrezentaRow(null);
        refresh();
        showToast({ kind: 'success', msg: `Prezența pentru ${row.nume} a fost salvată.` });
      })
      .catch((err) => {
        if (handleAuthError(err)) return;
        const motiv = refuzPrezenta(err);
        showToast({
          kind: 'error',
          msg: motiv ? MESAJ_PREZENTA[motiv] : 'Nu am putut salva. Încearcă din nou.',
        });
      })
      .finally(() => elibereaza(row.id));
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
    updateRegistrationMutation(token, editId, { nume, telefon, email })
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
    // Coloanele de prezență vin la coadă, ca ordinea existentă să nu se mute
    // sub formulele cuiva care deja lucrează cu exportul.
    const header = [
      'Nr',
      'Nume',
      'Telefon',
      'Email',
      'Data înscrierii',
      'Prezent',
      'Număr',
      'Timp final',
    ];
    const lines = all.map((r, i) => [
      String(i + 1),
      r.nume,
      r.telefon,
      r.email,
      new Date(r.created_at).toLocaleString('ro-RO'),
      // Necompletat rămâne CELULĂ GOALĂ, nu „false" și nu „nu": „încă nu se
      // știe" și „n-a venit" sunt lucruri diferite, iar exportul e adesea
      // singurul loc unde cineva le compară.
      r.prezent === true ? 'da' : r.prezent === false ? 'nu' : '',
      r.numar == null ? '' : String(r.numar),
      durataCsv(r.timp_final),
    ]);
    const csv = toCsv([header, ...lines]);
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `run-lift-participanti-editia-${editie ?? CURRENT_EDITION}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  /** Semnalele ediției deschise, pentru linia de timp. */
  const semnale = {
    nelivrate,
    asteptare: waitAll.length,
    ciornaNepublicata,
    metaInUrma,
    arhiva,
  };
  /**
   * Semnalele pentru Acum și pentru numărul de pe zona Acum (R6, R9): mereu ale
   * ediției curente, chiar când în Evenimente e deschisă o arhivă.
   */
  const semnaleAcum = { ...semnale, ...semnaleEditieCurenta, arhiva: false };

  return (
    <>
      <FurnizorSala>
      <CadruCuSemnale
        semnale={semnaleAcum}
        ecran={tab}
        onEcran={schimbaTab}
        faza={fazaAcum}
        countdown={
          cd.done ? null : `Anunț în ${cd.zile}z ${cd.ore}h ${cd.minute}m ${cd.secunde}s`
        }
        contorEcran={contorEcran}
        onLogout={onLogout}
        selectorEditie={
          /* Selectorul de ediție apare DOAR pe ecranele care filtrează pe
             ediție (R4). Pe antrenamente sau pe site n-ar filtra nimic, iar un
             control care nu face nimic pe ecranul pe care stă minte. */
          estePeEditie(tab) ? (
            <AdminEditionTabs
              editions={editions}
              selected={editie}
              onSelect={setEditie}
              onCreate={handleCreateEdition}
              creating={creatingEdition}
            />
          ) : undefined
        }
      >
        {arhiva && estePeEditie(tab) && (
          <div className="admin-banner" data-css="admin-banner" role="status">
            <strong>Ediția {editie} e încheiată.</strong> O vezi ca arhivă: datele rămân
            întregi, dar nu se mai poate adăuga, edita sau șterge nimic. Exportul CSV
            funcționează. Ediția activă acum e {editieCurenta}.
          </div>
        )}

        {tab === 'acum' && (
          <EcranAcum
            semnale={semnaleAcum}
            faza={fazaAcum}
            config={config}
            inscrisi={rows === null ? null : all.length}
            asteptare={waitlist === null ? null : waitAll.length}
            onEcran={deschideDinAcum}
            onEditieNoua={porneșteEditiaUrmatoare}
          />
        )}

        {tab === 'desfasurare' && (
          <LiniaDeTimp
            semnale={semnale}
            onTab={schimbaTab}
            onEditieNoua={porneșteEditiaUrmatoare}
            arhiva={arhiva}
          />
        )}

        {tab === 'antrenament' && <AdminAntrenamentTab />}

        {/* Grupul din parc. Ecranele își iau singure datele (un singur bloc,
            vezi `sala/useSala.ts`): nu țin de ediția deschisă și n-au de ce să
            încarce odată cu participanții. */}
        {tab === 'grup-prezente' && <EcranPrezente />}
        {tab === 'grup-probe' && <EcranProbe />}
        {tab === 'grup-membri' && <EcranMembri />}
        {tab === 'grup-analiza' && <EcranAnaliza />}
        {tab === 'grup-ghid' && <EcranGhidBot onEcran={schimbaTab} />}
        {tab === 'grup-bot' && <EcranBot inregistreazaGardaIesire={inregistreazaGardaIesire} />}

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
            inregistreazaGardaIesire={inregistreazaGardaIesire}
            deschideDialogNou={deschideDialogEditie}
            onDialogNouDeschis={() => setDeschideDialogEditie(false)}
          />
        )}

        {tab === 'clipuri' && (
          <AdminClipuriTab inregistreazaGardaIesire={inregistreazaGardaIesire} />
        )}

        {tab === 'coming-soon' && (
          <AdminComingSoonTab
          />
        )}

        {tab === 'lansare' && (
          <div className={styles['admin-launch']} data-css="admin-launch">
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

        <section className="admin-table-section" data-css="admin-table-section">
          <div className={'admin-table-head ' + styles['admin-participanti-head']} data-css="admin-table-head admin-participanti-head">
            <h2>Participanți · ediția {editie ?? CURRENT_EDITION}</h2>
            <div className="admin-table-actions" data-css="admin-table-actions">
              <input
                // `search`, nu `text`: aduce butonul nativ de golire și
                // tastatura potrivită pe mobil. Nici corectorul, nici
                // autocompletarea n-au ce căuta pe nume proprii și adrese.
                type="search"
                className={shared1['admin-search']} data-css="admin-search"
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
                <span className={styles['admin-table-rezultate']} data-css="admin-table-rezultate" role="status">
                  {filtered.length} din {all.length}
                </span>
              )}
              {!arhiva && (
                <button
                  type="button"
                  className={shared1['admin-btn-outline']} data-css="admin-btn-outline"
                  onClick={() => {
                    setAddOpen((v) => !v);
                    setEditId(null);
                    setDraft({ nume: '', telefon: '', email: '' });
                  }}
                >
                  + Adaugă
                </button>
              )}
              <button type="button" className="admin-btn-accent" data-css="admin-btn-accent" onClick={exportCsv}>
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
          <div className="admin-table-wrap" data-css="admin-table-wrap">
            <div className={`admin-table ${styles['admin-participanti']}${arhiva ? ' arhiva' : ''}`} data-css={`admin-table admin-participanti${arhiva ? ' arhiva' : ''}`}>
              <div className={'admin-row ' + shared1['admin-row-head']} data-css="admin-row admin-row-head">
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
                <div key={r.id} className="admin-row" data-css="admin-row" style={{ '--i': i } as CSSProperties}>
                  <span className={shared1['admin-cell-nr']} data-css="admin-cell-nr">{String(i + 1).padStart(2, '0')}</span>
                  <span className="admin-cell-name" data-css="admin-cell-name">{r.nume}</span>
                  <a className={shared1['admin-cell-link']} data-css="admin-cell-link" href={`tel:${r.telefon}`}>
                    {r.telefon}
                  </a>
                  <a className={shared1['admin-cell-link'] + ' ellipsis'} data-css="admin-cell-link ellipsis" href={`mailto:${r.email}`}>
                    {r.email}
                  </a>
                  <span className="admin-cell-date" data-css="admin-cell-date">{ziSiLuna(r.created_at)}</span>
                  <span>
                    <button
                      type="button"
                      className={`${shared1['admin-mail-badge']} ${rezumat.clasa}`} data-css={`admin-mail-badge ${rezumat.clasa}`}
                      title={`${rezumat.detaliu} — click pentru fișa de acoperire`}
                      onClick={() => schimbaTab('livrare')}
                    >
                      {rezumat.eticheta}
                    </button>
                  </span>
                  {!arhiva && (
                    <div className={shared1['admin-cell-actions']} data-css="admin-cell-actions">
                      <button
                        type="button"
                        className={shared1['admin-btn-promote']} data-css="admin-btn-promote"
                        title="Editează înscrierea"
                        disabled={randuriOcupate.has(r.id)}
                        onClick={() => startEdit(r)}
                      >
                        Editează
                      </button>
                      <button
                        type="button"
                        className={shared1['admin-btn-promote']} data-css="admin-btn-promote"
                        title="Prezență, număr și timp final"
                        disabled={randuriOcupate.has(r.id)}
                        onClick={() => setPrezentaRow(r)}
                      >
                        Prezență
                      </button>
                      <button
                        type="button"
                        className={shared1['admin-btn-delete']} data-css="admin-btn-delete"
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
                <div className={shared1['admin-empty']} data-css="admin-empty">Nu am putut încărca lista. Reîncercăm automat.</div>
              )}
              {rows !== null && filtered.length === 0 && (
                <div className={shared1['admin-empty']} data-css="admin-empty">Niciun participant găsit.</div>
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
      </CadruCuSemnale>
      </FurnizorSala>

      {prezentaRow && (
        <DialogPrezenta
          rand={prezentaRow}
          ocupat={randuriOcupate.has(prezentaRow.id)}
          onSalveaza={(date) => handlePrezenta(prezentaRow, date)}
          onInchide={() => setPrezentaRow(null)}
        />
      )}

      {confirmRow && (
        <Dialog titlu="Ștergi înscrierea?" rol="alertdialog" onInchide={() => setConfirmRow(null)}>
          <p>
            <strong>{confirmRow.nume}</strong> ({confirmRow.email}) va fi șters din listă.
            Poți anula imediat după, din notificarea de jos.
          </p>
          <div className="admin-confirm-actions" data-css="admin-confirm-actions">
            <button
              type="button"
              className={shared1['admin-confirm-delete']} data-css="admin-confirm-delete"
              onClick={() => {
                handleDelete(confirmRow);
                setConfirmRow(null);
              }}
            >
              Da, șterge
            </button>
            <button type="button" className="admin-confirm-cancel" data-css="admin-confirm-cancel" onClick={() => setConfirmRow(null)}>
              Anulează
            </button>
          </div>
        </Dialog>
      )}

    </>
  );
};
