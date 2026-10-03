import { GYM_TZ } from './fus';

/**
 * Sondajul din grup, văzut din admin: previzualizarea mesajului și momentul în
 * care pleacă următorul.
 *
 * Textul trebuie să iasă IDENTIC cu ce scrie botul (`bot/src/lib/poll-text.ts`),
 * altfel previzualizarea minte exact acolo unde organizatorul o folosește ca să
 * decidă. Fără text salvat, rezultatul e cel de azi, caracter cu caracter.
 * Editabile sunt doar fraza de titlu și cele două butoane (R12); ziua, data,
 * ora și locul rămân automate.
 */

/** Textul de azi, scris în bot. Un câmp gol din setări înseamnă exact ăsta. */
export const TEXT_IMPLICIT = {
  titlu: 'Antrenament mâine',
  da: '✅ Vin!',
  nu: '❌ Nu pot',
} as const;

const RO_DOW = ['Duminică', 'Luni', 'Marți', 'Miercuri', 'Joi', 'Vineri', 'Sâmbătă'];
const RO_MON = ['ian', 'feb', 'mar', 'apr', 'mai', 'iun', 'iul', 'aug', 'sep', 'oct', 'noi', 'dec'];

/** Escapare pentru modul HTML al Telegram. */
const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** `2026-10-07` → „Miercuri, 7 oct"; `null` pentru o dată care nu se citește. */
export const ziSiData = (iso: string): string | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  const [y, l, z] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, l - 1, z));
  return `${RO_DOW[dt.getUTCDay()]}, ${z} ${RO_MON[l - 1]}`;
};

/** Rândul de titlu: fraza (editabilă), apoi ziua, ora și locul (automate). */
export const antetSondaj = (
  dataIso: string,
  ora: string,
  loc: string,
  titlu: string = TEXT_IMPLICIT.titlu
): string => {
  const cand = ziSiData(dataIso);
  const t = (ora || '06:30').slice(0, 5);
  const unde = loc ? ` · 📍 ${esc(loc)}` : '';
  return `🏃 <b>${esc(titlu)}${cand ? ` — ${cand}` : ''}</b>\n🕕 ${t}${unde}`;
};

/** Mesajul întreg: antetul, apoi cine vine și cine nu (doar cei care au răspuns). */
export const corpSondaj = (antet: string, vin: string[], nuVin: string[]): string => {
  const puncte = (nume: string[]) => nume.map((n) => `• ${esc(n)}`);
  const linii = [antet, ''];
  if (vin.length === 0 && nuVin.length === 0) {
    linii.push('Cine vine? Apasă mai jos 👇');
  } else {
    if (vin.length) linii.push(`✅ <b>Vin (${vin.length})</b>`, ...puncte(vin));
    if (nuVin.length) {
      if (vin.length) linii.push('');
      linii.push(`❌ <b>Nu pot (${nuVin.length})</b>`, ...puncte(nuVin));
    }
  }
  return linii.join('\n');
};

export type TextSondaj = {
  titlu: string | null;
  da: string | null;
  nu: string | null;
};

/** Textul efectiv: un câmp gol sau doar spații înseamnă textul de azi. */
export const textEfectiv = (t: TextSondaj): { titlu: string; da: string; nu: string } => ({
  titlu: t.titlu?.trim() || TEXT_IMPLICIT.titlu,
  da: t.da?.trim() || TEXT_IMPLICIT.da,
  nu: t.nu?.trim() || TEXT_IMPLICIT.nu,
});

/** `YYYY-MM-DD` + `n` zile. */
const plusZile = (iso: string, n: number): string => {
  const [y, l, z] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, l - 1, z + n));
  return dt.toISOString().slice(0, 10);
};

const ziuaSaptamanii = (iso: string): number => {
  const [y, l, z] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, l - 1, z)).getUTCDay();
};

/** Ziua și ora de acum, la Chișinău. */
const acumLaChisinau = (acum: Date): { data: string; ora: string } => {
  const parti = new Intl.DateTimeFormat('en-CA', {
    timeZone: GYM_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(acum);
  const p = Object.fromEntries(parti.map((x) => [x.type, x.value]));
  return { data: `${p.year}-${p.month}-${p.day}`, ora: `${p.hour}:${p.minute}` };
};

export type SondajProgramat = {
  /** Ziua în care pleacă sondajul, `YYYY-MM-DD`. */
  data: string;
  /** `HH:MM`. */
  ora: string;
  /** Antrenamentul despre care întreabă: a doua zi (botul întreabă „vii mâine?"). */
  antrenament: string;
};

/**
 * Următorul sondaj programat, sau `null` dacă nu e programat niciunul.
 *
 * Minutul curent încă se socotește „următor": botul trimite în minutul orei
 * din setări, deci la 12:00 fix sondajul de 12:00 n-a plecat neapărat.
 */
export const urmatorulSondaj = (
  zile: number[] | null | undefined,
  ora: string | null | undefined,
  acum: Date
): SondajProgramat | null => {
  if (!zile || zile.length === 0 || !ora || !/^\d{2}:\d{2}$/.test(ora)) return null;
  const { data: azi, ora: acumOra } = acumLaChisinau(acum);
  for (let n = 0; n <= 7; n += 1) {
    const zi = plusZile(azi, n);
    if (!zile.includes(ziuaSaptamanii(zi))) continue;
    if (n === 0 && ora < acumOra) continue;
    return { data: zi, ora, antrenament: plusZile(zi, 1) };
  }
  return null;
};
