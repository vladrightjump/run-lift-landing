import type { TipBloc, TipPauza } from '../lib/prescriptie';

type Obiect = Record<string, unknown>;
type TinteImport = { repetari?: string | null; incarcare?: number | null; distanta_m?: number | null; durata_sec?: number | null; calorii?: number | null; inaltime_cm?: number | null; putere_w?: number | null; tempo?: string | null };
type SetImport = TinteImport & {
  id_extern: string; exercitiu: number; ordine: number; miscare_id_extern: string; unitate_incarcare: 'kg' | '%1rm';
  tinte_feminine: TinteImport; tinte_text: Record<string, string>; provenienta: Obiect;
  pauza_tip: TipPauza; pauza_sec: number | null; note: string;
};
type BlocImport = {
  id_extern: string; ordine: number; tip: TipBloc; nume: string; ascuns: boolean;
  instructiuni_inainte: string; instructiuni_dupa: string; note_sportiv: string; note_antrenor: string;
  text: string; parametri: Obiect; seturi: SetImport[];
};
/** Contractul JSON v1, separat de scripturile locale și de datele private. */
export type DocumentImport = {
  versiune: 1;
  program: { id_extern: string; nume: string; descriere: string; saptamani: number; zile_pe_saptamana: number; sursa: string };
  miscari: { id_extern: string; nume: string; categorie: string; masuratori: string[]; youtube_id: string | null; sursa: string }[];
  zile: { id_extern: string; saptamana: number; zi: number; titlu: string; blocuri: BlocImport[] }[];
};

const invalid = (): never => { throw new Error('Fișier de import invalid. Alege documentul JSON generat de scriptul WodUp.'); };
const obiect = (v: unknown): Obiect => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Obiect : invalid();
const lista = (v: unknown): unknown[] => Array.isArray(v) ? v : invalid();
const sir = (v: unknown, obligatoriu = false) => typeof v === 'string' && (!obligatoriu || v.trim() !== '') ? v : invalid();
const intreg = (v: unknown, max = Number.MAX_SAFE_INTEGER) => typeof v === 'number' && Number.isSafeInteger(v) && v > 0 && v <= max ? v : invalid();
const numeric = (v: unknown) => v == null || typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : invalid();
const unaDin = (v: unknown, valori: readonly string[]) => typeof v === 'string' && valori.includes(v) ? v : invalid();
const unice = (valori: unknown[]) => { if (new Set(valori).size !== valori.length) invalid(); };
const valideazaTinte = (v: Obiect) => {
  for (const cheie of ['incarcare', 'distanta_m', 'durata_sec', 'calorii', 'inaltime_cm', 'putere_w']) numeric(v[cheie]);
  for (const cheie of ['repetari', 'tempo']) if (v[cheie] != null) sir(v[cheie]);
};

/** Verifică întreaga structură înainte să poată fi trimisă la RPC. */
export const citesteDocumentImport = (continut: string): DocumentImport => {
  let parsed: unknown;
  try { parsed = JSON.parse(continut); } catch { return invalid(); }
  const d = obiect(parsed);
  if (d.versiune !== 1) invalid();
  const p = obiect(d.program);
  for (const c of ['id_extern', 'nume', 'sursa']) sir(p[c], true);
  sir(p.descriere); const saptamani = intreg(p.saptamani); intreg(p.zile_pe_saptamana, 7);
  const miscari = lista(d.miscari).map(obiect);
  for (const m of miscari) {
    sir(m.id_extern, true); sir(m.nume, true); sir(m.categorie); sir(m.sursa);
    lista(m.masuratori).forEach(c => unaDin(c, ['repetari', 'incarcare', 'distanta_m', 'durata_sec', 'calorii', 'inaltime_cm', 'putere_w', 'tempo']));
    if (m.youtube_id !== null && (typeof m.youtube_id !== 'string' || !/^[A-Za-z0-9_-]{11}$/.test(m.youtube_id))) invalid();
  }
  unice(miscari.map(m => m.id_extern));
  const miscariId = new Set(miscari.map(m => m.id_extern));
  const zile = lista(d.zile).map(obiect);
  if (!zile.length) invalid();
  unice(zile.map(z => z.id_extern)); unice(zile.map(z => `${z.saptamana}/${z.zi}`));
  for (const z of zile) {
    sir(z.id_extern, true); intreg(z.saptamana, saptamani); intreg(z.zi, 7); sir(z.titlu);
    const blocuri = lista(z.blocuri).map(obiect); unice(blocuri.map(b => b.id_extern));
    for (const b of blocuri) {
      sir(b.id_extern, true); intreg(b.ordine);
      unaDin(b.tip, ['strength', 'cardio', 'cardio_intervals', 'emom', 'for_time', 'amrap', 'generic', 'warm_up']);
      for (const c of ['nume', 'instructiuni_inainte', 'instructiuni_dupa', 'note_sportiv', 'note_antrenor', 'text']) sir(b[c]);
      if (typeof b.ascuns !== 'boolean') invalid();
      const parametri = obiect(b.parametri);
      for (const c of ['interval_sec', 'durata_sec', 'runde', 'pauza_sec', 'pauza_raport']) numeric(parametri[c]);
      if (parametri.prefix != null) sir(parametri.prefix);
      if (parametri.pauza_tip != null) unaDin(parametri.pauza_tip, ['fara', 'dupa_nevoie', 'fixa', 'interval', 'dupa_timp']);
      const seturi = lista(b.seturi).map(obiect); unice(seturi.map(s => s.id_extern));
      for (const s of seturi) {
        sir(s.id_extern, true); intreg(s.exercitiu); intreg(s.ordine); sir(s.miscare_id_extern, true);
        if (!miscariId.has(s.miscare_id_extern)) invalid();
        valideazaTinte(s); valideazaTinte(obiect(s.tinte_feminine));
        unaDin(s.unitate_incarcare, ['kg', '%1rm']);
        Object.values(obiect(s.tinte_text)).forEach(v => sir(v)); obiect(s.provenienta);
        unaDin(s.pauza_tip, ['fara', 'dupa_nevoie', 'fixa', 'interval', 'dupa_timp']); numeric(s.pauza_sec); sir(s.note);
      }
    }
  }
  return parsed as DocumentImport;
};
