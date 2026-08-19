// Funcție Edge Supabase — dezabonare one-click (RFC 8058) pentru emailurile Run + Lift.
//
// De ce există: header-ul `List-Unsubscribe-Post: One-Click` promite providerilor
// (Gmail/Apple) că pot dezabona printr-un POST, fără interacțiune. Pagina SPA
// `/unsubscribe` (rewrite Vercel către index.html) NU procesează un POST — JS-ul nu
// rulează la un POST server-to-server — deci one-click-ul rămânea nefuncțional:
// utilizatorul credea că s-a dezabonat, dar în DB rămânea abonat. Funcția asta îl onorează.
//
//  • POST (one-click): dezabonează pe loc tokenul din query (`?token=UUID`), 200.
//  • GET  (navigare umană): redirect 302 la pagina brandată /unsubscribe, care afișează
//    confirmarea și cheamă același RPC. GET-ul NU dezabonează singur — altfel un scanner
//    de linkuri care doar deschide URL-ul ar dezabona pe cineva fără voia lui (motivul
//    pentru care RFC 8058 cere POST).
//
// Tokenul (UUID) e secretul. RPC-ul `runlift.unsubscribe` e SECURITY DEFINER + grant anon;
// nu returnează date personale, doar starea.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const KEY =
  Deno.env.get("RUNLIFT_SERVICE_KEY") ??
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  Deno.env.get("SUPABASE_ANON_KEY")!;
const DB_SCHEMA = Deno.env.get("DB_SCHEMA") ?? "runlift";
const PAGE = "https://parktraining.fit/unsubscribe";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

async function unsub(token: string): Promise<void> {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/rpc/unsubscribe`, {
      method: "POST",
      headers: {
        apikey: KEY,
        Authorization: `Bearer ${KEY}`,
        "Content-Type": "application/json",
        "Content-Profile": DB_SCHEMA,
      },
      body: JSON.stringify({ p_token: token }),
    });
  } catch {
    // best-effort: nu blocăm răspunsul dacă RPC-ul pică
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const url = new URL(req.url);
  const token = url.searchParams.get("token") ?? "";

  // One-click (RFC 8058): providerul face POST la exact URI-ul din List-Unsubscribe.
  if (req.method === "POST") {
    if (token) await unsub(token);
    return new Response("ok", { status: 200, headers: { ...CORS, "Content-Type": "text/plain" } });
  }

  // Navigare umană: du-l la pagina brandată (care afișează starea + cheamă RPC-ul).
  if (req.method === "GET") {
    const to = token ? `${PAGE}?token=${encodeURIComponent(token)}` : PAGE;
    return new Response(null, { status: 302, headers: { ...CORS, Location: to } });
  }

  return new Response("method_not_allowed", { status: 405, headers: CORS });
});
