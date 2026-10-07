import { sendMessage } from "./telegram.js";
import { organizerIds } from "./organizers.js";

// DMs every admin (TELEGRAM_ADMIN_CHAT_IDS). Best-effort; never throws.
export async function alertAdmins(text: string): Promise<void> {
  const ids = organizerIds();
  if (ids.length === 0) return;
  try {
    await Promise.all(ids.map((id) => sendMessage(id, text)));
  } catch (err) {
    console.error("[notify] alertAdmins failed:", err);
  }
}
