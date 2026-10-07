// The organizers (Vlad, Roma): the Telegram accounts in TELEGRAM_ADMIN_CHAT_IDS
// (KTD1 in the training-day plan). The same list receives the morning summary
// and the alerts, and it is the only one the bot takes commands from. In a
// private chat the chat id is the user id, so one list serves both.
export function organizerIds(raw: string | undefined = process.env.TELEGRAM_ADMIN_CHAT_IDS): number[] {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^-?\d+$/.test(s))
    .map(Number);
}
