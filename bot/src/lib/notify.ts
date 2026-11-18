import { sendMessage } from "./telegram.js";
import { organizerIds } from "./organizers.js";
import { observeTelegram } from "./log.js";

// DMs every admin (TELEGRAM_ADMIN_CHAT_IDS). Best-effort; never throws.
export async function alertAdmins(text: string): Promise<void> {
  const ids = organizerIds();
  if (ids.length === 0) return;
  await Promise.allSettled(ids.map((id) =>
    observeTelegram("alert.send_admin_dm", () => sendMessage(id, text), "unconfirmed"),
  ));
}
