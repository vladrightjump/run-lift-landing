// Builds the group poll message (Telegram HTML parse mode). The message is
// edited in place on every vote (editMessageText does NOT notify members), so
// it acts as a friendly live "who's coming" board. Only people who answered
// are shown — non-responders live in the dashboard, not in the group.

const RO_DOW = [
  "Duminică", "Luni", "Marți", "Miercuri", "Joi", "Vineri", "Sâmbătă",
];
const RO_MON = [
  "ian", "feb", "mar", "apr", "mai", "iun",
  "iul", "aug", "sep", "oct", "noi", "dec",
];

// Escape user-provided text for Telegram HTML mode.
export function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// The editable part of the poll: the title phrase and the two button labels.
// Day, date, time and location stay automatic. Must match the admin preview
// (`src/admin/sala/sondaj.ts`) character for character.
export interface PollWording {
  title: string;
  yes: string;
  no: string;
}

// Today's text. An empty setting means exactly this.
export const DEFAULT_WORDING: PollWording = {
  title: "Antrenament mâine",
  yes: "✅ Vin!",
  no: "❌ Nu pot",
};

// Settings → the text that goes out: blank or whitespace-only falls back.
export function effectiveWording(saved: {
  title: string | null;
  yes: string | null;
  no: string | null;
}): PollWording {
  return {
    title: saved.title?.trim() || DEFAULT_WORDING.title,
    yes: saved.yes?.trim() || DEFAULT_WORDING.yes,
    no: saved.no?.trim() || DEFAULT_WORDING.no,
  };
}

// The copy kept on a session (`training_sessions.poll_wording`). Polls posted
// before the copy existed have none, and get today's text.
export function wordingFromCopy(copy: unknown): PollWording {
  const c = (copy && typeof copy === "object" ? copy : {}) as Record<string, unknown>;
  const pick = (v: unknown, fallback: string) =>
    typeof v === "string" && v.trim() ? v : fallback;
  return {
    title: pick(c.title, DEFAULT_WORDING.title),
    yes: pick(c.yes, DEFAULT_WORDING.yes),
    no: pick(c.no, DEFAULT_WORDING.no),
  };
}

// The vote buttons. The callback data never changes, so votes on any poll —
// old or new wording — are read the same way.
export function pollKeyboard(
  sessionId: string,
  wording: PollWording,
): { text: string; callback_data: string }[][] {
  return [
    [
      { text: wording.yes, callback_data: `att:yes:${sessionId}` },
      { text: wording.no, callback_data: `att:no:${sessionId}` },
    ],
  ];
}

// "🏃 <b>Antrenament mâine — Miercuri, 22 iul</b>\n🕕 06:30 · 📍 Parcul …"
export function pollHeader(
  dateIso: string,
  startTime: string,
  location: string,
  title: string = DEFAULT_WORDING.title,
): string {
  const t = (startTime || "06:30").slice(0, 5);
  let when = "";
  if (/^\d{4}-\d{2}-\d{2}/.test(dateIso)) {
    const [y, m, d] = dateIso.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    when = ` — ${RO_DOW[dt.getUTCDay()]}, ${d} ${RO_MON[m - 1]}`;
  }
  const loc = location ? ` · 📍 ${esc(location)}` : "";
  return `🏃 <b>${esc(title)}${when}</b>\n🕕 ${t}${loc}`;
}

export function buildPollText(
  header: string,
  yes: string[],
  no: string[],
  { cancelled = false }: { cancelled?: boolean } = {},
): string {
  const bullet = (names: string[]) => names.map((n) => `• ${esc(n)}`);
  const lines = cancelled ? ["❌ <b>ANULAT</b>", header, ""] : [header, ""];
  if (yes.length === 0 && no.length === 0) {
    if (!cancelled) lines.push("Cine vine? Apasă mai jos 👇");
  } else {
    if (yes.length) {
      lines.push(`✅ <b>Vin (${yes.length})</b>`, ...bullet(yes));
    }
    if (no.length) {
      if (yes.length) lines.push("");
      lines.push(`❌ <b>Nu pot (${no.length})</b>`, ...bullet(no));
    }
  }
  return lines.join("\n");
}

// ── Ziua de antrenament din Telegram ────────────────────────────────────────

// The poll's title depends on the day it goes out (KTD9). The day before, it
// is the configured title ("Antrenament mâine" by default); the same day,
// "Antrenament azi"; earlier than that, just "Antrenament" — the automatic
// suffix ("— Sâmbătă, 10 oct") names the day.
export function pollTitleFor(
  sessionDate: string,
  postDate: string,
  configuredTitle: string,
): string {
  if (sessionDate === postDate) return "Antrenament azi";
  const [y, m, d] = postDate.split("-").map(Number);
  const dayAfter = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  return sessionDate === dayAfter ? configuredTitle : "Antrenament";
}

export interface PollView {
  sessionId: string;
  date: string;
  time: string;
  location: string;
  wording: PollWording;
  yes: string[];
  no: string[];
  cancelled: boolean;
}

// The whole poll message: text plus buttons. A cancelled poll keeps its names
// but loses its buttons (R10, KTD10).
export function renderPoll(v: PollView): {
  text: string;
  keyboard: { text: string; callback_data: string }[][];
} {
  const header = pollHeader(v.date, v.time, v.location, v.wording.title);
  return {
    text: buildPollText(header, v.yes, v.no, { cancelled: v.cancelled }),
    keyboard: v.cancelled ? [] : pollKeyboard(v.sessionId, v.wording),
  };
}

// "2026-10-08" → "joi, 8 oct" (inside a sentence).
export function dayLabel(dateIso: string): string {
  const [y, m, d] = dateIso.split("-").map(Number);
  const dow = RO_DOW[new Date(Date.UTC(y, m - 1, d)).getUTCDay()].toLowerCase();
  return `${dow}, ${d} ${RO_MON[m - 1]}`;
}

export interface Person {
  name: string;
  telegramId: number | null;
}

// Mentions that notify (KTD11): a tg://user link for anyone with a Telegram
// account, the escaped name otherwise. Past `budget` characters the list is
// cut and ends with "și încă N", so the message stays under Telegram's limit.
export function mentionList(people: Person[], budget = 3500): string {
  const one = (p: Person) =>
    p.telegramId != null
      ? `<a href="tg://user?id=${p.telegramId}">${esc(p.name)}</a>`
      : esc(p.name);
  const tailRoom = 20; // ", și încă 999"
  const parts: string[] = [];
  let used = 0;
  for (let i = 0; i < people.length; i += 1) {
    const piece = one(people[i]);
    const room = i < people.length - 1 ? tailRoom : 0;
    if (used + piece.length + room > budget) {
      const rest = `și încă ${people.length - i}`;
      return parts.length ? `${parts.join(", ")}, ${rest}` : rest;
    }
    parts.push(piece);
    used += piece.length + 2;
  }
  return parts.join(", ");
}
