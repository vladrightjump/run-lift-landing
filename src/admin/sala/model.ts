import type { SalaAntrenament, SalaDate, SalaMembru } from '../../lib/salaApi';
import { urmatorulSondaj } from './sondaj';
import type { StatSession } from './statistici';

/**
 * Datele grupului, puse în forma de care au nevoie ecranele.
 *
 * Serverul trimite liste plate (membri, antrenamente, răspunsuri), ca o singură
 * cerere să ajungă tuturor ecranelor. Aici se leagă între ele — fără apeluri,
 * deci testabil fără rețea.
 */

/** Antrenamentele în forma pe care o așteaptă statisticile portate din gym-app. */
export const sesiuniPentruStatistici = (d: SalaDate): StatSession[] => {
  const membri = new Map(d.membri.map((m) => [m.id, m]));
  const peSesiune = new Map<string, StatSession['attendance']>();
  for (const r of d.raspunsuri) {
    const m = membri.get(r.member_id);
    const lista = peSesiune.get(r.session_id) ?? [];
    lista.push({
      response: r.response,
      is_first_training: r.is_first_training,
      member: m ? { id: m.id, full_name: m.full_name } : null,
    });
    peSesiune.set(r.session_id, lista);
  }
  return d.antrenamente.map((a) => ({
    id: a.id,
    session_date: a.session_date,
    starts_at: a.starts_at,
    location: a.location,
    status: a.status,
    attendance: peSesiune.get(a.id) ?? [],
  }));
};

/** Zilele de antrenament anulate (`YYYY-MM-DD`), pentru `urmatorulSondaj`. */
export const zileAnulate = (d: SalaDate): Set<string> =>
  new Set(d.antrenamente.filter((a) => a.status === 'cancelled').map((a) => a.session_date));

/**
 * Primul antrenament neanulat de azi încolo (R5), sau `null` când următorul n-are
 * încă rând (botul îl creează când trimite sondajul).
 *
 * Un rând fără sondaj și fără voturi (o zi reactivată, poate peste două
 * săptămâni) nu e următorul dacă orarul trimite înainte sondajul pentru o zi mai
 * apropiată: aia vine întâi, deși n-are rând. La fel judecă și cardul de pe
 * pornire (`textCard`).
 */
export const antrenamentulUrmator = (d: SalaDate, acum: Date): SalaAntrenament | null => {
  const rand =
    d.antrenamente
      .filter((a) => a.status !== 'cancelled' && a.session_date >= d.azi)
      .sort((a, b) => a.session_date.localeCompare(b.session_date))[0] ?? null;
  if (!rand || rand.poll_sent || d.raspunsuri.some((r) => r.session_id === rand.id)) return rand;
  const s = urmatorulSondaj(d.config?.poll_days, d.config?.poll_time, acum, zileAnulate(d));
  return s && s.antrenament < rand.session_date ? null : rand;
};

export type CineVine = {
  vin: SalaMembru[];
  nuVin: SalaMembru[];
  /** Membrii activi, cu cont de Telegram, care n-au răspuns. */
  nuAuRaspuns: SalaMembru[];
};

const dupaNume = (a: SalaMembru, b: SalaMembru) => a.full_name.localeCompare(b.full_name, 'ro');

/**
 * Cine vine, cine nu și cine n-a răspuns la un antrenament.
 *
 * „N-au răspuns" îi numără doar pe cei care AR FI putut răspunde: activi și cu
 * cont de Telegram. Un membru inactiv sau fără cont nu primește sondajul, deci
 * n-are ce să lipsească.
 */
export const cineVine = (d: SalaDate, sesiune: string): CineVine => {
  const membri = new Map(d.membri.map((m) => [m.id, m]));
  const vin: SalaMembru[] = [];
  const nuVin: SalaMembru[] = [];
  const auRaspuns = new Set<string>();
  for (const r of d.raspunsuri) {
    if (r.session_id !== sesiune || auRaspuns.has(r.member_id)) continue;
    auRaspuns.add(r.member_id);
    const m = membri.get(r.member_id);
    if (!m) continue;
    (r.response === 'yes' ? vin : nuVin).push(m);
  }
  const nuAuRaspuns = d.membri.filter(
    (m) => m.status === 'active' && m.telegram_user_id != null && !auRaspuns.has(m.id)
  );
  return { vin: vin.sort(dupaNume), nuVin: nuVin.sort(dupaNume), nuAuRaspuns: nuAuRaspuns.sort(dupaNume) };
};

/**
 * Membrii pe care sondajul nu-i întreabă — fără cont de Telegram, sau în pauză —
 * și care n-au răspuns la antrenament. Prezența lor se pune doar de mână (R6),
 * ca în gym-app. Cine a ieșit din grup nu apare.
 */
export const deMarcatDeMana = (d: SalaDate, sesiune: string): SalaMembru[] => {
  const auRaspuns = new Set(d.raspunsuri.filter((r) => r.session_id === sesiune).map((r) => r.member_id));
  return d.membri
    .filter(
      (m) =>
        m.status !== 'cancelled' &&
        !(m.status === 'active' && m.telegram_user_id != null) &&
        !auRaspuns.has(m.id)
    )
    .sort(dupaNume);
};

/** Răspunsul unui membru la un antrenament, sau `null`. */
export const raspunsul = (d: SalaDate, sesiune: string, membru: string): 'yes' | 'no' | null =>
  d.raspunsuri.find((r) => r.session_id === sesiune && r.member_id === membru)?.response ?? null;
