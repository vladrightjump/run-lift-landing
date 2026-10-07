// What each training-day action does, decided without the database or Telegram
// (KTD2 in the training-day plan). `decide` returns either a refusal, or a
// preview for the organizer plus the effects the executor applies, in order.

import { esc, dayLabel, mentionList, type Person } from "./poll-text.js";
import { sessionOn, targetSession, type Snapshot, type Target } from "./sessions.js";

export type DayAction =
  | { kind: "cancel"; date: string | null; reason: string | null }
  | { kind: "reactivate"; date: string | null }
  | { kind: "move"; date: string | null; time: string | null; location: string | null }
  | { kind: "extra"; date: string; time: string | null; location: string | null }
  | { kind: "poll"; date: string | null }
  | { kind: "remind"; date: string | null };

// Who answered the poll of the target training. `silent` = active members with
// a Telegram account who haven't answered (the rule from "Prezențe", R9).
export interface People {
  yes: Person[];
  no: Person[];
  silent: string[];
}

type Status = "scheduled" | "cancelled";

export type Effect =
  // `fields` change an existing row; `insert` is the whole row to create when
  // there is none yet (a schedule day, or an extra).
  | {
      kind: "write";
      date: string;
      fields: { status?: Status; starts_at?: string; location?: string };
      insert: { starts_at: string; location: string; status: Status } | null;
    }
  | { kind: "postPoll"; date: string }
  | { kind: "redrawPoll"; date: string }
  | { kind: "send"; html: string };

export type AuditAction =
  | "cancel_session"
  | "reactivate_session"
  | "move_session"
  | "add_session"
  | "send_poll"
  | "send_reminder";

export interface Audit {
  action: AuditAction;
  date: string;
  detail: Record<string, string>;
}

export type Decision =
  | { ok: false; message: string; suggest: "reactivate" | "move" | null; date: string | null }
  // `preview` is asked before Confirm; `done` is told after the action ran.
  | { ok: true; date: string; preview: string; done: string; effects: Effect[]; audit: Audit };

const refuse = (
  message: string,
  suggest: "reactivate" | "move" | null = null,
  date: string | null = null,
): Decision => ({ ok: false, message, suggest, date });

const when = (t: { date: string; time: string }) => `${dayLabel(t.date)}, ${t.time}`;

function noTraining(date: string | null): Decision {
  return refuse(
    date
      ? `Nu e niciun antrenament ${dayLabel(date)}.`
      : "Nu e niciun antrenament în următoarele două săptămâni.",
  );
}

// The notice line that pings the "Vin" voters, or nothing when there are none.
function pingLine(people: People, tail: string): string {
  return people.yes.length ? `\n\n${mentionList(people.yes)} — ${tail}` : "";
}

function groupNote(t: Target, people: People, what: string): string {
  if (!t.pollSent) return "În grup nu pleacă nimic: sondajul n-a plecat încă.";
  const n = people.yes.length;
  return n
    ? `În grup: ${what}, iar anunțul îi pomenește pe cei ${n} care au spus „Vin”.`
    : `În grup: ${what}, iar anunțul pleacă fără pomeniri (nimeni n-a spus „Vin”).`;
}

function writeFor(
  t: Target,
  fields: { status?: Status; starts_at?: string; location?: string },
  status: Status,
): Effect {
  return {
    kind: "write",
    date: t.date,
    fields,
    insert: t.row
      ? null
      : {
          starts_at: fields.starts_at ?? t.time,
          location: fields.location ?? t.location,
          status,
        },
  };
}

// What the group sees after a cancel or a reactivation: the poll redrawn and a
// notice that pings the "Vin" voters. Nothing when the poll hasn't gone out.
export function noticeEffects(
  kind: "cancel" | "reactivate",
  t: Target,
  people: People,
  reason: string | null,
): Effect[] {
  if (!t.pollSent) return [];
  const html =
    kind === "cancel"
      ? `❌ <b>Anulat: antrenamentul de ${when(t)}</b>${reason ? `\nMotiv: ${esc(reason)}` : ""}` +
        (people.yes.length
          ? pingLine(people, "nu mai veniți. Ne vedem la următorul!")
          : "\n\nNe vedem la următorul!")
      : `✅ <b>Reactivat: antrenamentul de ${when(t)}</b>` +
        (people.yes.length
          ? pingLine(people, "antrenamentul are loc. Sondajul de mai sus e din nou deschis.")
          : "\n\nSondajul de mai sus e din nou deschis.");
  return [
    { kind: "redrawPoll", date: t.date },
    { kind: "send", html },
  ];
}

// A cancel or reactivation done in /admin: the row is already written, so only
// the group side is left, and only if the training is still in that state (an
// admin cancel undone within the same minute announces nothing; KTD4).
export function queuedNotice(
  kind: "cancel" | "reactivate",
  s: Snapshot,
  people: People,
  date: string,
  reason: string | null,
): { effects: Effect[]; result: string } {
  const t = sessionOn(s, date);
  const wanted: Status = kind === "cancel" ? "cancelled" : "scheduled";
  if (!t || t.status !== wanted) return { effects: [], result: "depășită: starea s-a schimbat între timp" };
  if (!t.pollSent) return { effects: [], result: "fără sondaj în grup, nimic de anunțat" };
  return { effects: noticeEffects(kind, t, people, reason), result: "anunțat" };
}

function cancel(t: Target, reason: string | null, people: People): Decision {
  if (t.status === "cancelled") {
    return refuse(`Antrenamentul de ${when(t)} e deja anulat.`, "reactivate", t.date);
  }
  const effects: Effect[] = [
    writeFor(t, { status: "cancelled" }, "cancelled"),
    ...noticeEffects("cancel", t, people, reason),
  ];
  return {
    ok: true,
    date: t.date,
    preview: [
      `Anulezi antrenamentul de ${when(t)}?`,
      reason ? `Motiv: ${reason}` : null,
      groupNote(t, people, "sondajul devine „ANULAT”"),
    ]
      .filter(Boolean)
      .join("\n"),
    effects,
    done: `Antrenamentul de ${when(t)} e anulat.${t.pollSent ? " Grupul a fost anunțat." : ""}`,
    audit: { action: "cancel_session", date: t.date, detail: reason ? { motiv: reason } : {} },
  };
}

function reactivate(t: Target, people: People): Decision {
  if (t.status !== "cancelled") {
    return refuse(`Antrenamentul de ${when(t)} nu e anulat.`);
  }
  // The notice is about the training as it will be: scheduled again.
  const effects: Effect[] = [
    writeFor(t, { status: "scheduled" }, "scheduled"),
    ...noticeEffects("reactivate", t, people, null),
  ];
  return {
    ok: true,
    date: t.date,
    preview: [`Reactivezi antrenamentul de ${when(t)}?`, groupNote(t, people, "sondajul își recapătă butoanele")].join("\n"),
    effects,
    done: `Antrenamentul de ${when(t)} e din nou programat.${t.pollSent ? " Grupul a fost anunțat." : ""}`,
    audit: { action: "reactivate_session", date: t.date, detail: {} },
  };
}

function move(
  t: Target,
  time: string | null,
  location: string | null,
  s: Snapshot,
  people: People,
): Decision {
  if (t.status === "cancelled") {
    return refuse(`Antrenamentul de ${when(t)} e anulat; reactivează-l întâi.`, "reactivate", t.date);
  }
  const fields: { starts_at?: string; location?: string } = {};
  if (time && time !== t.time) fields.starts_at = time;
  if (location && location !== t.location) fields.location = location;
  if (!fields.starts_at && !fields.location) {
    return refuse("Nimic de schimbat: ora și locul sînt aceleași.");
  }
  if (fields.starts_at && t.date === s.today && fields.starts_at <= s.now) {
    return refuse(`Ora ${fields.starts_at} a trecut deja azi.`);
  }

  const changes = [
    fields.starts_at ? `🕕 ${t.time} → ${fields.starts_at}` : null,
    fields.location ? `📍 ${esc(t.location)} → ${esc(fields.location)}` : null,
  ].filter(Boolean);
  const effects: Effect[] = [writeFor(t, fields, "scheduled")];
  if (t.pollSent) {
    effects.push(
      { kind: "redrawPoll", date: t.date },
      {
        kind: "send",
        html:
          `🔁 <b>Mutat: antrenamentul de ${dayLabel(t.date)}</b>\n${changes.join("\n")}` +
          pingLine(people, "dacă nu mai puteți, apăsați ❌ pe sondaj."),
      },
    );
  }
  return {
    ok: true,
    date: t.date,
    preview: [
      `Muți antrenamentul de ${dayLabel(t.date)}?`,
      fields.starts_at ? `🕕 ${t.time} → ${fields.starts_at}` : `🕕 ${t.time} (la fel)`,
      fields.location ? `📍 ${t.location} → ${fields.location}` : `📍 ${t.location} (la fel)`,
      groupNote(t, people, "sondajul arată noile date"),
    ].join("\n"),
    effects,
    done: `Antrenamentul de ${dayLabel(t.date)} e mutat.${t.pollSent ? " Grupul a fost anunțat." : ""}`,
    audit: {
      action: "move_session",
      date: t.date,
      detail: {
        ...(fields.starts_at ? { ora: `${t.time} → ${fields.starts_at}` } : {}),
        ...(fields.location ? { loc: fields.location } : {}),
      },
    },
  };
}

function extra(
  date: string,
  time: string | null,
  location: string | null,
  s: Snapshot,
): Decision {
  if (date < s.today) return refuse("Data asta a trecut.");
  const existing = sessionOn(s, date);
  if (existing) {
    return existing.status === "cancelled"
      ? refuse(`Pe ${dayLabel(date)} e un antrenament anulat; îl poți reactiva.`, "reactivate", date)
      : refuse(`Pe ${dayLabel(date)} e deja antrenament; îl poți muta.`, "move", date);
  }
  const t = time ?? s.trainingTime.slice(0, 5);
  const loc = location ?? s.location;
  if (date === s.today && t <= s.now) return refuse(`Ora ${t} a trecut deja azi.`);
  const fields = { starts_at: t, location: loc, status: "scheduled" as const };
  return {
    ok: true,
    date,
    preview: `Adaugi un antrenament ${dayLabel(date)}, ${t} · ${loc}?\nSondajul pleacă în grup imediat.`,
    effects: [
      { kind: "write", date, fields, insert: { ...fields } },
      { kind: "postPoll", date },
    ],
    done: `Antrenamentul extra de ${dayLabel(date)}, ${t} e adăugat, iar sondajul a plecat.`,
    audit: { action: "add_session", date, detail: { ora: t, loc } },
  };
}

function poll(t: Target): Decision {
  if (t.status === "cancelled") {
    return refuse(`Antrenamentul de ${when(t)} e anulat, deci botul nu trimite sondaj pentru el.`, "reactivate", t.date);
  }
  return {
    ok: true,
    date: t.date,
    preview: t.pollSent
      ? `Sondajul pentru ${when(t)} e deja în grup. Trimiți unul nou? Cel vechi rămâne.`
      : `Trimiți sondajul pentru ${when(t)}?`,
    effects: [{ kind: "postPoll", date: t.date }],
    done: `Sondajul pentru ${when(t)} a plecat.`,
    audit: { action: "send_poll", date: t.date, detail: {} },
  };
}

function remind(t: Target, people: People): Decision {
  if (t.status === "cancelled") {
    return refuse(`Antrenamentul de ${when(t)} e anulat.`, "reactivate", t.date);
  }
  if (!t.pollSent) return refuse(`Sondajul pentru ${when(t)} n-a plecat încă.`);
  if (people.silent.length === 0) return refuse("Toți au răspuns deja la sondaj.");
  const names = people.silent.map(esc).join(", ");
  return {
    ok: true,
    date: t.date,
    preview: `Trimiți reminderul? Îi numește pe cei ${people.silent.length} care n-au răspuns: ${people.silent.join(", ")}.`,
    effects: [
      {
        kind: "send",
        html: `👋 Reamintire — încă n-au răspuns la sondaj (${people.silent.length}): ${names}. Apăsați ✅/❌ pe sondajul de mai sus!`,
      },
    ],
    done: `Reminderul a plecat (${people.silent.length} numiți).`,
    audit: { action: "send_reminder", date: t.date, detail: {} },
  };
}

export function decide(action: DayAction, s: Snapshot, people: People): Decision {
  if (action.kind === "extra") {
    return extra(action.date, action.time, action.location, s);
  }
  const t = targetSession(s, action.date);
  if (!t) return noTraining(action.date);
  switch (action.kind) {
    case "cancel":
      return cancel(t, action.reason, people);
    case "reactivate":
      return reactivate(t, people);
    case "move":
      return move(t, action.time, action.location, s, people);
    case "poll":
      return poll(t);
    case "remind":
      return remind(t, people);
  }
}
