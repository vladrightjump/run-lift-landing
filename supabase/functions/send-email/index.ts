// Funcție Edge Supabase — trimite emailuri prin Resend, în stilistica Run + Lift.
//
// Moduri:
//  • "admin"     — trimitere în masă din backoffice; necesită token de admin.
//  • "confirm"   — confirmare automată după înscriere (UUID recent).
//  • "broadcast" — trimitere către toți participanții ediției curente; folosit de
//                  reminder-ul programat. Protejat cu secret (header x-broadcast-secret).

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const MAIL_FROM = Deno.env.get("MAIL_FROM") ?? "Run + Lift <noreply@parktraining.fit>";

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

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T | null> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  if (!res.ok) return null;
  return (await res.json().catch(() => null)) as T | null;
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
function renderHtml(subject: string, textBody: string): string {
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
          <span style="display:inline-block;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;color:#121410;background:#C9F24B;padding:5px 10px;">HYROX Style Race · 18 iulie</span>
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
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

async function sendOne(m: Message): Promise<{ ok: boolean; status: number; body: string }> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: MAIL_FROM,
      to: m.to,
      subject: m.subject,
      text: m.text,
      html: renderHtml(m.subject, m.text),
    }),
  });
  return { ok: res.ok, status: res.status, body: await res.text().catch(() => "") };
}

const CONFIRM_SUBJECT = "Confirmare înscriere — HYROX, 18 iulie";
const CONFIRM_TEXT =
  `Salut, {prenume}!\n\n` +
  `Înscrierea ta la Run + Lift — HYROX Style Race este confirmată.\n\n` +
  `• Când: sâmbătă, 18 iulie 2026, ora 07:00\n` +
  `• Unde: Parcul Râșcani, Str. Braniștii, Chișinău\n` +
  `• Vino cu 30 de minute înainte pentru check-in și încălzire.\n\n` +
  `Adu apă pentru hidratare și bună dispoziție. Ne vedem la start!\n\n` +
  `Echipa Run + Lift`;

const REMINDER_SUBJECT = "Mâine e ziua — HYROX, 18 iulie, 07:00";
const REMINDER_TEXT =
  `Salut, {prenume}!\n\n` +
  `Îți reamintim că Run + Lift — HYROX Style Race are loc mâine, sâmbătă 18 iulie, ora 07:00, la Parcul Râșcani (Str. Braniștii).\n\n` +
  `• Check-in de la 06:30, start fix la 07:00\n` +
  `• Adu: echipament sport, apă pentru hidratare și bună dispoziție\n\n` +
  `Dacă nu mai poți participa, răspunde la acest email ca să eliberăm locul.\n\n` +
  `Ne vedem la start!\nEchipa Run + Lift`;

const ANNOUNCE_SUBJECT = "S-au deschis înscrierile — HYROX, 18 iulie";
const ANNOUNCE_TEXT =
  `Salut, {prenume}!\n\n` +
  `Evenimentul pe care îl așteptai e aici: Run + Lift — HYROX Style Race, sâmbătă 18 iulie 2026, ora 07:00, la Parcul Râșcani (Str. Braniștii), Chișinău.\n\n` +
  `Cursă în stil HYROX în aer liber — alergi, treci stația, repeți, contra cronometru. Locuri limitate.\n\n` +
  `Înscrie-te aici:\nhttps://parktraining.fit\n\n` +
  `Ne vedem la start!\nEchipa Run + Lift`;

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

    let sent = 0;
    const errors: { to: string; status: number }[] = [];
    for (const m of messages) {
      if (!m?.to || !m?.subject) continue;
      const r = await sendOne(m);
      if (r.ok) sent++;
      else errors.push({ to: m.to, status: r.status });
    }
    return json(200, { sent, failed: errors.length, errors });
  }

  // ---- CONFIRM: confirmare automată pentru o înscriere recentă ----
  if (mode === "confirm") {
    const id = String(payload.id ?? "");
    if (!id) return json(400, { error: "missing_id" });
    const rows = await rpc<{ email: string; nume: string }[]>("confirm_lookup", { p_id: id });
    const row = rows && rows[0];
    if (!row?.email) return json(200, { sent: 0, skipped: true });
    const text = fillVars(CONFIRM_TEXT, row.nume, row.email);
    const r = await sendOne({ to: row.email, subject: CONFIRM_SUBJECT, text });
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

    const tpl = await rpc<{ subiect: string; text_email: string }[]>("template_lookup", {
      p_cheie: "confirmare",
    });
    const t = tpl && tpl[0];
    if (!t?.subiect) return json(200, { sent: 0, skipped: true, note: "no_template" });

    const link = `https://parktraining.fit/confirmare?token=${row.token_confirmare}`;
    const text = t.text_email
      .replaceAll("{{nume}}", row.nume ?? "")
      .replaceAll("{{prenume}}", row.prenume ?? "")
      .replaceAll("{{email}}", row.email)
      .replaceAll("{{link}}", link);

    const r = await sendOne({ to: row.email, subject: t.subiect, text });
    if (r.ok) await rpc("mark_confirmation_sent", { p_email: row.email });
    // Statusul de la provider face eșecurile diagnosticabile din exterior.
    return json(200, {
      sent: r.ok ? 1 : 0,
      failed: r.ok ? 0 : 1,
      ...(r.ok ? {} : { providerStatus: r.status }),
    });
  }

  // ---- BROADCAST: către toți participanții ediției 2 (reminder programat) ----
  if (mode === "broadcast") {
    const provided = req.headers.get("x-broadcast-secret") ?? String(payload.secret ?? "");
    const expected = await rpc<string>("broadcast_secret", {});
    if (!expected || provided !== expected) return json(401, { error: "invalid_secret" });

    const audience = payload.audience === "asteptare" ? "asteptare" : "participanti";
    const rpcName = audience === "asteptare" ? "waitlist_recipients" : "edition2_recipients";
    const subject = String(payload.subject ?? (audience === "asteptare" ? ANNOUNCE_SUBJECT : REMINDER_SUBJECT));
    const text = String(payload.text ?? (audience === "asteptare" ? ANNOUNCE_TEXT : REMINDER_TEXT));
    const recipients = (await rpc<{ email: string; nume: string }[]>(rpcName, {})) ?? [];
    if (recipients.length === 0) return json(200, { sent: 0, failed: 0, note: "no_recipients" });

    let sent = 0;
    const errors: { to: string; status: number }[] = [];
    for (const r of recipients) {
      const res = await sendOne({ to: r.email, subject, text: fillVars(text, r.nume, r.email) });
      if (res.ok) sent++;
      else errors.push({ to: r.email, status: res.status });
    }
    return json(200, { sent, failed: errors.length, errors });
  }

  return json(400, { error: "unknown_mode" });
});
