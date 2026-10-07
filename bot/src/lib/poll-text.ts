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
): string {
  const bullet = (names: string[]) => names.map((n) => `• ${esc(n)}`);
  const lines = [header, ""];
  if (yes.length === 0 && no.length === 0) {
    lines.push("Cine vine? Apasă mai jos 👇");
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
