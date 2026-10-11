// The inactivity alert: one message per inactive member, sent to every
// organizer, with three buttons. Once someone decides, every copy is edited to
// show the decision and loses its buttons (R6, R9).
import { fmtDate } from "./format.js";
import { GYM_TZ } from "./tz.js";
import type { InlineKeyboard } from "./telegram.js";

export interface ReviewView {
  id: string;
  status: string;
  weeks_missed: number;
  full_name: string;
  telegram_user_id: number | null;
  telegram_username: string | null;
  last_yes: string | null;
  join_date: string;
  decided_by_name?: string | null;
  decided_at?: string | null;
  snooze_until?: string | null;
  result?: string | null;
  messages?: { chat_id: number; message_id: number }[];
}

export type InactivityAction = "k" | "p" | "n";

// Fits Telegram's 64-byte callback_data: "i:" + uuid + ":k".
export const callbackData = (reviewId: string, action: InactivityAction) => `i:${reviewId}:${action}`;

// "12 oct, 09:05" in the gym's timezone.
export function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: GYM_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: GYM_TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
  return `${fmtDate(day)}, ${time}`;
}

const who = (r: ReviewView) => `${r.full_name} (${r.telegram_username ? "@" + r.telegram_username : "fără @utilizator"})`;

function header(r: ReviewView): string {
  const weeks = r.weeks_missed === 1 ? "o săptămână" : `${r.weeks_missed} săptămâni`;
  const last = r.last_yes
    ? `Ultimul „Da": ${fmtDate(r.last_yes)}.`
    : `Niciun „Da" de la intrarea în grup (${fmtDate(r.join_date)}).`;
  return `📉 ${who(r)}\n${weeks} cu antrenamente fără „Da". ${last}`;
}

export function alertText(r: ReviewView): string {
  return `${header(r)}\n\nCe facem?`;
}

export function alertKeyboard(reviewId: string): InlineKeyboard {
  return [
    [{ text: "🚪 Scoate din grup", callback_data: callbackData(reviewId, "k") }],
    [
      { text: "⏸ Amână 1 săptămână", callback_data: callbackData(reviewId, "p") },
      { text: "✅ Nu scoate", callback_data: callbackData(reviewId, "n") },
    ],
  ];
}

// The line that replaces the buttons once the alert is settled.
export function outcomeLine(r: ReviewView): string {
  const by = r.decided_by_name ?? "un organizator";
  const at = r.decided_at ? fmtDateTime(r.decided_at) : "";
  switch (r.status) {
    case "kick_queued": return `🚪 Scoatere cerută de ${by}, ${at} — se execută…`;
    case "kicked": return `🚪 Scos de ${by}, ${at}. Poate fi invitat din nou; istoricul rămâne.`;
    case "kick_failed": return `⚠️ Scoaterea cerută de ${by} a eșuat: ${r.result ?? "motiv necunoscut"}`;
    case "postponed": return `⏸ Amânat de ${by} până pe ${r.snooze_until ? fmtDateTime(r.snooze_until) : "săptămâna viitoare"}.`;
    case "kept": return `✅ Păstrat de ${by}, ${at}. Numărătoarea pornește din nou.`;
    case "refused":
      return r.result === "left"
        ? `↩️ Scoatere refuzată: nu mai e în grup.`
        : `↩️ Scoatere refuzată: a confirmat un antrenament după alertă.`;
    case "returned": return `↩️ A revenit: a confirmat un antrenament.`;
    case "left": return `👋 Nu mai e în grup.`;
    default: return `Alertă deschisă.`;
  }
}

export function settledText(r: ReviewView): string {
  return `${header(r)}\n\n${outcomeLine(r)}`;
}
