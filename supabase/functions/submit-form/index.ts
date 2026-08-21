// Funcție Edge Supabase — singura poartă de intrare pentru formularele publice.
//
// De ce există: înainte, browserul făcea INSERT direct în PostgREST cu cheia
// publishable (vizibilă în bundle). Orice bot putea da `curl` pe endpoint fără să
// deschidă vreodată site-ul, deci un captcha pus doar în React n-ar fi oprit nimic.
// Acum: RLS nu mai permite INSERT din `anon` (vezi
// `supabase-migration-turnstile-lockdown.sql`), iar scrierea se face DOAR de aici,
// cu cheia de service, după ce token-ul Turnstile a fost verificat la Cloudflare.
//
// Moduri:
//  • "registration" — înscriere la eveniment  → runlift.registrations
//  • "waitlist"     — listă de așteptare      → runlift.event_waitlist
//  • "launch"       — „anunță-mă la lansare"  → runlift.launch_notifications
//
// IMPORTANT — validarea: `service_role` OCOLEȘTE RLS, deci regulile care stăteau
// în `WITH CHECK`-urile politicilor `anon` (acord = true, lungimi, format email,
// `sursa` din listă) sunt reimplementate aici, în `validate*`. Dacă adaugi un mod
// nou, adaugă-i și validarea — altfel lockdown-ul RLS ar slăbi validarea, nu ar
// întări-o.
//
// IMPORTANT — `editie`: NU se acceptă niciodată din client. Coloana are DEFAULT
// `current_event_edition()` / `current_launch_edition()`, deci pur și simplu nu o
// trimitem: ediția o decide serverul, din `app_config`.
//
// Trigger-ele `registrations_guard_trg` (event_full / registration_closed) și
// `event_waitlist_cap_trg` (waitlist_full) rămân active — sunt trigger-e, nu
// politici RLS, deci se aplică și scrierilor făcute cu cheia de service.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
// Aceeași convenție ca în `send-email`: pe proiectele cu chei noi
// (sb_publishable/sb_secret) env-ul legacy poate lipsi, iar căderea pe cheia anon
// ar face insert-urile să pice tăcut după lockdown.
const SERVICE_KEY =
  Deno.env.get("RUNLIFT_SERVICE_KEY") ??
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  Deno.env.get("SUPABASE_ANON_KEY")!;
const DB_SCHEMA = Deno.env.get("DB_SCHEMA") ?? "runlift";
// Secretul Turnstile. Lipsă = verificarea e sărită (dev/preview fără Cloudflare).
const TURNSTILE_SECRET = Deno.env.get("TURNSTILE_SECRET_KEY") ?? "";

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const SITEVERIFY_TIMEOUT_MS = 5_000;
/** Sub atâtea milisecunde de la afișarea formularului, e completare automată. */
const MIN_FORM_MS = 3_000;

// Originile cărora browserul le permite să citească răspunsul. CORS NU e o
// barieră de securitate (un `curl` nu-l respectă) — apărarea reală e Turnstile.
// Listăm și dev server-ul Vite, altfel formularele nu se pot testa local.
const ORIGINI = ["https://parktraining.fit", "http://localhost:5173"];

const corsFor = (req: Request): Record<string, string> => {
  const origin = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ORIGINI.includes(origin) ? origin : ORIGINI[0],
    "Access-Control-Allow-Headers": "authorization, content-type, apikey",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
};

const json = (req: Request, status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsFor(req), "Content-Type": "application/json" },
  });

type Mode = "registration" | "waitlist" | "launch";

const TABLE: Record<Mode, string> = {
  registration: "registrations",
  waitlist: "event_waitlist",
  launch: "launch_notifications",
};

// Aceleași reguli ca în `src/lib/validation.ts` — clientul le aplică pentru UX,
// serverul pentru adevăr.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^\+?\d{8,15}$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SURSE = ["lansare", "despre-noi"];

const normalizePhone = (v: string) => v.replace(/[\s().-]/g, "");
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/* ---------- Verificarea Turnstile ---------- */

type VerifyResult = { ok: true } | { ok: false; motiv: string };

/**
 * Validează token-ul la Cloudflare.
 *
 * Politica de eșec, deliberată:
 *  • token lipsă/invalid    → RESPINGEM. Altfel un bot doar omite token-ul și
 *                             captcha devine decor.
 *  • siteverify inaccesibil → ACCEPTĂM, cu log. E o pană de rețea între noi și
 *                             Cloudflare, pe care un atacator nu o poate provoca;
 *                             pentru un eveniment de 40 de locuri, o înscriere
 *                             pierdută doare mai mult decât câțiva boți strecurați
 *                             într-o fereastră de câteva minute.
 */
async function verifyTurnstile(token: string, ip: string | null): Promise<VerifyResult> {
  if (!TURNSTILE_SECRET) return { ok: true }; // nu e configurat (dev/preview)
  if (!token) return { ok: false, motiv: "missing_token" };

  const body = new FormData();
  body.append("secret", TURNSTILE_SECRET);
  body.append("response", token);
  if (ip) body.append("remoteip", ip);

  try {
    const res = await fetch(SITEVERIFY_URL, {
      method: "POST",
      body,
      signal: AbortSignal.timeout(SITEVERIFY_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.error("turnstile siteverify HTTP", res.status, "— fail-open");
      return { ok: true };
    }
    const data = (await res.json()) as { success?: boolean; "error-codes"?: string[] };
    if (data.success) return { ok: true };
    const codes = (data["error-codes"] ?? []).join(",");
    console.warn("turnstile respins:", codes);
    return { ok: false, motiv: codes || "verification_failed" };
  } catch (err) {
    // Timeout sau rețea căzută spre Cloudflare — vezi politica de mai sus.
    console.error("turnstile siteverify indisponibil — fail-open:", err);
    return { ok: true };
  }
}

/* ---------- Validarea payload-ului (înlocuiește WITH CHECK-urile RLS) ---------- */

type Row = Record<string, unknown>;

/** `registrations` + `event_waitlist` — aceleași câmpuri, aceleași reguli. */
function validateEventRow(data: Row): { row: Row } | { error: string } {
  const nume = str(data.nume);
  const email = str(data.email);
  const telefon = normalizePhone(str(data.telefon));
  const dataNasterii = str(data.dataNasterii);

  if (nume.length < 3) return { error: "nume" };
  if (!EMAIL_RE.test(email)) return { error: "email" };
  if (!PHONE_RE.test(telefon)) return { error: "telefon" };
  if (dataNasterii && !ISO_DATE_RE.test(dataNasterii)) return { error: "data_nasterii" };
  // Vechea politică RLS cerea `acord = true`; regula rămâne, doar locul s-a mutat.
  if (data.acord !== true) return { error: "acord" };

  return {
    row: {
      nume,
      telefon,
      email,
      data_nasterii: dataNasterii || null,
      acord: true,
      // `editie` lipsește intenționat — o pune DEFAULT-ul din DB.
    },
  };
}

/** `launch_notifications` — regulile din politica „anon can subscribe". */
function validateLaunchRow(data: Row): { row: Row } | { error: string } {
  const nume = str(data.nume);
  const prenume = str(data.prenume);
  const email = str(data.email);
  const telefon = normalizePhone(str(data.telefon));
  const sursa = str(data.sursa) || "lansare";

  if (nume.length < 2) return { error: "nume" };
  if (prenume.length < 2) return { error: "prenume" };
  if (!EMAIL_RE.test(email)) return { error: "email" };
  if (!PHONE_RE.test(telefon)) return { error: "telefon" };
  if (!SURSE.includes(sursa)) return { error: "sursa" };

  return { row: { nume, prenume, email, telefon, sursa } };
}

/* ---------- Scrierea ---------- */

/**
 * INSERT prin PostgREST cu cheia de service. Întoarce răspunsul BRUT: statusul și
 * corpul se propagă neschimbate spre client, ca helperele existente din
 * `src/lib/supabase.ts` (`isDuplicateError` pe 409, `isEventFullError` &co. pe
 * textul erorii) să continue să funcționeze fără nicio traducere între straturi.
 */
async function insertRow(table: string, row: Row, id?: string): Promise<Response> {
  return await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      "Content-Profile": DB_SCHEMA,
      Prefer: "return=minimal",
    },
    body: JSON.stringify(id ? { id, ...row } : row),
  });
}

/** Emailul de confirmare/informare — best-effort, nu blochează succesul. */
async function fireEmail(payload: Record<string, unknown>): Promise<void> {
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
      method: "POST",
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error("send-email a eșuat (best-effort):", err);
  }
}

/* ---------- Handler ---------- */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsFor(req) });
  if (req.method !== "POST") return json(req, 405, { error: "method_not_allowed" });

  let payload: Row;
  try {
    payload = (await req.json()) as Row;
  } catch {
    return json(req, 400, { error: "invalid_json" });
  }

  const mode = str(payload.mode) as Mode;
  if (!TABLE[mode]) return json(req, 400, { error: "unknown_mode" });

  // --- Filtre ieftine, înaintea apelului la Cloudflare ---
  // Honeypot: câmp ascuns pe care un om nu-l vede, deci nu-l completează.
  if (str(payload.hp)) {
    console.warn("honeypot completat — respins");
    return json(req, 400, { error: "bot" });
  }
  // Timp pe formular. Valoarea vine din client, deci e falsificabilă — oprește
  // doar botii simpli. E gratuită, nu înlocuiește Turnstile.
  const elapsed = typeof payload.elapsed === "number" ? payload.elapsed : Infinity;
  if (elapsed < MIN_FORM_MS) {
    console.warn("submit prea rapid:", elapsed, "ms — respins");
    return json(req, 400, { error: "too_fast" });
  }

  // --- Captcha ---
  const ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for");
  const verdict = await verifyTurnstile(str(payload.token), ip);
  if (!verdict.ok) return json(req, 403, { error: "captcha_failed", motiv: verdict.motiv });

  // --- Validare + scriere ---
  const data = (payload.data ?? {}) as Row;
  const checked = mode === "launch" ? validateLaunchRow(data) : validateEventRow(data);
  if ("error" in checked) return json(req, 400, { error: `invalid:${checked.error}` });

  // Pentru înscrieri generăm id-ul aici ca să-l putem întoarce clientului
  // (`Prefer: return=minimal` nu întoarce rândul) și să trimitem confirmarea.
  const id = mode === "registration" ? crypto.randomUUID() : undefined;
  const res = await insertRow(TABLE[mode], checked.row, id);

  if (!res.ok) {
    // Propagăm statusul + textul PostgREST ca atare: 409 = duplicat,
    // 400 + "event_full"/"waitlist_full"/"registration_closed" = trigger-ele guard.
    const body = await res.text().catch(() => "");
    return new Response(body, {
      status: res.status,
      headers: { ...corsFor(req), "Content-Type": "application/json" },
    });
  }

  if (mode === "registration" && id) {
    await fireEmail({ mode: "confirm", id });
  } else if (mode === "launch") {
    await fireEmail({ mode: "info", email: str(data.email) });
  }

  return json(req, 200, { ok: true, ...(id ? { id } : {}) });
});
