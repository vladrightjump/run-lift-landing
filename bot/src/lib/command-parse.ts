// The organizers' typed shortcuts, in Romanian (KTD8 in the training-day plan).
// Pure: "now" comes in as data. Whatever the parser understands is shown in a
// preview before anything is written (R7), so it reads generously and lets the
// preview catch a wrong guess.

import { addDays, weekdayOf } from "./sessions.js";

export type Command =
  | "antrenament"
  | "maine"
  | "anuleaza"
  | "reactiveaza"
  | "muta"
  | "extra"
  | "sondaj"
  | "reaminteste"
  | "ajutor";

export interface Parsed {
  cmd: Command;
  date: string | null; // YYYY-MM-DD; null = the nearest training
  time: string | null; // HH:MM (only /muta and /extra)
  text: string | null; // the place (/muta, /extra) or the reason (/anuleaza)
}

export interface ParseContext {
  today: string; // YYYY-MM-DD
  now: string; // HH:MM
  todayStart: string | null; // HH:MM of today's training, if there is one
}

const COMMANDS: Command[] = [
  "antrenament",
  "maine",
  "anuleaza",
  "reactiveaza",
  "muta",
  "extra",
  "sondaj",
  "reaminteste",
  "ajutor",
];

export const EXAMPLES: Record<Command, string> = {
  antrenament: "/antrenament · /antrenament joi",
  maine: "/maine · /maine joi",
  anuleaza: "/anuleaza ploaie · /anuleaza joi ploaie",
  reactiveaza: "/reactiveaza · /reactiveaza joi",
  muta: "/muta 07:30 · /muta joi 07:30 Parcul Valea Morilor",
  extra: "/extra sâmbătă 08:00 · /extra 15.10 07:00 Parcul Valea Morilor",
  sondaj: "/sondaj · /sondaj joi",
  reaminteste: "/reaminteste · /reaminteste joi",
  ajutor: "/ajutor",
};

// Lowercase, without diacritics: "Sâmbătă" → "sambata", "Marți" → "marti".
export function fold(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

const WEEKDAYS: Record<string, number> = {
  duminica: 0,
  luni: 1,
  marti: 2,
  miercuri: 3,
  joi: 4,
  vineri: 5,
  sambata: 6,
  simbata: 6,
};

const MONTHS: Record<string, number> = {
  ian: 1, ianuarie: 1, feb: 2, februarie: 2, mar: 3, martie: 3,
  apr: 4, aprilie: 4, mai: 5, iun: 6, iunie: 6, iul: 7, iulie: 7,
  aug: 8, august: 8, sep: 9, sept: 9, septembrie: 9, oct: 10, octombrie: 10,
  noi: 11, noie: 11, noiembrie: 11, dec: 12, decembrie: 12,
};

const TIME_SHAPE = /^\d{1,2}[:.]\d{1,2}$/;

export function parseTime(token: string): string | null {
  const m = /^(\d{1,2})[:.](\d{2})$/.exec(token);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

function isoOf(y: number, m: number, d: number): string | null {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    return null; // 31.02 and the like
  }
  return dt.toISOString().slice(0, 10);
}

// Day + month without a year: this year, or next year if it already passed.
function dayMonth(ctx: ParseContext, d: number, m: number): string | null {
  const year = Number(ctx.today.slice(0, 4));
  const iso = isoOf(year, m, d);
  if (!iso) return null;
  return iso < ctx.today ? isoOf(year + 1, m, d) : iso;
}

// Reads a date from the start of `tokens`. Returns the date and how many
// tokens it used, or null when the first token isn't a date.
function readDate(
  tokens: string[],
  ctx: ParseContext,
  { dotIsTime }: { dotIsTime: boolean },
): { date: string; used: number } | null {
  if (tokens.length === 0) return null;
  const t = fold(tokens[0]);

  if (t === "azi") return { date: ctx.today, used: 1 };
  if (t === "maine") return { date: addDays(ctx.today, 1), used: 1 };

  if (t in WEEKDAYS) {
    const want = WEEKDAYS[t];
    const ahead = (want - weekdayOf(ctx.today) + 7) % 7;
    if (ahead > 0) return { date: addDays(ctx.today, ahead), used: 1 };
    const started = ctx.todayStart != null && ctx.now >= ctx.todayStart;
    return { date: started ? addDays(ctx.today, 7) : ctx.today, used: 1 };
  }

  // "15 oct", "15 octombrie"
  if (/^\d{1,2}$/.test(t) && tokens.length > 1 && fold(tokens[1]) in MONTHS) {
    const date = dayMonth(ctx, Number(t), MONTHS[fold(tokens[1])]);
    return date ? { date, used: 2 } : null;
  }

  // "15.10", "15/10", "15.10.2026"
  const full = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(t);
  if (full) {
    const date = isoOf(Number(full[3]), Number(full[2]), Number(full[1]));
    return date ? { date, used: 1 } : null;
  }
  const short = /^(\d{1,2})([./])(\d{1,2})$/.exec(t);
  if (short && !(dotIsTime && short[2] === ".")) {
    const date = dayMonth(ctx, Number(short[1]), Number(short[3]));
    return date ? { date, used: 1 } : null;
  }
  return null;
}

// null = not one of the organizer commands (the caller handles it as before).
export function parseCommand(
  input: string,
  ctx: ParseContext,
): Parsed | { cmd: Command; error: string } | null {
  const tokens = input.trim().split(/\s+/);
  const head = /^\/([a-z]+)(@\w+)?$/i.exec(tokens[0] ?? "");
  if (!head) return null;
  const cmd = fold(head[1]) as Command;
  if (!COMMANDS.includes(cmd)) return null;

  const fail = (why: string) => ({ cmd, error: `${why}\nExemple: ${EXAMPLES[cmd]}` });
  let rest = tokens.slice(1);
  const takesTime = cmd === "muta" || cmd === "extra";

  // /muta changes the hour, so "07.30" there is a time, not 7 March.
  const dateRead = readDate(rest, ctx, { dotIsTime: cmd === "muta" });
  const date = dateRead?.date ?? null;
  if (dateRead) rest = rest.slice(dateRead.used);
  if (date && date < ctx.today) return fail("Data asta a trecut.");

  let time: string | null = null;
  if (takesTime && rest.length > 0 && TIME_SHAPE.test(rest[0])) {
    time = parseTime(rest[0]);
    if (!time) return fail(`Nu înțeleg ora „${rest[0]}”.`);
    rest = rest.slice(1);
  }

  const text = rest.join(" ").trim() || null;
  if (text && !takesTime && cmd !== "anuleaza") {
    return fail(`Nu înțeleg „${text}”.`);
  }
  return { cmd, date, time, text };
}
