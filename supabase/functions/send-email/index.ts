// Funcție Edge Supabase — trimite emailuri prin Resend, în stilistica Run + Lift.
//
// Moduri:
//  • "admin"     — trimitere în masă din backoffice; necesită token de admin.
//  • "confirm"   — confirmare automată după înscriere (UUID recent).
//  • "broadcast" — trimitere către toți participanții ediției curente; folosit de
//                  reminder-ul programat. Protejat cu secret (header x-broadcast-secret).
//
// Fiecare încercare de trimitere, în orice mod, lasă un rând în `runlift.email_log`
// (via RPC `log_emails`): adresă, subiect, text, status + răspunsul providerului la
// eșec. Adminul îl citește din /admin → „Livrare". Logarea e best-effort — dacă pică,
// emailul rămâne trimis, doar urma se pierde.
//
// Conținutul emailurilor NU e hardcodat aici: subiectul + textul vin din tabelul
// `email_templates` (editabile din /admin → „Șabloane de email"), iar badge-ul din
// capul fiecărui email din `email_templates.event_badge`. Constantele *_FALLBACK de
// mai jos sunt doar plase de siguranță generice (fără dată), folosite doar dacă DB-ul
// nu răspunde — ca să nu pice trimiterea. La ediție nouă NU se mai atinge codul:
// schimbi șabloanele + badge-ul din /admin (sau din DB).

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const MAIL_FROM = Deno.env.get("MAIL_FROM") ?? "Run + Lift <noreply@parktraining.fit>";
// Tabelele/funcțiile Run + Lift stau în schema `runlift` a proiectului ironworks-gym.
const DB_SCHEMA = Deno.env.get("DB_SCHEMA") ?? "runlift";

const CORS = {
  // Doar site-ul propriu poate apela din browser. Apelurile server-side
  // (curl, cron) nu trec prin CORS, deci broadcast-ul manual merge în continuare.
  "Access-Control-Allow-Origin": "https://parktraining.fit",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-broadcast-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

type Message = { to: string; subject: string; text: string };
type Template = { subiect: string; text_email: string };

// Un rând din jurnalul de livrare (`runlift.email_log`). Scriem CÂTE UNUL pentru
// fiecare adresă la care am încercat să trimitem, ca adminul să vadă în /admin →
// „Livrare" cine a primit, cine nu și ce a răspuns providerul.
type LogRow = {
  email: string;
  nume?: string;
  subiect: string;
  text_email: string;
  mod: string;
  audienta?: string;
  ok: boolean;
  provider_status?: number;
  eroare?: string;
  editie?: number;
};

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T | null> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      "Content-Profile": DB_SCHEMA,
    },
    body: JSON.stringify(args),
  });
  if (!res.ok) return null;
  return (await res.json().catch(() => null)) as T | null;
}

// Scrie jurnalul de livrare. Best-effort: dacă RPC-ul pică, trimiterea rămâne
// validă — pierdem doar urma, nu emailul.
async function logSends(rows: LogRow[]): Promise<void> {
  if (rows.length === 0) return;
  try {
    await rpc("log_emails", { p_rows: rows });
  } catch {
    // fără jurnal, dar fără să stricăm răspunsul
  }
}

// Citește un șablon (subiect + text) din `email_templates`, după cheie.
async function loadTemplate(cheie: string): Promise<Template | null> {
  const rows = await rpc<Template[]>("template_lookup", { p_cheie: cheie });
  const t = rows && rows[0];
  return t?.text_email ? t : null;
}

// Badge-ul din capul fiecărui email (ex. „Hyrox Trial · 8 august"), editabil din
// /admin ca șablon cu cheia `event_badge` (textul stă în câmpul „Text").
async function loadBadge(): Promise<string> {
  const t = await loadTemplate("event_badge");
  return t?.text_email?.trim() || BADGE_FALLBACK;
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const fillVars = (text: string, nume: string, email: string, telefon = ""): string =>
  text
    .replace(/\{nume\}/g, nume)
    .replace(/\{prenume\}/g, (nume || "atlet").split(/\s+/)[0])
    .replace(/\{email\}/g, email)
    .replace(/\{telefon\}/g, telefon);

// Șablon HTML în stilistica Run + Lift (dark + lime), robust pentru email.
// `badge` vine din DB (event_badge) — nu e hardcodat pe ediție.
function renderHtml(
  subject: string,
  textBody: string,
  badge: string,
  unsubscribeUrl?: string
): string {
  const paragraphs = esc(textBody)
    .split(/\n{2,}/)
    .map((p) => p.replace(/\n/g, "<br>"))
    .map(
      (p) =>
        `<p style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#C9CCBE;">${p}</p>`
    )
    .join("");

  return `<!doctype html><html lang="ro"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(
    subject
  )}</title></head>
<body style="margin:0;padding:0;background:#0d0f0b;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0d0f0b;padding:28px 12px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:560px;max-width:100%;background:#16180F;border:1px solid #2A2E25;">
        <tr><td style="padding:22px 28px;border-bottom:1px solid #2A2E25;">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td style="background:#C9F24B;width:34px;height:34px;text-align:center;vertical-align:middle;font-family:Arial Black,Arial,sans-serif;font-weight:bold;font-size:15px;color:#121410;">RL</td>
            <td style="padding-left:12px;font-family:Arial Black,Arial,sans-serif;font-weight:bold;font-size:18px;letter-spacing:1px;color:#F1EFE6;text-transform:uppercase;">Run + Lift</td>
          </tr></table>
        </td></tr>
        <tr><td style="padding:12px 28px 4px;">
          <span style="display:inline-block;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;color:#121410;background:#C9F24B;padding:5px 10px;">${esc(
            badge
          )}</span>
        </td></tr>
        <tr><td style="padding:16px 28px 8px;">
          <h1 style="margin:0 0 14px;font-family:Arial Black,Arial,sans-serif;font-size:22px;line-height:1.2;color:#F1EFE6;text-transform:uppercase;">${esc(
            subject
          )}</h1>
          ${paragraphs}
        </td></tr>
        <tr><td style="padding:16px 28px 24px;border-top:1px solid #2A2E25;">
          <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:#9BA08F;">
            <strong style="color:#C9CCBE;">Run + Lift · 2026</strong><br>
            Organizatori: Vladislav Filip · +373 69 509 949 · @vladfillip<br>
            Roma Morari · +373 69 819 404 · @morarroma
          </p>
          ${
            unsubscribeUrl
              ? `<p style="margin:12px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.5;color:#6E7363;">Nu mai vrei aceste emailuri? <a href="${esc(
                  unsubscribeUrl
                )}" style="color:#9BA08F;text-decoration:underline;">Dezabonează-te</a>.</p>`
              : ''
          }
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

async function sendOne(
  m: Message,
  badge: string,
  unsubscribeUrl?: string
): Promise<{ ok: boolean; status: number; body: string }> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: MAIL_FROM,
      to: m.to,
      subject: m.subject,
      text: unsubscribeUrl ? `${m.text}\n\n—\nDezabonare: ${unsubscribeUrl}` : m.text,
      html: renderHtml(m.subject, m.text, badge, unsubscribeUrl),
      // List-Unsubscribe: providerii afișează butonul nativ + îmbunătățește deliverability.
      ...(unsubscribeUrl
        ? { headers: { "List-Unsubscribe": `<${unsubscribeUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } }
        : {}),
    }),
  });
  return { ok: res.ok, status: res.status, body: await res.text().catch(() => "") };
}

// Plase de siguranță GENERICE (fără dată/locație) — folosite doar dacă șablonul
// din DB lipsește sau DB-ul nu răspunde. Conținutul real, pe ediție, stă în
// `email_templates` și se editează din /admin.
const BADGE_FALLBACK = "Run + Lift";

const CONFIRM_SUBJECT_FALLBACK = "Confirmare înscriere — Run + Lift";
const CONFIRM_TEXT_FALLBACK =
  `Salut, {prenume}!\n\n` +
  `Înscrierea ta la Run + Lift este confirmată. Îți trimitem detaliile în curând.\n\n` +
  `Echipa Run + Lift`;

const REMINDER_SUBJECT_FALLBACK = "Reminder — Run + Lift";
const REMINDER_TEXT_FALLBACK =
  `Salut, {prenume}!\n\n` +
  `Ne vedem în curând la Run + Lift. Adu echipament sport, apă și bună dispoziție!\n\n` +
  `Echipa Run + Lift`;

const ANNOUNCE_SUBJECT_FALLBACK = "S-au deschis înscrierile — Run + Lift";
const ANNOUNCE_TEXT_FALLBACK =
  `Salut, {prenume}!\n\n` +
  `S-au deschis înscrierile la Run + Lift. Înscrie-te aici:\nhttps://parktraining.fit\n\n` +
  `Echipa Run + Lift`;

const PROMOTED_SUBJECT_FALLBACK = "Ai loc confirmat — Run + Lift";
const PROMOTED_TEXT_FALLBACK =
  `Salut, {prenume}!\n\n` +
  `S-a eliberat un loc și ai fost mutat de pe lista de așteptare pe lista de participanți. ` +
  `Locul tău la Run + Lift este acum confirmat!\n\n` +
  `Îți trimitem detaliile în curând. Echipa Run + Lift`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  if (!RESEND_API_KEY) return json(500, { error: "resend_not_configured" });

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json(400, { error: "bad_json" });
  }

  const mode = payload.mode;

  // ---- ADMIN: trimitere în masă, protejat cu token de sesiune ----
  if (mode === "admin") {
    const token = String(payload.token ?? "");
    const valid = await rpc<boolean>("admin_check_token", { p_token: token });
    if (valid !== true) return json(401, { error: "invalid_token" });

    const messages = Array.isArray(payload.messages) ? (payload.messages as Message[]) : [];
    if (messages.length === 0) return json(400, { error: "no_recipients" });

    // Metadate doar pentru jurnal — nu schimbă ce se trimite.
    const audienta = payload.audience === "asteptare" ? "asteptare" : "participanti";
    const editie = typeof payload.editie === "number" ? payload.editie : undefined;

    const badge = await loadBadge();
    let sent = 0;
    const errors: { to: string; status: number }[] = [];
    const logs: LogRow[] = [];
    for (const m of messages) {
      if (!m?.to || !m?.subject) continue;
      const r = await sendOne(m, badge);
      if (r.ok) sent++;
      else errors.push({ to: m.to, status: r.status });
      logs.push({
        email: m.to,
        subiect: m.subject,
        text_email: m.text,
        mod: "admin",
        audienta,
        ok: r.ok,
        provider_status: r.status,
        eroare: r.ok ? undefined : r.body,
        editie,
      });
    }
    await logSends(logs);
    return json(200, { sent, failed: errors.length, errors });
  }

  // ---- CONFIRM: confirmare automată pentru o înscriere recentă ----
  // Subiectul + textul vin din șablonul `bulk_participant_confirmare` (DB).
  if (mode === "confirm") {
    const id = String(payload.id ?? "");
    if (!id) return json(400, { error: "missing_id" });
    const rows = await rpc<{ email: string; nume: string }[]>("confirm_lookup", { p_id: id });
    const row = rows && rows[0];
    if (!row?.email) return json(200, { sent: 0, skipped: true });

    const tpl = await loadTemplate("bulk_participant_confirmare");
    const subject = tpl?.subiect || CONFIRM_SUBJECT_FALLBACK;
    const badge = await loadBadge();
    const text = fillVars(tpl?.text_email || CONFIRM_TEXT_FALLBACK, row.nume, row.email);
    const r = await sendOne({ to: row.email, subject, text }, badge);
    await logSends([
      {
        email: row.email,
        nume: row.nume,
        subiect: subject,
        text_email: text,
        mod: "confirm",
        audienta: "participanti",
        ok: r.ok,
        provider_status: r.status,
        eroare: r.ok ? undefined : r.body,
      },
    ]);
    return json(200, { sent: r.ok ? 1 : 0, failed: r.ok ? 0 : 1 });
  }

  // ---- PROMOTED: cineva a fost promovat automat de pe lista de așteptare ----
  // Declanșat de triggerul DB `auto_promote_from_waitlist` (via pg_net) când se
  // eliberează un loc. `id` e înscrierea nou-creată (recentă, ca la `confirm`).
  // Subiectul + textul vin din șablonul `bulk_waitlist_promovare` (editabil din /admin).
  if (mode === "promoted") {
    const id = String(payload.id ?? "");
    if (!id) return json(400, { error: "missing_id" });
    const rows = await rpc<{ email: string; nume: string }[]>("confirm_lookup", { p_id: id });
    const row = rows && rows[0];
    if (!row?.email) return json(200, { sent: 0, skipped: true });

    const tpl = await loadTemplate("bulk_waitlist_promovare");
    const subject = tpl?.subiect || PROMOTED_SUBJECT_FALLBACK;
    const badge = await loadBadge();
    const text = fillVars(tpl?.text_email || PROMOTED_TEXT_FALLBACK, row.nume, row.email);
    const r = await sendOne({ to: row.email, subject, text }, badge);
    await logSends([
      {
        email: row.email,
        nume: row.nume,
        subiect: subject,
        text_email: text,
        mod: "promoted",
        audienta: "participanti",
        ok: r.ok,
        provider_status: r.status,
        eroare: r.ok ? undefined : r.body,
      },
    ]);
    return json(200, { sent: r.ok ? 1 : 0, failed: r.ok ? 0 : 1 });
  }

  // ---- INFO: email de confirmare (double opt-in), ambele formulare ----
  // Șablonul `confirmare` e editabil din backoffice; {{link}} se înlocuiește
  // cu URL-ul unic de confirmare, construit din token-ul rândului.
  if (mode === "info") {
    const email = String(payload.email ?? "").trim();
    if (!email) return json(400, { error: "missing_email" });

    const rows = await rpc<
      {
        email: string;
        nume: string;
        prenume: string;
        token_confirmare: string;
        email_trimis_la: string | null;
      }[]
    >("info_lookup", { p_email: email });
    const row = rows && rows[0];
    if (!row?.email) return json(200, { sent: 0, skipped: true });

    // Cooldown anti-spam: max un email de confirmare la 10 minute per adresă.
    const COOLDOWN_MS = 10 * 60 * 1000;
    if (row.email_trimis_la && Date.now() - Date.parse(row.email_trimis_la) < COOLDOWN_MS) {
      return json(200, { sent: 0, skipped: true, note: "cooldown" });
    }

    const tpl = await loadTemplate("confirmare");
    if (!tpl?.subiect) return json(200, { sent: 0, skipped: true, note: "no_template" });

    const link = `https://parktraining.fit/confirmare?token=${row.token_confirmare}`;
    const text = tpl.text_email
      .replaceAll("{{nume}}", row.nume ?? "")
      .replaceAll("{{prenume}}", row.prenume ?? "")
      .replaceAll("{{email}}", row.email)
      .replaceAll("{{link}}", link);

    const badge = await loadBadge();
    const r = await sendOne({ to: row.email, subject: tpl.subiect, text }, badge);
    await logSends([
      {
        email: row.email,
        nume: `${row.prenume ?? ""} ${row.nume ?? ""}`.trim(),
        subiect: tpl.subiect,
        text_email: text,
        mod: "info",
        audienta: "asteptare",
        ok: r.ok,
        provider_status: r.status,
        eroare: r.ok ? undefined : r.body,
      },
    ]);
    if (r.ok) await rpc("mark_confirmation_sent", { p_email: row.email });
    // Statusul de la provider face eșecurile diagnosticabile din exterior.
    return json(200, {
      sent: r.ok ? 1 : 0,
      failed: r.ok ? 0 : 1,
      ...(r.ok ? {} : { providerStatus: r.status }),
    });
  }

  // ---- BROADCAST: către toți participanții ediției curente (reminder programat) ----
  // Subiectul + textul implicite vin din DB (reminder → `bulk_participant_reminder`,
  // anunț → `bulk_waitlist_anunt`); pot fi suprascrise prin payload.subject/text.
  if (mode === "broadcast") {
    const provided = req.headers.get("x-broadcast-secret") ?? String(payload.secret ?? "");
    const expected = await rpc<string>("broadcast_secret", {});
    if (!expected || provided !== expected) return json(401, { error: "invalid_secret" });

    const audience = payload.audience === "asteptare" ? "asteptare" : "participanti";
    const rpcName = audience === "asteptare" ? "waitlist_recipients" : "edition2_recipients";

    const tplKey =
      audience === "asteptare" ? "bulk_waitlist_anunt" : "bulk_participant_reminder";
    const tpl = await loadTemplate(tplKey);
    const subjFallback =
      audience === "asteptare" ? ANNOUNCE_SUBJECT_FALLBACK : REMINDER_SUBJECT_FALLBACK;
    const textFallback =
      audience === "asteptare" ? ANNOUNCE_TEXT_FALLBACK : REMINDER_TEXT_FALLBACK;

    const subject = String(payload.subject ?? tpl?.subiect ?? subjFallback);
    const text = String(payload.text ?? tpl?.text_email ?? textFallback);
    const recipients =
      (await rpc<{ email: string; nume: string; token_unsub: string }[]>(rpcName, {})) ?? [];
    if (recipients.length === 0) return json(200, { sent: 0, failed: 0, note: "no_recipients" });

    // Idempotență opțională: dacă se dă `once_key`, trimitem o SINGURĂ dată pentru acea cheie
    // (anti-dublură la reminder-ul programat / curl repetat). Broadcast-urile manuale din
    // /admin nu dau cheie, deci pot fi retrimise intenționat.
    const onceKey = typeof payload.once_key === "string" ? payload.once_key : "";
    if (onceKey) {
      const first = await rpc<boolean>("broadcast_once", { p_key: onceKey });
      if (first !== true) return json(200, { sent: 0, skipped: true, note: "already_sent" });
    }

    const badge = await loadBadge();
    let sent = 0;
    const errors: { to: string; status: number }[] = [];
    const logs: LogRow[] = [];
    for (const r of recipients) {
      const unsubUrl = r.token_unsub
        ? `https://parktraining.fit/unsubscribe?token=${r.token_unsub}`
        : undefined;
      const body = fillVars(text, r.nume, r.email);
      const res = await sendOne({ to: r.email, subject, text: body }, badge, unsubUrl);
      if (res.ok) sent++;
      else errors.push({ to: r.email, status: res.status });
      logs.push({
        email: r.email,
        nume: r.nume,
        subiect: subject,
        text_email: body,
        mod: "broadcast",
        audienta: audience,
        ok: res.ok,
        provider_status: res.status,
        eroare: res.ok ? undefined : res.body,
      });
    }
    await logSends(logs);
    return json(200, { sent, failed: errors.length, errors });
  }

  return json(400, { error: "unknown_mode" });
});
