import type { SalaDate, SalaMembru } from '../../lib/salaApi';
import type { Breakdown, StatSession } from './statistici';
import { RO_DOW, ziuaSaptamanii } from './sondaj';

/**
 * Calculele ecranului „Analiza prezențelor" care nu stau deja în `statistici.ts`.
 *
 * Portate din gym-app (`components/AnalizaView.tsx`, `lib/attendance-actions.ts`
 * → `getMemberHistory`), cu aceleași praguri: „inactiv" înseamnă mai mult de 14
 * zile de la ultima prezență, iar tendința compară ultimele 4 antrenamente cu
 * cele 4 dinainte, cu un prag de 12 puncte.
 */

export type StareFrecventa = 'activ' | 'inactiv' | 'niciodata';

const zileIntre = (dinIso: string, panaIso: string): number => {
  const [ay, am, ad] = dinIso.slice(0, 10).split('-').map(Number);
  const [ty, tm, td] = panaIso.split('-').map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
};

export const stareFrecventa = (prezente: number, ultima: string | null, azi: string): StareFrecventa => {
  if (prezente === 0 || !ultima) return 'niciodata';
  return zileIntre(ultima, azi) > 14 ? 'inactiv' : 'activ';
};

export type RandFrecventa = {
  membru: SalaMembru;
  prezente: number;
  /** Antrenamentele care au avut loc, numitorul frecvenței. */
  total: number;
  ultima: string | null;
  stare: StareFrecventa;
};

/**
 * Prezențele fiecărui membru: la ce antrenamente a venit și când ultima dată.
 *
 * Doar antrenamentele care AU AVUT LOC — neanulate, de azi înapoi. Un „vin"
 * pentru mâine e o promisiune, nu o prezență.
 */
export const prezentePeMembru = (
  d: SalaDate
): { sesiuni: Map<string, Set<string>>; ultima: Map<string, string> } => {
  const ziua = new Map(
    d.antrenamente
      .filter((a) => a.status !== 'cancelled' && a.session_date <= d.azi)
      .map((a) => [a.id, a.session_date])
  );
  const sesiuni = new Map<string, Set<string>>();
  const ultima = new Map<string, string>();
  for (const r of d.raspunsuri) {
    const data = ziua.get(r.session_id);
    if (r.response !== 'yes' || !data) continue;
    const set = sesiuni.get(r.member_id) ?? new Set<string>();
    set.add(r.session_id);
    sesiuni.set(r.member_id, set);
    if ((ultima.get(r.member_id) ?? '') < data) ultima.set(r.member_id, data);
  }
  return { sesiuni, ultima };
};

/** Frecvența fiecărui membru care n-a ieșit din grup. */
export const randuriFrecventa = (d: SalaDate): RandFrecventa[] => {
  const total = d.antrenamente.filter((a) => a.status !== 'cancelled' && a.session_date <= d.azi).length;
  const { sesiuni: prezente, ultima } = prezentePeMembru(d);
  return d.membri
    .filter((m) => m.status !== 'cancelled')
    .map((m) => {
      const n = prezente.get(m.id)?.size ?? 0;
      const u = ultima.get(m.id) ?? null;
      return { membru: m, prezente: n, total, ultima: u, stare: stareFrecventa(n, u, d.azi) };
    });
};

export type IstoricMembru = {
  /** Cel mai nou primul, cel mult 20. */
  istoric: { data: string; raspuns: 'yes' | 'no' | null }[];
  prezente: number;
  total: number;
  procent: number;
  tendinta: 'sus' | 'jos' | 'egal';
};

/** Istoricul unui membru pe ultimele antrenamente care au avut loc. */
export const istoricMembru = (d: SalaDate, membru: string): IstoricMembru => {
  const sesiuni = d.antrenamente
    .filter((a) => a.status !== 'cancelled' && a.session_date <= d.azi)
    .sort((a, b) => b.session_date.localeCompare(a.session_date))
    .slice(0, 20);
  const raspuns = new Map(
    d.raspunsuri.filter((r) => r.member_id === membru).map((r) => [r.session_id, r.response])
  );
  const istoric = sesiuni.map((s) => ({ data: s.session_date, raspuns: raspuns.get(s.id) ?? null }));
  const total = istoric.length;
  const prezente = istoric.filter((h) => h.raspuns === 'yes').length;
  const rata = (felie: typeof istoric) =>
    felie.length ? felie.filter((h) => h.raspuns === 'yes').length / felie.length : 0;
  const recent = rata(istoric.slice(0, 4));
  const inainte = rata(istoric.slice(4, 8));
  return {
    istoric,
    prezente,
    total,
    procent: total ? Math.round((prezente / total) * 100) : 0,
    tendinta: recent - inainte > 0.12 ? 'sus' : inainte - recent > 0.12 ? 'jos' : 'egal',
  };
};

const ORDINE_ZILE = ['Luni', 'Marți', 'Miercuri', 'Joi', 'Vineri', 'Sâmbătă', 'Duminică'];

/** Prezența medie (procent „vin") pe zile ale săptămânii, de luni încolo. */
export const peZileleSaptamanii = (
  sesiuni: StatSession[],
  defalcari: Breakdown[]
): { zi: string; procent: number }[] => {
  const pe = new Map<string, number[]>();
  sesiuni.forEach((s, i) => {
    const zi = RO_DOW[ziuaSaptamanii(s.session_date)];
    pe.set(zi, [...(pe.get(zi) ?? []), defalcari[i].yesPct]);
  });
  return [...pe.entries()]
    .map(([zi, v]) => ({ zi, procent: Math.round(v.reduce((a, b) => a + b, 0) / v.length) }))
    .sort((a, b) => ORDINE_ZILE.indexOf(a.zi) - ORDINE_ZILE.indexOf(b.zi));
};
