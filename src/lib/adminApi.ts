import { SUPABASE } from './config';
import { SubmitHttpError } from './supabase';

/**
 * API-ul backoffice-ului — totul trece prin RPC-uri SECURITY DEFINER care
 * validează un token de sesiune (tabelele `admin_users`/`admin_sessions`
 * au RLS fără politici, deci cheia publică singură nu poate citi nimic).
 */

const TOKEN_KEY = 'runlift_admin_token';

export type AdminRegistration = {
  id: string;
  created_at: string;
  nume: string;
  telefon: string;
  email: string;
  echipa: string;
  /** Ediția din care face parte rândul (listările sunt filtrate pe ediție). */
  editie: number;
  /** Dezabonat de la emailuri; null = primește în continuare. */
  dezabonat_la: string | null;
  /**
   * Tokenul din `{link_renunt}` — cu el își eliberează locul din email.
   *
   * Opțional în tip, nu în DB: rândurile din `admin-preview.tsx` (backoffice-ul
   * demonstrativ, fără server) nu-l au, iar un câmp obligatoriu ar fi cerut
   * inventarea unor UUID-uri care nu deschid nimic.
   */
  token_renunt?: string;
  /**
   * A venit la cursă. `null`/absent = încă nu se știe; `false` = s-a constatat
   * că n-a venit.
   *
   * Distincția e tot rostul coloanei: o valoare implicită `false` ar afirma
   * absența fiecărui înscris cu săptămâni înainte de cursă.
   */
  prezent?: boolean | null;
  /** Numărul de concurs. Unic pe ediție între rândurile vii. */
  numar?: number | null;
  /** Timpul final, ca `HH:MM:SS` — serverul îl fixează la forma asta. */
  timp_final?: string | null;
};

/** Cele trei câmpuri de prezență, așa cum se scriu împreună. */
export type Prezenta = {
  prezent: boolean | null;
  numar: number | null;
  timp_final: string | null;
};

/**
 * Motivul refuzului la scrierea prezenței, tradus.
 *
 * `null` când serverul n-a răspuns în termeni pe care-i știm — de regulă
 * fiindcă n-a răspuns deloc.
 */
export type RefuzPrezenta =
  | 'not_found'
  | 'timp_invalid'
  | 'numar_invalid'
  | 'numar_duplicat';

export const getStoredToken = (): string | null => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};

export const storeToken = (token: string): void => {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Privat mode fără localStorage — sesiunea ține doar cât pagina.
  }
};

export const clearStoredToken = (): void => {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // idem
  }
};

/** Sesiune invalidă/expirată — semnal pentru revenirea la login. */
export class InvalidTokenError extends Error {
  constructor() {
    super('invalid_token');
  }
}

const rpc = async <T>(fn: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<T> => {
  const res = await fetch(`${SUPABASE.url}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE.publishableKey,
      'Content-Type': 'application/json',
      'Content-Profile': SUPABASE.schema,
    },
    body: JSON.stringify(args),
    signal,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    if (body.includes('invalid_token')) throw new InvalidTokenError();
    throw new SubmitHttpError(res.status, body);
  }
  return (await res.json().catch(() => undefined)) as T;
};

/** Autentificare — întoarce token-ul de sesiune sau null la credențiale greșite. */
export const adminLogin = (username: string, password: string): Promise<string | null> =>
  rpc<string | null>('admin_login', { p_username: username, p_password: password });

export const checkToken = (token: string, signal?: AbortSignal): Promise<boolean> =>
  rpc<boolean>('admin_check_token', { p_token: token }, signal);

/** `editie` lipsă = ediția curentă din `app_config`. */
export const listRegistrations = (
  token: string,
  editie?: number,
  signal?: AbortSignal
): Promise<AdminRegistration[]> =>
  rpc<AdminRegistration[]>(
    'admin_list_registrations',
    { p_token: token, p_editie: editie ?? null },
    signal
  );

/* ---- Ediții (taburile din backoffice) ---- */

export type AdminEdition = {
  editie: number;
  participanti: number;
  asteptare: number;
  lansare: number;
  /** Prima/ultima înscriere din ediție; null dacă ediția e goală. */
  prima: string | null;
  ultima: string | null;
  /** Ediția pe care o consideră „curentă" backendul (`app_config`). */
  este_curenta: boolean;
};

export const listEditions = (token: string, signal?: AbortSignal): Promise<AdminEdition[]> =>
  rpc<AdminEdition[]>('admin_list_editions', { p_token: token }, signal);

/**
 * Deschide ediția următoare (tab nou, gol): mută ediția curentă din `app_config`
 * pe max+1 și șterge reperele de timp ale ediției încheiate (deadline + start).
 * Codul din `src/content/edition.ts` NU se schimbă — rămâne de aliniat manual.
 */
export const createEdition = (token: string): Promise<number> =>
  rpc<number>('admin_create_edition', { p_token: token });

/* ---- Configurarea ediției (`event_config`) ---- */

export type AdminEventConfigRow = {
  id: string;
  editie: number;
  config: unknown;
  status: 'draft' | 'published' | 'superseded';
  created_at: string;
  /** Momentul publicării; null cât timp rândul e ciornă. */
  published_at: string | null;
};

/**
 * Ciorna + publicatul ediției cerute (lipsă = ediția curentă din `app_config`),
 * plus versiunile păstrate, pentru revenire.
 */
export const listEventConfig = (
  token: string,
  editie?: number,
  signal?: AbortSignal
): Promise<AdminEventConfigRow[]> =>
  rpc<AdminEventConfigRow[]>(
    'admin_get_event_config',
    { p_token: token, p_editie: editie ?? null },
    signal
  );

/** Salvează ciorna. Nu schimbă nimic din ce vede vizitatorul. */
export const saveEventConfigDraft = (
  token: string,
  editie: number,
  config: unknown
): Promise<string> =>
  rpc<string>('admin_save_event_config_draft', {
    p_token: token,
    p_editie: editie,
    p_config: config,
  });

/**
 * Publică ciorna. Aceeași tranzacție scrie și cele șase scalare din
 * `app_config` pe care le citesc guard-urile și cron-ul de remindere — de asta
 * nu mai există desincronizare de aliniat manual.
 *
 * Refuzuri așteptate: `no_draft`, `config_invalid: …`,
 * `registration_hidden_while_open: …`.
 */
export const publishEventConfig = (token: string, editie: number): Promise<string> =>
  rpc<string>('admin_publish_event_config', { p_token: token, p_editie: editie });

/**
 * Comută ecranul de dinainte de lansare și mută țintele numărătorilor, cu efect
 * IMEDIAT pe site — fără ciornă și fără „Publică".
 *
 * De ce ocolește fluxul ciornă → publică: comutarea e o operație de un singur
 * gest, făcută de regulă sub presiune („anunțul iese acum"). Ciorna e potrivită
 * pentru o ediție întreagă, unde verificarea înainte merită pașii; aici e o
 * manetă. Serverul petice exact trei chei pe documentul publicat și îl
 * revalidează prin aceeași poartă ca publicarea, deci scurtătura e de pași, nu
 * de verificări.
 *
 * Rezultatul rămâne reversibil: peticul scrie un rând nou, deci apare în
 * „Versiuni anterioare".
 *
 * Refuzuri așteptate: `no_published`, `config_invalid: …`.
 */
export const setComingSoon = (
  token: string,
  show: boolean,
  launchAt: string,
  nextEditionAt: string
): Promise<string> =>
  rpc<string>('admin_set_coming_soon', {
    p_token: token,
    p_show: show,
    p_launch_at: launchAt,
    p_next_edition_at: nextEditionAt,
  });

/** Revenire la o versiune păstrată — republicare, deci rescrie și scalarele. */
export const restoreEventConfig = (token: string, id: string): Promise<string> =>
  rpc<string>('admin_restore_event_config', { p_token: token, p_id: id });

/**
 * Un clip din bandă, așa cum îl vede backoffice-ul.
 *
 * Fără versionare, spre deosebire de program: nu există ciornă și nici „revino
 * la versiunea trecută" pentru o legendă. Un istoric aici ar fi fost ceremonie.
 */
export type AdminReelRow = {
  id: string;
  /** Poziția în bandă, 1…N. Poziție, nu identificator: mutarea renumerotează. */
  numar: number;
  video: string;
  poster: string;
  caption: string;
  url: string;
  vizibil: boolean;
};

/** Clipurile, în ordinea din bandă, inclusiv cele ascunse. */
export const listTrainingReels = (token: string, signal?: AbortSignal): Promise<AdminReelRow[]> =>
  rpc<AdminReelRow[]>('admin_list_training_reels', { p_token: token }, signal);

/**
 * Salvează un clip. Efect imediat pe site — nu trece prin ciornă.
 *
 * `id` null înseamnă „clip nou": serverul îi pune numărul următor, deci
 * organizatorul nu tastează și nu alege niciun număr.
 */
export const saveTrainingReel = (
  token: string,
  id: string | null,
  video: string,
  poster: string,
  caption: string,
  url: string,
  vizibil: boolean
): Promise<string> =>
  rpc<string>('admin_save_training_reel', {
    p_token: token,
    p_id: id,
    p_video: video,
    p_poster: poster,
    p_caption: caption,
    p_url: url,
    p_vizibil: vizibil,
  });

/**
 * Mută un clip cu o poziție. Întoarce numărul lui de după mutare — la capăt de
 * bandă e același, fiindcă nu există vecin și asta nu e o eroare.
 */
export const moveTrainingReel = (token: string, id: string, directie: -1 | 1): Promise<number> =>
  rpc<number>('admin_move_training_reel', { p_token: token, p_id: id, p_directie: directie });

/**
 * Scoate un clip din bandă și compactează numerele. Fișierul rămâne în repo:
 * ștergerea din listă nu e o ștergere de pe disc, iar un clip repus mai târziu
 * nu trebuie re-encodat.
 */
export const deleteTrainingReel = (token: string, id: string): Promise<number> =>
  rpc<number>('admin_delete_training_reel', { p_token: token, p_id: id });

/**
 * Un rând din programul de antrenamente: fie o săptămână publicată, fie o
 * versiune înlocuită a ei. Le leagă `numar` — versiunile îl poartă pe cel al
 * săptămânii lor, deci „Versiuni anterioare" e per săptămână.
 */
export type AdminWorkoutRow = {
  id: string;
  /** Poziția în program, 1…N. Poziție, nu identificator: mutarea renumerotează. */
  numar: number;
  status: 'published' | 'superseded';
  titlu: string;
  corp: string;
  vizibil: boolean;
  creat_la: string;
};

/**
 * Salvează o săptămână. Efect imediat pe site — nu trece prin ciornă.
 *
 * `id` null înseamnă „săptămână nouă": serverul îi pune numărul următor, deci
 * organizatorul nu tastează și nu alege niciun număr. `id` dat înseamnă „editez
 * săptămâna asta" și e id-ul rândului ei PUBLICAT — nu numărul ei, fiindcă un
 * număr trimis dintr-un ecran rămas în urmă după o renumerotare ar lovi altă
 * săptămână decât cea apăsată.
 *
 * Serverul decide dacă scrie o versiune nouă sau peticește rândul publicat:
 * titlul sau corpul schimbat scriu, vizibilitatea singură peticește. Clientul nu
 * trebuie să știe regula, doar să nu o contrazică trimițând altceva.
 */
export const saveWeeklyWorkout = (
  token: string,
  id: string | null,
  titlu: string,
  corp: string,
  vizibil: boolean
): Promise<string> =>
  rpc<string>('admin_save_weekly_workout', {
    p_token: token,
    p_id: id,
    p_titlu: titlu,
    p_corp: corp,
    p_vizibil: vizibil,
  });

/**
 * Programul, cu tot cu versiuni.
 *
 * Verifică forma rândurilor, spre deosebire de celelalte wrappere, fiindcă e
 * singurul RPC din migrarea programului care și-a păstrat SEMNĂTURA schimbându-și
 * forma răspunsului (`activ` → `vizibil`, plus `numar`). Toate celelalte s-au
 * redenumit sau au primit un parametru, deci o bază nemigrată le respinge din
 * PostgREST. Ăsta ar rezolva liniștit împotriva funcției vechi și ar întoarce
 * rânduri fără `numar`, iar ecranul ar randa un program greșit în loc să se
 * oprească — exact felul de eșec tăcut pe care fereastra dintre deploy și
 * migrarea manuală îl face posibil (vezi `MIGRATIONS.md`).
 */
export const listWeeklyWorkout = async (
  token: string,
  signal?: AbortSignal
): Promise<AdminWorkoutRow[]> => {
  const randuri = await rpc<AdminWorkoutRow[]>(
    'admin_list_weekly_workout',
    { p_token: token },
    signal
  );
  if (!Array.isArray(randuri)) throw new Error('weekly_workout_forma_veche');
  for (const r of randuri) {
    if (typeof r?.numar !== 'number' || typeof r?.vizibil !== 'boolean') {
      throw new Error('weekly_workout_forma_veche');
    }
  }
  return randuri;
};

/**
 * Mută o săptămână cu o poziție. Întoarce numărul ei de după mutare — la capăt
 * de program e același, fiindcă nu există vecin și asta nu e o eroare.
 *
 * Operație, nu listă întreagă: clipurile Instagram trimit lista fiindcă fac
 * parte dintr-un document-ciornă, dar aici nu există ciornă, iar o listă
 * întreagă ar fi transformat orice reîmprospătare ratată într-o rescriere a
 * programului.
 */
export const moveWeeklyWorkout = (
  token: string,
  id: string,
  directie: -1 | 1
): Promise<number> =>
  rpc<number>('admin_move_weekly_workout', { p_token: token, p_id: id, p_directie: directie });

/** Șterge o săptămână cu tot cu versiunile ei și compactează numerele. Definitiv. */
export const deleteWeeklyWorkout = (token: string, id: string): Promise<number> =>
  rpc<number>('admin_delete_weekly_workout', { p_token: token, p_id: id });

export const restoreWeeklyWorkout = (token: string, id: string): Promise<string> =>
  rpc<string>('admin_restore_weekly_workout', { p_token: token, p_id: id });

/**
 * Refuzul serverului, în cuvintele operatorului.
 *
 * Stă lângă wrapper, nu în componentă: codul `workout_empty` e o proprietate a
 * RPC-ului, iar oricine îl mai cheamă cândva are nevoie de aceeași traducere.
 */
export const mesajRefuzAntrenament = (err: unknown): string => {
  const text = err instanceof Error ? err.message : String(err);
  if (text.includes('weekly_workout_forma_veche')) {
    return 'Baza de date n-are încă migrarea programului. Aplic-o înainte să folosești ecranul.';
  }
  if (text.includes('workout_empty')) {
    return 'Nu poți face vizibilă o săptămână fără text scris. Scrie antrenamentul, sau las-o ascunsă.';
  }
  if (text.includes('not_found')) {
    return 'Săptămâna aceea nu mai există. Reîncarcă pagina.';
  }
  if (text.includes('directie_invalida')) {
    return 'Nu am putut muta săptămâna. Reîncarcă pagina.';
  }
  // Neutru ca verb: aceeași traducere servește și mutarea, și ștergerea, nu doar
  // salvarea. „Nu am putut salva" pe o ștergere eșuată ar fi trimis omul să caute
  // problema în formular.
  return 'Nu a mers. Încearcă din nou.';
};

/**
 * Refuzul serverului pentru clipuri, în cuvintele organizatorului.
 *
 * Constrângerile din DB sînt ultima linie, nu prima: formularul verifică deja
 * aceleași forme. Ce ajunge aici e ori o cale lipită greșit, ori un ecran rămas
 * în urmă — iar diferența contează pentru ce-i spui omului să facă.
 */
export const mesajRefuzClip = (err: unknown): string => {
  const text = err instanceof Error ? err.message : String(err);
  if (text.includes('training_reels_fisier_ok')) {
    return 'Calea clipului trebuie să arate ca „/reels/nume-clip.mp4". Rulează `npm run reel` și copiază ce-ți tipărește.';
  }
  if (text.includes('training_reels_poster_ok')) {
    return 'Calea posterului trebuie să arate ca „/reels/nume-clip.jpg", sau să fie goală.';
  }
  if (text.includes('training_reels_url_ok')) {
    return 'Linkul trebuie să fie o adresă Instagram curată, fără „?" la coadă — ex. https://www.instagram.com/reel/ABC12345/';
  }
  if (text.includes('training_reels_caption_ok')) {
    return 'Legenda nu poate fi goală: ea e ce citește cineva care folosește un cititor de ecran.';
  }
  if (text.includes('training_reels_un_fisier')) {
    return 'Clipul ăsta e deja în bandă. Două carduri cu același fișier sînt o greșeală de lipit.';
  }
  if (text.includes('not_found')) {
    return 'Clipul acela nu mai există. Reîncarcă pagina.';
  }
  if (text.includes('directie_invalida')) {
    return 'Nu am putut muta clipul. Reîncarcă pagina.';
  }
  return 'Nu a mers. Încearcă din nou.';
};

export type AdminLaunchSignup = {
  id: string;
  created_at: string;
  nume: string;
  prenume: string;
  email: string;
  telefon: string;
  /** Ediția pentru care persoana s-a înscris (pusă de server la insert). */
  editie: number;
  /** De unde a venit: butonul de pe Coming Soon sau formularul din /despre-noi. */
  sursa: 'lansare' | 'despre-noi';
  /** Momentul confirmării din email; null = încă neconfirmat. */
  confirmat_la: string | null;
  /** Dezabonat prin linkul din email; null = primește în continuare. */
  dezabonat_la: string | null;
};

export type AdminEmailTemplate = {
  cheie: string;
  subiect: string;
  text_email: string;
  actualizat_la: string;
};

/** Șabloanele de email editabile din backoffice. */
export const listEmailTemplates = (
  token: string,
  signal?: AbortSignal
): Promise<AdminEmailTemplate[]> =>
  rpc<AdminEmailTemplate[]>('admin_list_email_templates', { p_token: token }, signal);

export const saveEmailTemplate = (
  token: string,
  cheie: string,
  subiect: string,
  text: string
): Promise<void> =>
  rpc<void>('admin_save_email_template', {
    p_token: token,
    p_cheie: cheie,
    p_subiect: subiect,
    p_text: text,
  });

/** Înscrierile la „Anunță-mă la lansare" (tabelul launch_notifications). */
export const listLaunchNotifications = (
  token: string,
  signal?: AbortSignal
): Promise<AdminLaunchSignup[]> =>
  rpc<AdminLaunchSignup[]>('admin_list_launch_notifications', { p_token: token }, signal);

/**
 * Adaugă o înscriere (acord = true implicit). Email duplicat => HTTP 409.
 * Serverul refuză peste `event_capacity` cu `event_full`; `force` e derogarea
 * explicită a operatorului, nu un implicit.
 */
export const addRegistration = (
  token: string,
  data: { nume: string; telefon: string; email: string },
  force = false
): Promise<string> =>
  rpc<string>('admin_add_registration', {
    p_token: token,
    p_nume: data.nume,
    p_telefon: data.telefon,
    p_email: data.email,
    p_force: force,
  });

/** Ștergere LOGICĂ — rândul rămâne, cu `deleted_at` setat. */
export const deleteRegistration = (token: string, id: string): Promise<void> =>
  rpc<void>('admin_delete_registration', { p_token: token, p_id: id });

/**
 * Reversarea ștergerii: același rând, deci același `created_at` și aceeași
 * poziție în ordinea de promovare. Refuză cu `event_full` dacă locul a fost
 * ocupat între timp (auto-promovare) și cu `duplicate_email` dacă adresa a fost
 * re-înscrisă — ambele erau, înainte, supraîncărcări tăcute.
 */
export const undeleteRegistration = (
  token: string,
  id: string,
  force = false
): Promise<void> =>
  rpc<void>('admin_undelete_registration', { p_token: token, p_id: id, p_force: force });

/** Editare in-place a unei înscrieri (păstrează `created_at`). Duplicat => HTTP 409. */
export const updateRegistration = (
  token: string,
  id: string,
  data: { nume: string; telefon: string; email: string }
): Promise<void> =>
  rpc<void>('admin_update_registration', {
    p_token: token,
    p_id: id,
    p_nume: data.nume,
    p_telefon: data.telefon,
    p_email: data.email,
  });

/**
 * Scrie cele trei câmpuri de prezență pe un rând.
 *
 * Se scriu ÎMPREUNĂ și `null` ȘTERGE — semantica e „starea de prezență a
 * rândului e asta", nu „actualizează ce ți-am dat". Altfel un număr pus din
 * greșeală n-ar mai putea fi scos niciodată.
 */
export const setPrezenta = (
  token: string,
  id: string,
  date: Prezenta
): Promise<void> =>
  rpc<void>('admin_set_prezenta', {
    p_token: token,
    p_id: id,
    p_prezent: date.prezent,
    p_numar: date.numar,
    p_timp_final: date.timp_final,
  });

/** Motivul recunoscut al serverului, sau `null` când nu-l știm traduce. */
export const refuzPrezenta = (err: unknown): RefuzPrezenta | null => {
  const text = err instanceof Error ? err.message : String(err);
  for (const motiv of ['numar_duplicat', 'numar_invalid', 'timp_invalid', 'not_found'] as const) {
    if (text.includes(motiv)) return motiv;
  }
  return null;
};

/* ---- Feed de audit (admin_events): promovări automate etc. ---- */

export type AdminEvent = {
  id: string;
  created_at: string;
  tip: string;
  detaliu: Record<string, unknown>;
};

/**
 * Feedul de audit. Plafonul nu mai e fix la 50: de când fiecare scriere din
 * admin lasă urmă, feedul e răspunsul la „ce s-a întâmplat cu Ana?".
 */
export const listAdminEvents = (
  token: string,
  limit = 200,
  signal?: AbortSignal
): Promise<AdminEvent[]> =>
  rpc<AdminEvent[]>('admin_list_events', { p_token: token, p_limit: limit }, signal);

/* ---- Lista de așteptare (event_waitlist) ---- */

export type AdminWaitlistEntry = {
  id: string;
  created_at: string;
  nume: string;
  telefon: string;
  email: string;
  editie: number;
};

/** `editie` lipsă = ediția curentă din `app_config`. */
export const listWaitlist = (
  token: string,
  editie?: number,
  signal?: AbortSignal
): Promise<AdminWaitlistEntry[]> =>
  rpc<AdminWaitlistEntry[]>(
    'admin_list_waitlist',
    { p_token: token, p_editie: editie ?? null },
    signal
  );

/** Ștergere LOGICĂ — rândul rămâne, cu `deleted_at` setat. */
export const deleteWaitlist = (token: string, id: string): Promise<void> =>
  rpc<void>('admin_delete_waitlist', { p_token: token, p_id: id });

/**
 * Reversarea ștergerii de pe listă: același rând, deci același `created_at` și
 * aceeași poziție în ordinea FIFO de promovare. Refuză cu `waitlist_full` dacă
 * plafonul s-a umplut între timp, cu `duplicate_email` dacă adresa a fost
 * re-adăugată, și cu `not_found` dacă rândul a fost promovat — promovarea îl
 * șterge fizic, deci nu mai e nimic de readus.
 */
export const undeleteWaitlist = (token: string, id: string, force = false): Promise<void> =>
  rpc<void>('admin_undelete_waitlist', { p_token: token, p_id: id, p_force: force });

/** Mută o persoană din așteptare în participanți. Întoarce id-ul nou (sau null
 * dacă emailul era deja înscris). */
export const promoteWaitlist = (token: string, id: string): Promise<string | null> =>
  rpc<string | null>('admin_promote_waitlist', { p_token: token, p_id: id });

/* ---- Jurnal de livrare a emailurilor (email_log) ---- */

export type AdminEmailLogEntry = {
  id: string;
  created_at: string;
  email: string;
  nume: string;
  subiect: string;
  text_email: string;
  /** Cine a declanșat trimiterea. */
  mod: 'admin' | 'confirm' | 'promoted' | 'info' | 'broadcast' | 'alert' | 'anunt' | 'anunt_test';
  /** `istoric` = anunțul către toți participanții de până acum. */
  audienta: 'participanti' | 'asteptare' | 'istoric' | '';
  /**
   * Cheia șablonului cu care s-a randat mesajul; `null` pe rândurile de dinainte
   * ca jurnalul s-o rețină. Fără ea, o difuzare nu se poate rejuca: orarul are
   * două șabloane pentru aceeași audiență, iar ghicitul ar retrimite alt text.
   */
  sablon: string | null;
  status: 'trimis' | 'esuat';
  /** Codul HTTP de la Resend (200 la succes, 4xx/5xx la eșec). */
  provider_status: number | null;
  /** Corpul răspunsului de la provider — motivul concret al eșecului. */
  eroare: string | null;
  editie: number;
};

/**
 * `editie` lipsă = ediția curentă. Cele mai noi primele.
 *
 * `cuText`: corpul emailului e câmpul greu și e nevoie de el doar în tab-ul
 * „Livrare". Poll-ul de fundal îl cere `false` ca să nu care sute de KB la
 * fiecare refresh — rândurile vin atunci cu `text_email: ''`.
 */
export const listEmailLog = (
  token: string,
  editie?: number,
  cuText = true,
  signal?: AbortSignal
): Promise<AdminEmailLogEntry[]> =>
  rpc<AdminEmailLogEntry[]>(
    'admin_list_email_log',
    { p_token: token, p_editie: editie ?? null, p_cu_text: cuText },
    signal
  );

export const adminLogout = (token: string): Promise<void> =>
  rpc<void>('admin_logout', { p_token: token });

/* ---- Email (funcția Edge `send-email` → Resend) ---- */

export type EmailMessage = { to: string; subject: string; text: string };
export type SendEmailResult = {
  sent: number;
  failed: number;
  errors?: { to: string; status: number }[];
  /** `true` când zăvorul a oprit o difuzare deja trimisă pe aceeași cheie. */
  skipped?: boolean;
  note?: string;
};

const FUNCTIONS_URL = `${SUPABASE.url}/functions/v1`;

/**
 * Trimitere în masă din backoffice — protejată de token pe server.
 * `audience`/`editie` nu schimbă ce se trimite; ajung doar în `email_log`, ca
 * tab-ul „Livrare" să știe pe ce listă și pe ce ediție a fost trimis emailul.
 */
export const sendBulkEmail = async (
  token: string,
  messages: EmailMessage[],
  meta?: {
    audience?: 'participanti' | 'asteptare';
    editie?: number;
    /**
     * Cheie de idempotență (`src/admin/sendLock.ts`). Serverul trimite o singură
     * dată per cheie; a doua oară întoarce `skipped: true`. Lipsa ei păstrează
     * comportamentul de dinainte de zăvor.
     */
    onceKey?: string;
  },
  signal?: AbortSignal
): Promise<SendEmailResult> => {
  const res = await fetch(`${FUNCTIONS_URL}/send-email`, {
    method: 'POST',
    headers: { apikey: SUPABASE.publishableKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mode: 'admin',
      token,
      messages,
      audience: meta?.audience,
      editie: meta?.editie,
      once_key: meta?.onceKey,
    }),
    signal,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) throw new InvalidTokenError();
    throw new SubmitHttpError(res.status, JSON.stringify(body));
  }
  return body as SendEmailResult;
};

export type EmailPreview = {
  /** HTML-ul exact cum pleacă — randat de aceeași funcție ca trimiterile. */
  html: string;
  subiect: string;
  /** Destinatarul real pentru care s-au completat variabilele. */
  pentru: { email: string; nume: string };
};

/**
 * HTML-ul randat al unui șablon, pentru un destinatar real al ediției.
 *
 * Nu trimite nimic și nu scrie în `email_log`. Fără `email`, serverul alege
 * primul destinatar al ediției — previzualizarea are nevoie de o persoană
 * concretă, altfel variabilele rămân acolade și exact ce trebuie verificat
 * (linkurile) nu se poate verifica.
 */
export const previewEmailHtml = async (
  token: string,
  template: string,
  email?: string,
  signal?: AbortSignal
): Promise<EmailPreview> => {
  const res = await fetch(`${FUNCTIONS_URL}/send-email`, {
    method: 'POST',
    headers: { apikey: SUPABASE.publishableKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'preview', token, template, email }),
    signal,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) throw new InvalidTokenError();
    throw new SubmitHttpError(res.status, JSON.stringify(body));
  }
  return body as EmailPreview;
};

/* ---- Anunțul către toți participanții de până acum (`send-email` → `anunt`) ---- */

/**
 * Un om care primește anunțul. FĂRĂ tokenul de dezabonare: lista o rezolvă
 * serverul (`anunt_recipients`), iar clientul are nevoie doar să vadă cine e.
 */
export type DestinatarAnunt = {
  email: string;
  nume: string;
  /** Ultima ediție la care a fost înscris. */
  ultima_editie: number;
};

/** Refuzul funcției, cu codul ei — `motivEroareAnunt` îl traduce. */
export class AnuntError extends Error {
  constructor(
    readonly status: number,
    readonly cod: string
  ) {
    super(cod);
  }
}

const postAnunt = async <T>(token: string, corp: Record<string, unknown>): Promise<T> => {
  const res = await fetch(`${FUNCTIONS_URL}/send-email`, {
    method: 'POST',
    headers: { apikey: SUPABASE.publishableKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'anunt', token, ...corp }),
  });
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    if (res.status === 401) throw new InvalidTokenError();
    throw new AnuntError(res.status, body.error ?? `http_${res.status}`);
  }
  return body as T;
};

/** Cine ar primi anunțul acum. Nu trimite și nu scrie nimic. */
export const previewAnunt = (
  token: string
): Promise<{ total: number; destinatari: DestinatarAnunt[] }> =>
  postAnunt(token, { dry_run: true });

/** Un singur email, la operator, randat ca pentru primul om din listă. */
export const trimiteTestAnunt = (
  token: string,
  date: { catre: string; subiect: string; text: string; sablon?: string }
): Promise<SendEmailResult> =>
  postAnunt(token, {
    test_to: date.catre,
    subject: date.subiect,
    text: date.text,
    sablon: date.sablon,
  });

/**
 * Anunțul propriu-zis. `exclude` doar SCOATE oameni — serverul recalculează
 * lista la trimitere, deci un tab vechi nu poate trimite cuiva din afara ei.
 */
export const trimiteAnunt = (
  token: string,
  date: { subiect: string; text: string; exclude: string[]; onceKey: string; sablon?: string }
): Promise<SendEmailResult> =>
  postAnunt(token, {
    subject: date.subiect,
    text: date.text,
    exclude: date.exclude,
    once_key: date.onceKey,
    sablon: date.sablon,
  });

/** Refuzul serverului la o rejucare, cu motivul din `admin_replay_lookup`. */
export type ReplayRefuz =
  | 'mod_exclus'
  | 'sablon_necunoscut'
  | 'destinatar_lipsa'
  | 'dezabonat'
  | 'jurnal_lipsa'
  /** Anunț: între timp s-a înscris la ediția curentă, deci nu mai e în audiență. */
  | 'nu_mai_e_in_audienta';

/**
 * Rejoacă o trimitere eșuată prin fluxul MODULUI ei.
 *
 * Nu reia textul din jurnal: serverul reconstruiește mesajul din șablon și din
 * starea de acum a destinatarului. De aceea poate refuza — cine s-a dezabonat
 * între timp nu mai e destinatar, iar o înscriere ștearsă n-are cui primi.
 */
export const replayEmail = async (
  token: string,
  logId: string
): Promise<{ sent: number; failed: number; mod: string }> => {
  const res = await fetch(`${FUNCTIONS_URL}/send-email`, {
    method: 'POST',
    headers: { apikey: SUPABASE.publishableKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'replay', token, log_id: logId }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) throw new InvalidTokenError();
    throw new SubmitHttpError(res.status, JSON.stringify(body));
  }
  return body as { sent: number; failed: number; mod: string };
};
