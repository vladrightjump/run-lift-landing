// Modul `anunt`: anunțul unei ediții noi către toți participanții de până acum.
//
// Separat de `index.ts` ca să poată fi testat din vitest
// (`tests/unit/edgeAnunt.test.ts`): tot ce atinge rețeaua sau `Deno.*` vine prin
// `DepsAnunt`. Același motiv ca la `eventVars.ts` — fișierul e pur.
//
// Autentificarea lui `admin` + bucla lui `broadcast`. Nu e o audiență nouă în
// modul `admin`, deliberat: acolo mesajele vin gata compuse din client și
// pleacă fără link de dezabonare. Aici lista se rezolvă pe server
// (`anunt_recipients`), iar fiecare email poartă dezabonarea — un anunț către
// oameni care n-au cerut anunțuri n-are voie să plece fără ea.

import { fillEventVars, type ConfigEveniment } from "./eventVars.ts";

/** Un rând din `anunt_recipients()`. Tokenul nu pleacă niciodată spre client. */
type DestinatarAnunt = {
  email: string;
  nume: string;
  token_unsub: string;
  ultima_editie: number;
};

type Mesaj = { to: string; subject: string; text: string };
type Trimitere = { ok: boolean; status: number; body: string };

export type RandJurnalAnunt = {
  email: string;
  nume?: string;
  subiect: string;
  text_email: string;
  mod: "anunt" | "anunt_test";
  audienta: "istoric";
  sablon?: string;
  ok: boolean;
  provider_status?: number;
  eroare?: string;
  editie?: number;
};

export type DepsAnunt = {
  rpc: <T>(fn: string, args: Record<string, unknown>) => Promise<T | null>;
  sendOne: (m: Mesaj, badge: string, unsubPage?: string, unsubApi?: string) => Promise<Trimitere>;
  logSends: (rows: RandJurnalAnunt[]) => Promise<void>;
  loadConfig: () => Promise<ConfigEveniment | null>;
  loadBadge: () => Promise<string>;
  fillVars: (text: string, nume: string, email: string) => string;
  pauza: (ms: number) => Promise<void>;
  supabaseUrl: string;
};

export type RaspunsAnunt = { status: number; body: Record<string, unknown> };

const raspuns = (status: number, body: Record<string, unknown>): RaspunsAnunt => ({ status, body });

/** Plafonul listei de debifați — mai mult decât audiența întreagă de azi. */
export const MAX_EXCLUDERI = 500;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Pauza dintre două trimiteri ale unui anunț.
 *
 * Bucla din `broadcast` n-are niciuna — la 30 de remindere n-a contat. Un anunț
 * pleacă însă la toți oamenii din istoric, iar limita de ritm a Resend e de
 * câteva cereri pe secundă: fără pauză, a doua jumătate a listei ar primi `429`.
 * La 250 ms, 70 de destinatari înseamnă ~40 s, sub plafonul unei invocări Edge.
 */
export const PAUZA_ANUNT_MS = 250;

/** La câte trimiteri se scrie jurnalul, pe parcursul unui anunț. */
export const LOT_JURNAL = 10;

/** Singura cheie de șablon acceptată în jurnal — de acolo o citește rejucarea. */
const SABLON_ANUNT = "bulk_participant_anunt";

/**
 * `sendOne` cu o singură reîncercare pe `429`.
 *
 * Doar `429`: e singurul eșec care spune „mai încearcă". Un `4xx` e un verdict
 * despre mesaj sau adresă, iar un `5xx` repetat imediat ar lovi aceeași pană.
 */
async function trimiteCuReincercare(
  deps: DepsAnunt,
  m: Mesaj,
  badge: string,
  unsubPage?: string,
  unsubApi?: string
): Promise<Trimitere> {
  const r = await deps.sendOne(m, badge, unsubPage, unsubApi);
  if (r.status !== 429) return r;
  await deps.pauza(1000);
  return await deps.sendOne(m, badge, unsubPage, unsubApi);
}

const linkDezabonarePagina = (token?: string): string | undefined =>
  token ? `https://parktraining.fit/unsubscribe?token=${token}` : undefined;

const linkDezabonareApi = (supabaseUrl: string, token?: string): string | undefined =>
  token ? `${supabaseUrl}/functions/v1/unsubscribe?token=${token}` : undefined;

/**
 * Trei forme ale aceleiași cereri, pe aceeași listă:
 *   • `dry_run: true`  → cine primește (fără tokenuri), nimic trimis;
 *   • `test_to`        → un singur email, la operator, randat identic;
 *   • altfel           → trimiterea, sub zăvorul `once_key`.
 * Lista nu vine niciodată din client: `exclude` doar scoate oameni.
 */
export async function anunt(
  payload: Record<string, unknown>,
  deps: DepsAnunt
): Promise<RaspunsAnunt> {
  const token = String(payload.token ?? "");
  const valid = await deps.rpc<boolean>("admin_check_token", { p_token: token });
  if (valid !== true) return raspuns(401, { error: "invalid_token" });

  const exclude = payload.exclude ?? [];
  if (
    !Array.isArray(exclude) ||
    exclude.length > MAX_EXCLUDERI ||
    exclude.some((e) => typeof e !== "string")
  ) {
    return raspuns(400, { error: "bad_exclude" });
  }

  const destinatari = await deps.rpc<DestinatarAnunt[]>("anunt_recipients", {
    p_exclude: exclude,
  });
  // `null` = RPC-ul a picat. O listă goală ar fi o afirmație („nimeni de
  // anunțat"), iar aici nu știm nimic.
  if (destinatari === null) return raspuns(500, { error: "recipients_failed" });

  if (payload.dry_run === true) {
    return raspuns(200, {
      total: destinatari.length,
      destinatari: destinatari.map((d) => ({
        email: d.email,
        nume: d.nume,
        ultima_editie: d.ultima_editie,
      })),
    });
  }

  const subiectBrut = String(payload.subject ?? "").trim();
  const textBrut = String(payload.text ?? "").trim();
  if (!subiectBrut || !textBrut) return raspuns(400, { error: "missing_content" });
  const sablon = payload.sablon === SABLON_ANUNT ? SABLON_ANUNT : undefined;

  // Configul se citește O DATĂ pentru toată lista, nu per destinatar ca în
  // `loadTemplate`: toți primesc aceeași ediție.
  const config = await deps.loadConfig();
  const subject = fillEventVars(subiectBrut, config);
  const text = fillEventVars(textBrut, config);
  const editie = config?.number;
  const badge = await deps.loadBadge();

  const testTo = String(payload.test_to ?? "").trim();
  if (testTo) {
    if (!EMAIL_RE.test(testTo)) return raspuns(400, { error: "bad_test_to" });
    // Randat pe primul destinatar real, ca testul să arate ce vede un om din
    // listă. DAR fără tokenul lui: un click pe „Dezabonează-te" în emailul de
    // test l-ar fi dezabonat pe el, nu pe operator. Linkurile rămân, ca să se
    // poată verifica aspectul și headerul `List-Unsubscribe`, dar nu duc la
    // nicio dezabonare — funcția `unsubscribe` fără token nu face nimic.
    const model = destinatari[0];
    const body = deps.fillVars(text, model?.nume ?? "Test", testTo);
    const r = await trimiteCuReincercare(
      deps,
      { to: testTo, subject: `[TEST] ${subject}`, text: body },
      badge,
      "https://parktraining.fit/unsubscribe",
      `${deps.supabaseUrl}/functions/v1/unsubscribe`
    );
    await deps.logSends([
      {
        email: testTo,
        subiect: `[TEST] ${subject}`,
        text_email: body,
        mod: "anunt_test",
        audienta: "istoric",
        sablon,
        ok: r.ok,
        provider_status: r.status,
        eroare: r.ok ? undefined : r.body,
        editie,
      },
    ]);
    return raspuns(200, { sent: r.ok ? 1 : 0, failed: r.ok ? 0 : 1 });
  }

  const onceKey = String(payload.once_key ?? "");
  if (!onceKey) return raspuns(400, { error: "missing_once_key" });
  // Lista goală se verifică ÎNAINTEA zăvorului: altfel o trimitere către
  // nimeni ar consuma cheia, iar anunțul real de după ar ieși „deja trimis".
  if (destinatari.length === 0) return raspuns(200, { sent: 0, failed: 0, note: "no_recipients" });

  const first = await deps.rpc<boolean>("broadcast_once", { p_key: onceKey });
  if (first !== true) {
    return raspuns(200, { sent: 0, failed: 0, skipped: true, note: "already_sent" });
  }

  let sent = 0;
  const errors: { to: string; status: number }[] = [];
  const logs: RandJurnalAnunt[] = [];
  for (const [i, d] of destinatari.entries()) {
    if (i > 0) await deps.pauza(PAUZA_ANUNT_MS);
    const body = deps.fillVars(text, d.nume, d.email);
    const r = await trimiteCuReincercare(
      deps,
      { to: d.email, subject, text: body },
      badge,
      linkDezabonarePagina(d.token_unsub),
      linkDezabonareApi(deps.supabaseUrl, d.token_unsub)
    );
    if (r.ok) sent++;
    else errors.push({ to: d.email, status: r.status });
    logs.push({
      email: d.email,
      nume: d.nume,
      subiect: subject,
      text_email: body,
      mod: "anunt",
      audienta: "istoric",
      sablon,
      ok: r.ok,
      provider_status: r.status,
      eroare: r.ok ? undefined : r.body,
      editie,
    });
    // Jurnalul se scrie pe parcurs, nu doar la final. Zăvorul e deja consumat:
    // dacă invocarea moare la jumătatea listei, fără urme scrise nu s-ar mai
    // putea afla cine a primit anunțul și cine nu — iar reluarea ar fi blocată.
    if (logs.length >= LOT_JURNAL) await deps.logSends(logs.splice(0));
  }
  await deps.logSends(logs);
  return raspuns(200, { sent, failed: errors.length, errors });
}

/**
 * Rejucarea unui anunț eșuat, doar pentru persoana respectivă.
 *
 * Un anunț NU se reconstruiește din șablon: operatorul își editează textul
 * înainte de trimitere, deci șablonul ar retrimite alt mesaj decât cel eșuat.
 * `admin_replay_anunt_lookup` întoarce subiectul și textul din jurnal plus
 * tokenul de dezabonare de ACUM — dacă între timp s-a dezabonat, refuzul e al ei.
 * Tokenul de admin e deja verificat de apelant.
 */
export async function rejoacaAnunt(
  token: string,
  logId: string,
  deps: DepsAnunt
): Promise<RaspunsAnunt> {
  const gasit = await deps.rpc<
    {
      ok: boolean;
      motiv: string | null;
      email: string;
      nume: string;
      subiect: string;
      text_email: string;
      token_unsub: string;
      editie: number;
    }[]
  >("admin_replay_anunt_lookup", { p_token: token, p_log_id: logId });
  const plan = gasit && gasit[0];
  if (!plan) return raspuns(500, { error: "lookup_failed" });
  if (!plan.ok) return raspuns(409, { error: "not_replayable", motiv: plan.motiv });

  const badge = await deps.loadBadge();
  const r = await trimiteCuReincercare(
    deps,
    { to: plan.email, subject: plan.subiect, text: plan.text_email },
    badge,
    linkDezabonarePagina(plan.token_unsub),
    linkDezabonareApi(deps.supabaseUrl, plan.token_unsub)
  );
  await deps.logSends([
    {
      email: plan.email,
      nume: plan.nume,
      subiect: plan.subiect,
      text_email: plan.text_email,
      mod: "anunt",
      audienta: "istoric",
      ok: r.ok,
      provider_status: r.status,
      eroare: r.ok ? undefined : r.body,
      editie: plan.editie,
    },
  ]);
  return raspuns(200, { sent: r.ok ? 1 : 0, failed: r.ok ? 0 : 1, mod: "anunt" });
}
