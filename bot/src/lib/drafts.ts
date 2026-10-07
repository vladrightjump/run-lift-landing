// Unconfirmed actions in the organizers' private chats (KTD5 in the
// training-day plan). They live in the bot's memory for 15 minutes: a deploy
// loses them, and the organizer taps again. That holds because the service runs
// a single replica; a second one would need drafts in the database.

import type { DayAction } from "./day-actions.js";

export const DRAFT_TTL_MS = 15 * 60_000;

// What the draft is waiting for next.
export type Step = "confirm" | "reason" | "time" | "place" | "day";

// An action being assembled: the fields not asked yet are missing.
export type PendingAction =
  | { kind: "cancel"; date: string | null; reason?: string | null }
  | { kind: "move"; date: string | null; time?: string | null; location?: string | null }
  | { kind: "extra"; date?: string; time?: string | null; location?: string | null }
  | Exclude<DayAction, { kind: "cancel" | "move" | "extra" }>;

export interface Draft {
  token: string;
  chatId: number;
  step: Step;
  action: PendingAction;
  preview: string | null; // what the organizer saw before Confirm
  expiresAt: number;
}

export type Lookup =
  | { found: true; draft: Draft }
  | { found: false; why: "expired" | "used" };

export class DraftStore {
  private byToken = new Map<string, Draft>();
  private used = new Map<string, number>(); // token → when it was consumed

  constructor(private readonly clock: () => number = Date.now) {}

  // One live draft per chat: a new one replaces the previous.
  create(chatId: number, step: Step, action: PendingAction, preview: string | null = null): Draft {
    for (const [t, d] of this.byToken) if (d.chatId === chatId) this.byToken.delete(t);
    const token = Math.random().toString(36).slice(2, 10);
    const draft = { token, chatId, step, action, preview, expiresAt: this.clock() + DRAFT_TTL_MS };
    this.byToken.set(token, draft);
    return draft;
  }

  // The draft behind a button, if it is still alive.
  get(token: string): Lookup {
    this.sweep();
    const d = this.byToken.get(token);
    if (d) return { found: true, draft: d };
    return { found: false, why: this.used.has(token) ? "used" : "expired" };
  }

  // The draft waiting for typed text in a chat (a reason, a time, a place).
  waitingIn(chatId: number): Draft | null {
    this.sweep();
    for (const d of this.byToken.values()) {
      if (d.chatId === chatId && d.step !== "confirm" && d.step !== "day") return d;
    }
    return null;
  }

  update(draft: Draft, step: Step, action: PendingAction): Draft {
    const next = { ...draft, step, action, expiresAt: this.clock() + DRAFT_TTL_MS };
    this.byToken.set(draft.token, next);
    return next;
  }

  // Removes the draft and remembers it was used, so a second tap on the same
  // Confirm says "already done" instead of acting twice.
  consume(token: string): Lookup {
    const l = this.get(token);
    if (l.found) {
      this.byToken.delete(token);
      this.used.set(token, this.clock());
    }
    return l;
  }

  drop(token: string): void {
    this.byToken.delete(token);
  }

  private sweep(): void {
    const now = this.clock();
    for (const [t, d] of this.byToken) if (d.expiresAt <= now) this.byToken.delete(t);
    for (const [t, at] of this.used) if (at + DRAFT_TTL_MS <= now) this.used.delete(t);
  }
}
