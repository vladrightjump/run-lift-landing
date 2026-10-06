import type { EventConfig } from '../content/eventConfig';
import type { ComandaAcum, SalaComanda, SalaDate } from '../lib/salaApi';
import { reperele, type Reper } from './reperele';
import { antrenamentulUrmator, cineVine, zileAnulate } from './sala/model';
import { frazaSondaj, numeZi, plusZile, urmatorulSondaj, ziuaSaptamanii } from './sala/sondaj';
import { stareBot } from './sala/stareBot';
import type { EcranAdmin, FazaSite, SemnaleAdmin } from './stareCurenta';
import { semnaleDeAtentie } from './stareCurenta';

/**
 * Ecranul Acum, partea de calcul (U8, KTD9 din planul redesignului).
 *
 * Totul se compune din ce adminul are deja: datele grupului din parc, configul
 * publicat al ediției și semnalele de atenție. Nicio cerere nouă la server.
 * Funcții pure, ca săptămâna să se poată verifica fără un ecran.
 */

const LUNI = [
  'ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie',
  'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie',
];
const SCURT = ['Du', 'Lu', 'Ma', 'Mi', 'Jo', 'Vi', 'Sâ'];

/** Ziua de azi la Chișinău, `YYYY-MM-DD`. */
export const aziLaChisinau = (acum: Date): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Chisinau',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(acum);

const parti = (iso: string) => {
  const [y, l, z] = iso.split('-').map(Number);
  return { y, l, z };
};

/** Numărul săptămânii ISO (luni–duminică; săptămâna 1 conține prima joi). */
const saptamanaIso = (iso: string): number => {
  const { y, l, z } = parti(iso);
  const d = new Date(Date.UTC(y, l - 1, z));
  const zi = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - zi);
  const inceput = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - inceput.getTime()) / 86_400_000 + 1) / 7);
};

type ZiSaptamana = { data: string; scurt: string; numar: number; azi: boolean };
export type Saptamana = { numar: number; interval: string; zile: ZiSaptamana[] };

/** Săptămâna (luni–duminică) care conține ziua de azi. */
export const saptamana = (azi: string): Saptamana => {
  const luni = plusZile(azi, -((ziuaSaptamanii(azi) + 6) % 7));
  const zile = Array.from({ length: 7 }, (_, i) => {
    const data = plusZile(luni, i);
    return { data, scurt: SCURT[ziuaSaptamanii(data)], numar: parti(data).z, azi: data === azi };
  });
  const a = parti(zile[0].data);
  const b = parti(zile[6].data);
  const interval =
    a.l === b.l ? `${a.z}–${b.z} ${LUNI[b.l - 1]}` : `${a.z} ${LUNI[a.l - 1]} – ${b.z} ${LUNI[b.l - 1]}`;
  return { numar: saptamanaIso(azi), interval, zile };
};

export type TipEveniment = 'trecut' | 'sondaj' | 'antrenament' | 'termen' | 'cursa' | 'anuntul' | 'anulat';

export type EvenimentZi = {
  cheie: string;
  tip: TipEveniment;
  titlu: string;
  detaliu: string;
  /** Unde duce un clic, când evenimentul are un ecran al lui. */
  ecran?: EcranAdmin;
};

export type ZiCuEvenimente = ZiSaptamana & { evenimente: EvenimentZi[] };

export type EditieAcum = {
  config: EventConfig;
  /** `null` cât timp lista de înscrieri n-a sosit. */
  inscrisi: number | null;
  asteptare: number | null;
};

const ora = (localIso: string) => localIso.slice(11, 16);
const ziuaDin = (localIso: string) => localIso.slice(0, 10);
const numeZiMic = (iso: string) => numeZi(iso).toLowerCase();

const pluralVin = (n: number) => `${n} ${n === 1 ? 'vine' : 'vin'}`;
const pluralAuVenit = (n: number) => `${n} ${n === 1 ? 'a venit' : 'au venit'}`;

/** Ce stă în fiecare zi a săptămânii (R8). */
export const evenimenteleSaptamanii = (
  s: Saptamana,
  sala: SalaDate | null,
  editie: EditieAcum,
  acum: Date
): ZiCuEvenimente[] => {
  const azi = sala?.azi ?? aziLaChisinau(acum);
  const pe = new Map<string, EvenimentZi[]>(s.zile.map((z) => [z.data, []]));
  const adauga = (data: string, e: EvenimentZi) => pe.get(data)?.push(e);

  if (sala) {
    const cfg = sala.config;
    const sondaj = urmatorulSondaj(cfg?.poll_days, cfg?.poll_time, acum, zileAnulate(sala));
    const randuri = new Map(sala.antrenamente.map((a) => [a.session_date, a]));

    // Zilele de antrenament: rândurile existente plus cele pe care orarul
    // sondajului le programează (botul creează rândul abia când trimite).
    const zileAntrenament = new Set(
      s.zile
        .map((z) => z.data)
        .filter(
          (d) =>
            randuri.has(d) ||
            (d >= azi && cfg?.poll_days?.includes(ziuaSaptamanii(plusZile(d, -1))))
        )
    );

    for (const data of zileAntrenament) {
      const rand = randuri.get(data);
      if (rand?.status === 'cancelled') {
        adauga(data, { cheie: `antr-${data}`, tip: 'anulat', titlu: 'Antrenament anulat', detaliu: rand.starts_at });
        continue;
      }
      const oraAntr = rand?.starts_at ?? cfg?.training_time ?? '';
      const ziSondaj = plusZile(data, -1);

      if (data < azi && rand) {
        adauga(data, {
          cheie: `antr-${data}`,
          tip: 'trecut',
          titlu: 'Antrenament',
          detaliu: pluralAuVenit(cineVine(sala, rand.id).vin.length),
          ecran: 'grup-analiza',
        });
        continue;
      }

      const cuRaspunsuri = rand && (rand.poll_sent || sala.raspunsuri.some((r) => r.session_id === rand.id));
      let detaliu: string;
      if (cuRaspunsuri) {
        const c = cineVine(sala, rand.id);
        detaliu = `${pluralVin(c.vin.length)} · ${c.nuAuRaspuns.length} fără răspuns`;
      } else if (sondaj && sondaj.antrenament === data) {
        // R37: înainte de sondaj nimeni nu e „fără răspuns" — n-a fost întrebat.
        detaliu = `Sondajul pleacă ${numeZiMic(sondaj.data)} la ${sondaj.ora}`;
      } else {
        detaliu = 'Sondajul n-a plecat încă';
      }
      adauga(data, {
        cheie: `antr-${data}`,
        tip: 'antrenament',
        titlu: `Antrenament ${oraAntr}`.trim(),
        detaliu,
        ecran: 'grup-prezente',
      });

      if (pe.has(ziSondaj) && (rand?.poll_sent || ziSondaj >= azi) && cfg?.poll_time) {
        adauga(ziSondaj, {
          cheie: `sondaj-${ziSondaj}`,
          tip: 'sondaj',
          titlu: rand?.poll_sent ? 'Sondaj trimis' : 'Sondaj',
          detaliu: `${cfg.poll_time} · pentru ${numeZiMic(data)}`,
        });
      }
    }
  }

  const c = editie.config;
  for (const r of reperele(c, acum.getTime())) {
    const data = ziuaDin(r.moment);
    if (!pe.has(data)) continue;
    if (r.cheie === 'registrationDeadline') {
      adauga(data, { cheie: r.id, tip: 'termen', titlu: 'Se închid înscrierile', detaliu: `${ora(r.moment)} · Ediția ${c.number}`, ecran: 'participanti' });
    } else if (r.cheie === 'start') {
      const locuri = editie.inscrisi === null ? '' : `${editie.inscrisi}/${c.slots.total} · `;
      adauga(data, { cheie: r.id, tip: 'cursa', titlu: `${c.eventName} · Ed. ${c.number}`, detaliu: `${locuri}start ${ora(r.moment)}`, ecran: 'participanti' });
    } else if (r.cheie === 'launchAt') {
      adauga(data, { cheie: r.id, tip: 'anuntul', titlu: 'Se anunță ediția', detaliu: ora(r.moment), ecran: 'eveniment' });
    }
  }

  // În aceeași zi, în ordinea în care se întâmplă: sondajul de seara de dinainte
  // nu stă deasupra antrenamentului de dimineață, dar e o zi diferită oricum.
  const ordine: Record<TipEveniment, number> = { trecut: 0, anulat: 0, antrenament: 1, sondaj: 2, anuntul: 3, termen: 4, cursa: 5 };
  return s.zile.map((z) => ({ ...z, evenimente: (pe.get(z.data) ?? []).sort((a, b) => ordine[a.tip] - ordine[b.tip]) }));
};

export type CardAntrenament =
  | { stare: 'oprit' }
  | { stare: 'fara-orar' }
  | {
      stare: 'asteapta-sondajul';
      data: string;
      ora: string;
      loc: string;
      fraza: string;
      vin: 0;
      nu: 0;
      fara: 0;
    }
  | {
      stare: 'cu-raspunsuri';
      data: string;
      ora: string;
      loc: string;
      vin: number;
      nu: number;
      fara: number;
      numeFara: string[];
    };

/** Cardul antrenamentului următor (R8, R10, R37). */
export const cardAntrenament = (sala: SalaDate, acum: Date): CardAntrenament => {
  const cfg = sala.config;
  if (cfg && !cfg.enabled) return { stare: 'oprit' };
  const rand = antrenamentulUrmator(sala, acum);
  const sondaj = urmatorulSondaj(cfg?.poll_days, cfg?.poll_time, acum, zileAnulate(sala));

  if (rand && (rand.poll_sent || sala.raspunsuri.some((r) => r.session_id === rand.id))) {
    const c = cineVine(sala, rand.id);
    return {
      stare: 'cu-raspunsuri',
      data: rand.session_date,
      ora: rand.starts_at,
      loc: rand.location,
      vin: c.vin.length,
      nu: c.nuVin.length,
      fara: c.nuAuRaspuns.length,
      numeFara: c.nuAuRaspuns.map((m) => m.full_name),
    };
  }
  const data = rand?.session_date ?? sondaj?.antrenament;
  if (!data) return { stare: 'fara-orar' };
  return {
    stare: 'asteapta-sondajul',
    data,
    ora: rand?.starts_at ?? cfg?.training_time ?? '',
    loc: rand?.location ?? cfg?.location ?? '',
    fraza: sondaj && sondaj.antrenament === data ? frazaSondaj(sondaj) : 'Sondajul n-a plecat încă.',
    vin: 0,
    nu: 0,
    fara: 0,
  };
};

export type ElementDeRezolvat = {
  cheie: string;
  titlu: string;
  detaliu: string;
  urgent: boolean;
  actiune?: { eticheta: string; ecran?: EcranAdmin; reia?: ComandaAcum; inAsteptare?: boolean };
};

const NUME_COMANDA: Record<SalaComanda['action'], string> = {
  send_poll: 'Sondajul',
  send_summary: 'Rezumatul',
  send_reminder: 'Reminderul',
  send_message: 'Mesajul în grup',
  kick_member: 'Scoaterea din grup',
};

const oraLaChisinau = (iso: string): string =>
  new Intl.DateTimeFormat('ro-RO', { timeZone: 'Europe/Chisinau', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));

/**
 * „De rezolvat" (R9): semnalele care cer o acțiune, fiecare cu acțiunea ei.
 * Arhiva nu intră — ține de ediția aleasă, nu de ce trebuie făcut azi.
 */
export const deRezolvat = (
  semnale: SemnaleAdmin,
  faza: FazaSite,
  sala: SalaDate | null,
  acum: Date
): ElementDeRezolvat[] => {
  const out: ElementDeRezolvat[] = [];
  for (const s of semnaleDeAtentie(semnale, faza)) {
    if (s.cheie === 'nelivrate') {
      out.push({
        cheie: s.cheie,
        titlu: `${semnale.nelivrate} ${semnale.nelivrate === 1 ? 'email nelivrat' : 'emailuri nelivrate'}`,
        detaliu: 'Vezi cui nu i-a ajuns și de ce.',
        urgent: true,
        actiune: { eticheta: 'Vezi', ecran: 'livrare' },
      });
    } else if (s.cheie === 'ciorna') {
      out.push({ cheie: s.cheie, titlu: 'Ciornă nepublicată', detaliu: 'Ai o ciornă salvată care n-a ajuns pe site.', urgent: false, actiune: { eticheta: 'Deschide', ecran: 'eveniment' } });
    } else if (s.cheie === 'meta') {
      out.push({ cheie: s.cheie, titlu: 'Previzualizarea a rămas în urmă', detaliu: 'Share preview-ul e în urma configului publicat — cere un deploy.', urgent: false });
    } else if (s.cheie === 'asteptare') {
      out.push({
        cheie: s.cheie,
        titlu: `${semnale.asteptare} ${semnale.asteptare === 1 ? 'persoană așteaptă' : 'persoane așteaptă'} un loc`,
        detaliu: 'Se poate promova când se eliberează un loc.',
        urgent: false,
        actiune: { eticheta: 'Vezi', ecran: 'participanti' },
      });
    }
  }

  if (sala) {
    const azi = sala.azi;
    const bot = stareBot(sala.config?.enabled ?? null, sala.comenzi, acum);
    if (bot.tip === 'nu-raspunde') {
      out.push({
        cheie: 'bot',
        titlu: `Botul nu răspunde de ${bot.minute} minute`,
        detaliu: 'O comandă stă în coadă. Verifică serviciul botului.',
        urgent: true,
        actiune: { eticheta: 'Vezi', ecran: 'grup-bot' },
      });
    }
    for (const c of sala.comenzi) {
      if (c.status !== 'failed' || aziLaChisinau(new Date(c.created_at)) !== azi) continue;
      // Numai comenzile fără payload se pot relua din acest rezumat.
      const reluabila = c.action === 'send_poll' || c.action === 'send_summary' || c.action === 'send_reminder';
      // Reluarea creează un rând nou, iar eșecul rămâne în jurnal: îl stingem
      // când o încercare ulterioară de azi, cu aceeași țintă, s-a terminat (dacă
      // a eșuat și ea, rămâne doar ea). Un mesaj în grup nu se poate potrivi —
      // conținutul lui nu vine cu jurnalul.
      const ulterioare = c.action === 'send_message' ? [] : sala.comenzi.filter((alta) =>
        alta.action === c.action && alta.member_id === c.member_id &&
        Date.parse(alta.created_at) > Date.parse(c.created_at) &&
        aziLaChisinau(new Date(alta.created_at)) === azi
      );
      if (ulterioare.some((alta) => alta.status === 'done' || alta.status === 'failed')) continue;
      const inAsteptare = reluabila && ulterioare.some((alta) => alta.status === 'pending');
      out.push({
        cheie: `comanda-${c.id}`,
        titlu: `${NUME_COMANDA[c.action]} de azi, ${oraLaChisinau(c.created_at)}, n-a plecat`,
        detaliu: inAsteptare ? 'Reluarea este în coadă. Așteptăm răspunsul botului.' : c.result ?? 'Comanda a eșuat.',
        urgent: true,
        actiune: reluabila
          ? { eticheta: inAsteptare ? 'Se reia…' : 'Reîncearcă', reia: c.action as ComandaAcum, inAsteptare }
          : c.action === 'send_message'
            ? { eticheta: 'Deschide mesajele', ecran: 'grup-bot' }
            : { eticheta: 'Vezi', ecran: 'grup-membri' },
      });
    }
  }
  return out;
};

/** „Acum: Ana a răspuns «vin»", dacă un răspuns la sondaj a venit în ultimele 10 minute. */
export const ultimulRaspuns = (sala: SalaDate, acum: Date): string | null => {
  const ultim = [...sala.raspunsuri].sort((a, b) => b.responded_at.localeCompare(a.responded_at))[0];
  if (!ultim || acum.getTime() - Date.parse(ultim.responded_at) > 10 * 60_000) return null;
  const m = sala.membri.find((x) => x.id === ultim.member_id);
  if (!m) return null;
  return `Acum: ${m.full_name} a răspuns „${ultim.response === 'yes' ? 'vin' : 'nu pot'}”`;
};

/** Următorul reper al ediției care n-a trecut, pentru cardul ediției. */
export const reperulUrmator = (config: EventConfig, acum: Date): Reper | null =>
  reperele(config, acum.getTime()).find(
    (r) => !r.trecut && ['launchAt', 'registrationDeadline', 'checkin', 'start'].includes(r.cheie)
  ) ?? null;
