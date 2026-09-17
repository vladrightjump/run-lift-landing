/**
 * `Deno`, cât să treacă `tsc` peste funcțiile Edge importate de teste.
 *
 * Fișierele din `supabase/functions/` rulează pe Deno și nu sunt în `tsconfig`-ul
 * aplicației. De când testele le încarcă (vezi `harness.ts`), intră în
 * `tsconfig.tests.json` — iar acolo `Deno` nu există. Harness-ul îl înlocuiește
 * la rulare; declarația de aici e doar pentru verificarea de tipuri.
 */
declare const Deno: {
  env: { get(cheie: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};
