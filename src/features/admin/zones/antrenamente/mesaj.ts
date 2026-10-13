// Portat neschimbat din gym-app (lib/message-format.ts), cu testele lui
// (tests/unit/salaMesaj.test.ts): mesajul liber trimis în grup, cu mențiuni.
//
// Pure helpers for building the custom group message.

export interface MentionInput {
  fullName: string;
  telegramUserId: number | null;
  telegramUsername: string | null;
}

export function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Build a Telegram-HTML message from admin free text + picked mentions.
// Each mention placeholder "@FullName" typed in the text is swapped for a
// proper mention: tg://user?id (works for anyone, notifies) when we have the
// Telegram id, else a plain @username. Unmatched "@FullName" stays literal.
export function buildCustomMessageHtml(
  text: string,
  mentions: MentionInput[],
): string {
  let html = escHtml(text.trim());
  const ordered = [...mentions]
    // A blank name would make the token a bare "@", matching everywhere.
    .filter((m) => (m.fullName ?? "").trim().length > 0)
    // Longest name first: with "Ana" and "Ana Maria" both picked, replacing the
    // short one first would turn "@Ana Maria" into "<a…>Ana</a> Maria" and the
    // longer mention would never match.
    .sort((a, b) => b.fullName.length - a.fullName.length);
  for (const m of ordered) {
    const token = "@" + escHtml(m.fullName);
    let anchor: string;
    if (m.telegramUserId != null) {
      anchor = `<a href="tg://user?id=${m.telegramUserId}">${escHtml(m.fullName)}</a>`;
    } else if (m.telegramUsername) {
      // Escaped too — the username comes from the DB and is admin-editable.
      anchor = `@${escHtml(m.telegramUsername.replace(/^@/, ""))}`;
    } else {
      continue; // can't mention — leave the literal text
    }
    html = html.split(token).join(anchor);
  }
  return html;
}
