import { test } from "node:test";
import assert from "node:assert/strict";

// Testele de logică nu ating clientul Supabase, deci un runtime pe care
// `supabase-js` nu merge (Node 20, vezi README) ar fi trecut verde prin CI și
// ar fi căzut abia pe Railway, la primul tic. Aici clientul se construiește
// exact ca în bot — cu valori false, fără nicio cerere în rețea.
test("clientul Supabase se construiește pe runtime-ul din CI", async () => {
  process.env.SUPABASE_URL ??= "http://127.0.0.1:9";
  process.env.SUPABASE_SERVICE_ROLE_KEY ??= "ci-fara-cheie";
  const { createAdminClient } = await import("../src/lib/supabase.js");
  assert.ok(createAdminClient().from("bot_config"));
});
