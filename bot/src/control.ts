// The organizers' private chat with the bot (U4 in the training-day plan): the
// control card, the questions, the preview and the confirmation. Only the
// accounts in the organizers' list get here (KTD1); messages in the group never
// do (R2). Messages here are plain text, so names and places need no escaping.
//
// Everything outside this file comes in through `ControlDeps`, so the tests
// drive it with fakes.

import { EXAMPLES, parseCommand, parseTime, type Parsed } from "./lib/command-parse.js";
import { decide, type DayAction, type People } from "./lib/day-actions.js";
import { DraftStore, type Draft, type PendingAction } from "./lib/drafts.js";
import { dayLabel } from "./lib/poll-text.js";
import { extraDays, sessionOn, targetSession, type Snapshot, type Target } from "./lib/sessions.js";
import { execute, type Ports } from "./jobs/day-ops.js";

type Keyboard = { text: string; callback_data: string }[][];

export interface ControlDeps {
  ports: Ports;
  organizers: number[];
  drafts: DraftStore;
  tg: {
    // Returns the new message's id, or null when sending failed.
    send(chatId: number, text: string, kb?: Keyboard): Promise<number | null>;
    edit(chatId: number, messageId: number, text: string, kb?: Keyboard): Promise<void>;
    answer(callbackId: string, text?: string): Promise<void>;
  };
}

export interface TextIn {
  chatId: number;
  chatType: string;
  fromId: number;
  fromName: string;
  text: string;
}

export interface CallbackIn {
  id: string;
  fromId: number;
  fromName: string;
  chatId: number;
  chatType: string;
  messageId: number | null;
  data: string;
}

// Where an answer goes: edit the message whose button was tapped, or send a
// new one after a typed message.
interface Ctx {
  deps: ControlDeps;
  chatId: number;
  messageId: number | null;
  organizer: string;
}

async function show(ctx: Ctx, text: string, kb: Keyboard = []): Promise<void> {
  if (ctx.messageId != null) await ctx.deps.tg.edit(ctx.chatId, ctx.messageId, text, kb);
  else await ctx.deps.tg.send(ctx.chatId, text, kb);
}

const btn = (text: string, data: string) => ({ text, callback_data: data });
const compact = (date: string) => date.replaceAll("-", "");
const fromCompact = (s: string) => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
const when = (t: { date: string; time: string }) => `${dayLabel(t.date)}, ${t.time}`;

// ── The card (R3, R4) ───────────────────────────────────────────────────────

export function renderCard(target: Target | null, people: People): { text: string; kb: Keyboard } {
  if (!target) {
    return {
      text: "Nu e niciun antrenament în următoarele două săptămâni.",
      kb: [[btn("Extra", "c:extra")]],
    };
  }
  const d = target.date;
  const head =
    target.status === "cancelled"
      ? `❌ ANULAT — ${when(target)}`
      : `🏃 Antrenamentul următor: ${when(target)}`;
  const poll = target.pollSent
    ? `Sondajul a plecat: ✅ ${people.yes.length} vin · ❌ ${people.no.length} nu · ❔ ${people.silent.length} n-au răspuns`
    : "Sondajul n-a plecat încă.";
  const kb: Keyboard =
    target.status === "cancelled"
      ? [[btn("Cine vine", `c:cine:${d}`), btn("Reactivează", `c:react:${d}`)], [btn("Extra", "c:extra")]]
      : [
          [btn("Cine vine", `c:cine:${d}`), btn("Anulează", `c:anul:${d}`)],
          [btn("Mută", `c:muta:${d}`), btn("Extra", "c:extra")],
          [btn("Sondaj", `c:sond:${d}`), btn("Reamintește", `c:rem:${d}`)],
        ];
  return { text: [head, `📍 ${target.location}`, poll].join("\n"), kb };
}

async function showCard(ctx: Ctx, date: string | null, prefix = ""): Promise<void> {
  const { snapshot, people } = await ctx.deps.ports.state(date);
  const { text, kb } = renderCard(targetSession(snapshot, date), people);
  await show(ctx, prefix + text, kb);
}

// ── Who's coming (R9) ───────────────────────────────────────────────────────

export function renderWho(target: Target | null, people: People): string {
  if (!target) return "Nu e niciun antrenament în următoarele două săptămâni.";
  const list = (names: string[]) => (names.length ? names.join(", ") : "—");
  return [
    `${when(target)} · ${target.location}${target.status === "cancelled" ? " (ANULAT)" : ""}`,
    `✅ Vin (${people.yes.length}): ${list(people.yes.map((p) => p.name))}`,
    `❌ Nu vin (${people.no.length}): ${list(people.no.map((p) => p.name))}`,
    `❔ N-au răspuns (${people.silent.length}): ${list(people.silent)}`,
  ].join("\n");
}

async function showWho(ctx: Ctx, date: string | null): Promise<void> {
  const { snapshot, people } = await ctx.deps.ports.state(date);
  const t = targetSession(snapshot, date);
  await show(ctx, renderWho(t, people), t ? [[btn("Înapoi la card", `c:card:${t.date}`)]] : []);
}

// ── Preview and confirmation (R7, KTD5) ─────────────────────────────────────

function complete(a: PendingAction): DayAction | null {
  switch (a.kind) {
    case "cancel":
      return { kind: "cancel", date: a.date, reason: a.reason ?? null };
    case "move":
      return { kind: "move", date: a.date, time: a.time ?? null, location: a.location ?? null };
    case "extra":
      return a.date ? { kind: "extra", date: a.date, time: a.time ?? null, location: a.location ?? null } : null;
    default:
      return a;
  }
}

async function preview(ctx: Ctx, action: DayAction, prefix = ""): Promise<void> {
  const { snapshot, people } = await ctx.deps.ports.state(action.date);
  const d = decide(action, snapshot, people);
  if (!d.ok) {
    const kb: Keyboard =
      d.suggest === "reactivate" && d.date
        ? [[btn("Reactivează", `c:react:${d.date}`)]]
        : d.suggest === "move" && d.date
          ? [[btn("Mută", `c:muta:${d.date}`)]]
          : [];
    await show(ctx, prefix + d.message, kb);
    return;
  }
  const draft = ctx.deps.drafts.create(ctx.chatId, "confirm", action, ctx.messageId, d.preview);
  await show(ctx, prefix + d.preview, [
    [btn("Confirmă", `c:ok:${draft.token}`), btn("Renunță", `c:no:${draft.token}`)],
  ]);
}

async function confirm(ctx: Ctx, token: string, answer: (t?: string) => Promise<void>): Promise<void> {
  const l = ctx.deps.drafts.consume(token);
  if (!l.found) {
    if (l.why === "used") {
      await answer("E deja făcut.");
      return;
    }
    await answer();
    await showCard(ctx, null, "Previzualizarea a expirat. Iată cardul din nou:\n\n");
    return;
  }
  await answer();
  const action = complete(l.draft.action);
  if (!action) return;

  // Decide again on fresh state: the other organizer may have acted meanwhile.
  const { snapshot, people } = await ctx.deps.ports.state(action.date);
  const d = decide(action, snapshot, people);
  if (!d.ok || d.preview !== l.draft.preview) {
    await preview(ctx, action, "Între timp s-a schimbat ceva. ");
    return;
  }
  const r = await execute(d, ctx.deps.ports, { source: "telegram", organizer: ctx.organizer });
  const text = r.ok
    ? `✅ Gata.\n${d.preview.split("\n")[0].replace(/\?$/, "")}: făcut.`
    : `⚠️ S-a făcut doar o parte.\n${r.failures.join("\n")}`;
  await show(ctx, text, [[btn("Cardul", `c:card:${d.date}`)]]);
}

// ── Questions: reason, time, place, day ─────────────────────────────────────

function timePicks(around: string, s: Snapshot, date: string): string[] {
  const [h, m] = around.split(":").map(Number);
  const base = h * 60 + m;
  return [-60, -30, 30, 60]
    .map((d) => base + d)
    .filter((t) => t >= 0 && t < 24 * 60)
    .map((t) => `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`)
    .filter((t) => !(date === s.today && t <= s.now));
}

async function askTime(ctx: Ctx, draft: Draft, s: Snapshot): Promise<void> {
  const a = draft.action as Extract<PendingAction, { kind: "move" | "extra" }>;
  const date = a.date!;
  const current = a.kind === "move" ? (sessionOn(s, date)?.time ?? s.trainingTime) : null;
  const picks =
    a.kind === "move"
      ? timePicks(current!, s, date)
      : [...new Set([s.trainingTime, "07:00", "08:00", "09:00", "18:00", "19:00"])]
          .sort()
          .filter((t) => !(date === s.today && t <= s.now));
  const rows: Keyboard = [];
  for (let i = 0; i < picks.length; i += 3) {
    rows.push(picks.slice(i, i + 3).map((t) => btn(t, `c:t:${draft.token}:${t.replace(":", "")}`)));
  }
  if (a.kind === "move") rows.push([btn(`Aceeași oră (${current})`, `c:t:${draft.token}:same`)]);
  rows.push([btn("Altă oră", `c:t:${draft.token}:alt`), btn("Renunță", `c:no:${draft.token}`)]);
  const what = a.kind === "move" ? `Muți antrenamentul de ${dayLabel(date)}. La ce oră?` : `Extra ${dayLabel(date)}. La ce oră?`;
  await show(ctx, what, rows);
}

async function askPlace(ctx: Ctx, draft: Draft, s: Snapshot): Promise<void> {
  const a = draft.action as Extract<PendingAction, { kind: "move" | "extra" }>;
  const here = a.kind === "move" ? (sessionOn(s, a.date!)?.location ?? s.location) : s.location;
  await show(ctx, "Unde?", [
    [btn(`Același loc (${here})`, `c:l:${draft.token}:same`)],
    [btn("Alt loc", `c:l:${draft.token}:alt`), btn("Renunță", `c:no:${draft.token}`)],
  ]);
}

async function startCancel(ctx: Ctx, date: string): Promise<void> {
  const draft = ctx.deps.drafts.create(ctx.chatId, "reason", { kind: "cancel", date }, ctx.messageId);
  await show(ctx, `Anulezi antrenamentul de ${dayLabel(date)}. Motivul? Scrie-l aici sau apasă „Fără motiv”.`, [
    [btn("Fără motiv", `c:r:${draft.token}:none`), btn("Renunță", `c:no:${draft.token}`)],
  ]);
}

async function startMove(ctx: Ctx, date: string): Promise<void> {
  const { snapshot } = await ctx.deps.ports.state(date);
  const t = sessionOn(snapshot, date);
  if (!t || t.status === "cancelled") {
    await preview(ctx, { kind: "move", date, time: null, location: null });
    return;
  }
  const draft = ctx.deps.drafts.create(ctx.chatId, "time", { kind: "move", date }, ctx.messageId);
  await askTime(ctx, draft, snapshot);
}

async function startExtra(ctx: Ctx): Promise<void> {
  const { snapshot } = await ctx.deps.ports.state(null);
  const draft = ctx.deps.drafts.create(ctx.chatId, "day", { kind: "extra" }, ctx.messageId);
  const days = extraDays(snapshot);
  const rows: Keyboard = [];
  for (let i = 0; i < days.length; i += 3) {
    rows.push(days.slice(i, i + 3).map((d) => btn(dayLabel(d), `c:d:${draft.token}:${compact(d)}`)));
  }
  rows.push([btn("Renunță", `c:no:${draft.token}`)]);
  await show(ctx, "Antrenament extra. În ce zi?", rows);
}

// A typed answer to the question a draft is waiting on.
async function answerDraft(ctx: Ctx, draft: Draft, text: string): Promise<void> {
  const a = draft.action;
  if (draft.step === "reason" && a.kind === "cancel") {
    await preview(ctx, { kind: "cancel", date: a.date, reason: text.trim() || null });
    return;
  }
  if (draft.step === "time" && (a.kind === "move" || a.kind === "extra")) {
    const time = parseTime(text.trim());
    if (!time) {
      await show(ctx, "Nu înțeleg ora. Scrie-o așa: 07:45.");
      return;
    }
    const { snapshot } = await ctx.deps.ports.state(a.date ?? null);
    await askPlace(ctx, ctx.deps.drafts.update(draft, "place", { ...a, time }), snapshot);
    return;
  }
  if (draft.step === "place" && (a.kind === "move" || a.kind === "extra")) {
    const action = complete({ ...a, location: text.trim() || null });
    if (action) await preview(ctx, action);
  }
}

// ── Typed commands (R5) ─────────────────────────────────────────────────────

const HELP = [
  "Comenzile tale:",
  ...Object.values(EXAMPLES).map((e) => `• ${e}`),
  "",
  "Fiecare schimbare îți arată întâi ce se întâmplă și pleacă abia după „Confirmă”.",
].join("\n");

async function runCommand(ctx: Ctx, p: Parsed): Promise<void> {
  switch (p.cmd) {
    case "antrenament":
      return showCard(ctx, p.date);
    case "maine":
      return showWho(ctx, p.date);
    case "ajutor":
      return show(ctx, HELP);
    case "anuleaza":
      return preview(ctx, { kind: "cancel", date: p.date, reason: p.text });
    case "reactiveaza":
      return preview(ctx, { kind: "reactivate", date: p.date });
    case "sondaj":
      return preview(ctx, { kind: "poll", date: p.date });
    case "reaminteste":
      return preview(ctx, { kind: "remind", date: p.date });
    case "muta":
      if (!p.time && !p.text) {
        const { snapshot } = await ctx.deps.ports.state(p.date);
        const t = targetSession(snapshot, p.date);
        if (t) return startMove(ctx, t.date);
      }
      return preview(ctx, { kind: "move", date: p.date, time: p.time, location: p.text });
    case "extra":
      if (!p.date) return startExtra(ctx);
      return preview(ctx, { kind: "extra", date: p.date, time: p.time, location: p.text });
  }
}

// ── Entry points from the webhook ───────────────────────────────────────────

const isOrganizerChat = (deps: ControlDeps, chatType: string, fromId: number) =>
  chatType === "private" && deps.organizers.includes(fromId);

// True when the message was the organizer's command or answer; false lets the
// webhook continue with the member flow (/start, sign-up), as before.
export async function handleOrganizerText(m: TextIn, deps: ControlDeps): Promise<boolean> {
  if (!isOrganizerChat(deps, m.chatType, m.fromId)) return false;
  const ctx: Ctx = { deps, chatId: m.chatId, messageId: null, organizer: m.fromName };
  const text = m.text.trim();

  if (!text.startsWith("/")) {
    const waiting = deps.drafts.waitingIn(m.chatId);
    if (!waiting) return false;
    await answerDraft(ctx, waiting, text);
    return true;
  }

  const { snapshot } = await deps.ports.state(null);
  const parsed = parseCommand(text, {
    today: snapshot.today,
    now: snapshot.now,
    todayStart: sessionOn(snapshot, snapshot.today)?.time ?? null,
  });
  if (!parsed) return false; // /start and anything else: the member flow
  if ("error" in parsed) {
    await show(ctx, parsed.error);
    return true;
  }
  await runCommand(ctx, parsed);
  return true;
}

export async function handleControlCallback(cb: CallbackIn, deps: ControlDeps): Promise<void> {
  const answer = (t?: string) => deps.tg.answer(cb.id, t);
  if (!isOrganizerChat(deps, cb.chatType, cb.fromId)) {
    await answer();
    return;
  }
  const ctx: Ctx = { deps, chatId: cb.chatId, messageId: cb.messageId, organizer: cb.fromName };
  const [, verb, arg, extra] = cb.data.split(":");

  if (verb === "ok") return confirm(ctx, arg, answer);
  await answer();

  switch (verb) {
    case "card":
      return showCard(ctx, arg && arg !== "-" ? arg : null);
    case "cine":
      return showWho(ctx, arg);
    case "anul":
      return startCancel(ctx, arg);
    case "react":
      return preview(ctx, { kind: "reactivate", date: arg });
    case "muta":
      return startMove(ctx, arg);
    case "extra":
      return startExtra(ctx);
    case "sond":
      return preview(ctx, { kind: "poll", date: arg });
    case "rem":
      return preview(ctx, { kind: "remind", date: arg });
    case "no": {
      deps.drafts.drop(arg);
      return showCard(ctx, null, "Am renunțat. Nimic nu s-a schimbat.\n\n");
    }
  }

  // Answers to a draft's question: c:<r|t|l|d>:<token>:<value>
  const l = deps.drafts.get(arg);
  if (!l.found) {
    await showCard(ctx, null, "Întrebarea a expirat. Iată cardul din nou:\n\n");
    return;
  }
  const draft = l.draft;
  const a = draft.action;
  if (verb === "r" && a.kind === "cancel") {
    return preview(ctx, { kind: "cancel", date: a.date, reason: null });
  }
  if (verb === "d" && a.kind === "extra") {
    const date = fromCompact(extra);
    const { snapshot } = await deps.ports.state(null);
    return askTime(ctx, deps.drafts.update(draft, "time", { ...a, date }), snapshot);
  }
  if (verb === "t" && (a.kind === "move" || a.kind === "extra")) {
    if (extra === "alt") {
      deps.drafts.update(draft, "time", a);
      return show(ctx, "Scrie ora, de exemplu 07:45.");
    }
    const time = extra === "same" ? null : `${extra.slice(0, 2)}:${extra.slice(2)}`;
    const { snapshot } = await deps.ports.state(a.date ?? null);
    return askPlace(ctx, deps.drafts.update(draft, "place", { ...a, time }), snapshot);
  }
  if (verb === "l" && (a.kind === "move" || a.kind === "extra")) {
    if (extra === "alt") {
      deps.drafts.update(draft, "place", a);
      return show(ctx, "Scrie locul.");
    }
    const action = complete({ ...a, location: null });
    if (action) return preview(ctx, action);
  }
}

// The buttons on the morning summary (R6): the day's actions, without typing.
export function summaryKeyboard(
  session: { session_date: string; status: string } | null,
): Keyboard {
  if (!session) return [];
  const d = session.session_date;
  if (session.status === "cancelled") return [[btn("Reactivează", `c:react:${d}`)]];
  return [[btn("Cine vine", `c:cine:${d}`), btn("Anulează", `c:anul:${d}`), btn("Mută", `c:muta:${d}`)]];
}

// The organizers' command menu (KTD13).
export const ORGANIZER_COMMANDS = [
  { command: "antrenament", description: "Cardul antrenamentului următor" },
  { command: "maine", description: "Cine vine" },
  { command: "anuleaza", description: "Anulează antrenamentul" },
  { command: "reactiveaza", description: "Reactivează un antrenament anulat" },
  { command: "muta", description: "Mută ora sau locul" },
  { command: "extra", description: "Adaugă un antrenament" },
  { command: "sondaj", description: "Trimite sondajul acum" },
  { command: "reaminteste", description: "Amintește-le celor care n-au răspuns" },
  { command: "ajutor", description: "Comenzile, cu exemple" },
];

// The default wiring: the organizers' list from the environment and one
// in-memory draft store for the process.
export function defaultDeps(ports: Ports, tg: ControlDeps["tg"], organizers: number[]): ControlDeps {
  return { ports, organizers, drafts: SHARED_DRAFTS, tg };
}

const SHARED_DRAFTS = new DraftStore();
