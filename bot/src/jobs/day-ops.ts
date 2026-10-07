// Applies what `decide` / `queuedNotice` decided (KTD2–KTD4 in the
// training-day plan). One executor for both doors: a confirmed action from an
// organizer's private chat, and a cancel/reactivation queued from /admin.
//
// The database is the truth: a Telegram failure after the row is written does
// not undo the row; it comes back to the organizer with the reason (R26).

import { createAdminClient } from "../lib/supabase.js";
import { editMessageText, sendMessage } from "../lib/telegram.js";
import { getBotConfig } from "../lib/config.js";
import { localWeekdayAndTime, todayInTz } from "../lib/tz.js";
import { renderPoll, wordingFromCopy } from "../lib/poll-text.js";
import {
  queuedNotice,
  type AuditAction,
  type Decision,
  type Effect,
  type People,
} from "../lib/day-actions.js";
import { hhmm, targetSession, type SessionRow, type Snapshot } from "../lib/sessions.js";
import { sendPoll } from "./send-poll.js";

type WriteEffect = Extract<Effect, { kind: "write" }>;

export interface AuditRow {
  action: AuditAction;
  status: "done" | "failed";
  result: string;
  payload: Record<string, string>;
}

// Everything the executor touches outside itself. Each step returns an error
// message, or null when it worked. Tests pass fakes.
export interface Ports {
  state(date: string | null): Promise<{ snapshot: Snapshot; people: People }>;
  write(e: WriteEffect): Promise<string | null>;
  postPoll(date: string): Promise<string | null>;
  redrawPoll(date: string): Promise<string | null>;
  send(html: string): Promise<string | null>;
  audit(row: AuditRow): Promise<void>;
}

export interface Origin {
  source: "telegram" | "admin";
  organizer: string | null;
}

const STEP_NAMES: Record<Effect["kind"], string> = {
  write: "scrierea în bază",
  postPoll: "sondajul",
  redrawPoll: "redesenarea sondajului",
  send: "anunțul",
};

async function runEffects(effects: Effect[], ports: Ports): Promise<string[]> {
  const failures: string[] = [];
  for (const e of effects) {
    const err =
      e.kind === "write"
        ? await ports.write(e)
        : e.kind === "postPoll"
          ? await ports.postPoll(e.date)
          : e.kind === "redrawPoll"
            ? await ports.redrawPoll(e.date)
            : await ports.send(e.html);
    if (!err) continue;
    failures.push(`${STEP_NAMES[e.kind]}: ${err}`);
    if (e.kind === "write") break; // nothing after it makes sense without the row
  }
  return failures;
}

export async function execute(
  d: Extract<Decision, { ok: true }>,
  ports: Ports,
  origin: Origin,
): Promise<{ ok: boolean; failures: string[] }> {
  const failures = await runEffects(d.effects, ports);
  try {
    await ports.audit({
      action: d.audit.action,
      status: failures.length ? "failed" : "done",
      result: failures.length ? failures.join("; ") : "ok",
      payload: {
        sursa: origin.source,
        ...(origin.organizer ? { organizator: origin.organizer } : {}),
        data: d.audit.date,
        ...d.audit.detail,
      },
    });
  } catch (err) {
    // The journal never decides whether the action happened (KTD3).
    console.error("[day-ops] audit insert failed:", err);
  }
  return { ok: failures.length === 0, failures };
}

// A `cancel_session` / `reactivate_session` row queued by /admin.
export async function runQueuedNotice(
  row: { action: string; payload: Record<string, unknown> | null },
  ports: Ports,
): Promise<{ ok: boolean; result: string }> {
  const date = typeof row.payload?.data === "string" ? row.payload.data : null;
  if (!date) return { ok: false, result: "fără dată în payload" };
  const reason = typeof row.payload?.motiv === "string" ? row.payload.motiv : null;
  const kind = row.action === "cancel_session" ? "cancel" : "reactivate";
  const { snapshot, people } = await ports.state(date);
  const q = queuedNotice(kind, snapshot, people, date, reason);
  const failures = await runEffects(q.effects, ports);
  return failures.length ? { ok: false, result: failures.join("; ") } : { ok: true, result: q.result };
}

// ── The real ports: Supabase and the Telegram group ─────────────────────────

const SESSION_COLUMNS =
  "id, session_date, starts_at, location, status, poll_message_id, poll_wording";

type Supabase = ReturnType<typeof createAdminClient>;

interface AttRow {
  member_id: string;
  response: "yes" | "no";
  member: { full_name: string; telegram_user_id: number | null } | null;
}

// The poll of a session, as it should look now (KTD9, KTD10): its own time and
// place, the wording it went out with, its votes, and ANULAT when cancelled.
export async function renderSessionPoll(
  supabase: Supabase,
  session: SessionRow,
): Promise<ReturnType<typeof renderPoll>> {
  const { data } = await supabase
    .from("attendance")
    .select("member_id, response, member:members(full_name, telegram_user_id)")
    .eq("session_id", session.id);
  const att = (data ?? []) as unknown as AttRow[];
  const nameOf = (a: AttRow) => a.member?.full_name ?? "necunoscut";
  return renderPoll({
    sessionId: session.id,
    date: session.session_date,
    time: hhmm(session.starts_at),
    location: session.location,
    wording: wordingFromCopy(session.poll_wording),
    yes: att.filter((a) => a.response === "yes").map(nameOf),
    no: att.filter((a) => a.response === "no").map(nameOf),
    cancelled: session.status === "cancelled",
  });
}

export async function loadState(
  supabase: Supabase,
  date: string | null,
): Promise<{ snapshot: Snapshot; people: People }> {
  const cfg = await getBotConfig();
  const today = todayInTz();
  const { data: rows } = await supabase
    .from("training_sessions")
    .select(SESSION_COLUMNS)
    .gte("session_date", today)
    .order("session_date", { ascending: true })
    .limit(40);
  const snapshot: Snapshot = {
    today,
    now: localWeekdayAndTime().hhmm,
    pollDays: cfg.pollDays,
    trainingTime: cfg.trainingTime,
    location: cfg.location,
    sessions: (rows ?? []) as SessionRow[],
  };

  const target = targetSession(snapshot, date);
  const people: People = { yes: [], no: [], silent: [] };
  if (!target) return { snapshot, people };

  const [{ data: att }, { data: active }] = await Promise.all([
    target.row
      ? supabase
          .from("attendance")
          .select("member_id, response, member:members(full_name, telegram_user_id)")
          .eq("session_id", target.row.id)
      : Promise.resolve({ data: [] }),
    supabase
      .from("members")
      .select("id, full_name, telegram_user_id")
      .eq("status", "active")
      .not("telegram_user_id", "is", null)
      .order("full_name"),
  ]);
  const answered = new Set<string>();
  for (const a of (att ?? []) as unknown as AttRow[]) {
    answered.add(a.member_id);
    const p = { name: a.member?.full_name ?? "necunoscut", telegramId: a.member?.telegram_user_id ?? null };
    (a.response === "yes" ? people.yes : people.no).push(p);
  }
  people.silent = ((active ?? []) as { id: string; full_name: string }[])
    .filter((m) => !answered.has(m.id))
    .map((m) => m.full_name);
  return { snapshot, people };
}

export function realPorts(): Ports {
  const supabase = createAdminClient();
  const group = process.env.TELEGRAM_GROUP_CHAT_ID;

  return {
    state: (date) => loadState(supabase, date),

    async write(e) {
      if (e.insert) {
        const ins = await supabase
          .from("training_sessions")
          .insert({ session_date: e.date, ...e.insert });
        if (!ins.error) return null;
        // 23505: someone created the row meanwhile — change it instead.
        if (ins.error.code !== "23505") return ins.error.message;
      }
      const upd = await supabase.from("training_sessions").update(e.fields).eq("session_date", e.date);
      return upd.error?.message ?? null;
    },

    async postPoll(date) {
      const r = await sendPoll({ date, force: true });
      return r.ok ? null : (r.detail ?? "sondajul n-a plecat");
    },

    async redrawPoll(date) {
      if (!group) return "lipsește TELEGRAM_GROUP_CHAT_ID";
      const { data, error } = await supabase
        .from("training_sessions")
        .select(SESSION_COLUMNS)
        .eq("session_date", date)
        .maybeSingle();
      if (error) return error.message;
      const s = data as SessionRow | null;
      if (!s?.poll_message_id) return null; // no poll in the group: nothing to redraw
      const { text, keyboard } = await renderSessionPoll(supabase, s);
      const r = await editMessageText(group, s.poll_message_id, text, {
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: keyboard },
      });
      if (r.ok || r.description === "Bad Request: message is not modified") return null;
      return r.description ?? "editarea a eșuat";
    },

    async send(html) {
      if (!group) return "lipsește TELEGRAM_GROUP_CHAT_ID";
      const r = await sendMessage(group, html, { parse_mode: "HTML" });
      return r.ok ? null : (r.description ?? "trimiterea a eșuat");
    },

    async audit(row) {
      const { error } = await supabase.from("bot_actions").insert({
        ...row,
        processed_at: new Date().toISOString(),
      });
      if (error) throw new Error(error.message);
    },
  };
}
