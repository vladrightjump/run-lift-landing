// Minimal helper over the Telegram Bot API — plain fetch, no dependencies.
// All methods are server-only (they read TELEGRAM_BOT_TOKEN from the env).

const API_BASE = "https://api.telegram.org";

export interface InlineKeyboardButton {
  text: string;
  callback_data: string;
}

export type InlineKeyboard = InlineKeyboardButton[][];

interface TelegramResponse<T = unknown> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
}

function botToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("Missing TELEGRAM_BOT_TOKEN");
  return token;
}

async function call<T>(
  method: string,
  body: Record<string, unknown>,
): Promise<TelegramResponse<T>> {
  const res = await fetch(`${API_BASE}/bot${botToken()}/${method}`, {
    method: "POST",
    signal: AbortSignal.timeout(10_000),
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return (await res.json()) as TelegramResponse<T>;
}

interface SentMessage {
  message_id: number;
}

// Send a message to a chat. Returns the sent message (message_id) on success.
export async function sendMessage(
  chatId: number | string,
  text: string,
  options?: { reply_markup?: Record<string, unknown>; parse_mode?: "HTML" },
): Promise<TelegramResponse<SentMessage>> {
  return call<SentMessage>("sendMessage", {
    chat_id: chatId,
    text,
    ...options,
  });
}

// Edit the text (and optionally keyboard) of an already-sent message.
export async function editMessageText(
  chatId: number | string,
  messageId: number,
  text: string,
  options?: {
    reply_markup?: { inline_keyboard: InlineKeyboard };
    parse_mode?: "HTML";
  },
): Promise<TelegramResponse> {
  return call("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    ...options,
  });
}

export interface WebhookInfo {
  url?: string;
  pending_update_count?: number;
  last_error_date?: number;
  last_error_message?: string;
}

// Current webhook registration state — used by the weekly self-check.
export async function getWebhookInfo(): Promise<TelegramResponse<WebhookInfo>> {
  return call<WebhookInfo>("getWebhookInfo", {});
}

// Remove a user from a group/supergroup. Requires the bot to be an admin with
// "ban users" permission. Pairs with unbanChatMember below to kick without a
// permanent ban (so the person can be re-added later).
export async function banChatMember(
  chatId: number | string,
  userId: number,
): Promise<TelegramResponse> {
  return call("banChatMember", { chat_id: chatId, user_id: userId });
}

export async function unbanChatMember(
  chatId: number | string,
  userId: number,
): Promise<TelegramResponse> {
  return call("unbanChatMember", {
    chat_id: chatId,
    user_id: userId,
    only_if_banned: true,
  });
}

// Acknowledge a callback query so Telegram stops the loading spinner; the
// optional text is shown as a toast to the user who tapped the button.
export async function answerCallbackQuery(
  callbackQueryId: string,
  text?: string,
): Promise<TelegramResponse> {
  return call("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    ...(text ? { text } : {}),
  });
}

// The command menu ("/" in the chat). With a chat scope it shows only in that
// chat — the organizers' private chats (KTD13); members keep the default menu.
export async function setMyCommands(
  commands: { command: string; description: string }[],
  scope?: Record<string, unknown>,
): Promise<TelegramResponse> {
  return call("setMyCommands", { commands, ...(scope ? { scope } : {}) });
}

export interface TelegramMember {
  status: 'creator' | 'administrator' | 'member' | 'restricted' | 'left' | 'kicked';
  is_member?: boolean;
  user: { id: number; is_bot?: boolean; username?: string; first_name?: string; last_name?: string };
}
export const getChatMember = (chatId: string | number, userId: number) =>
  call<TelegramMember>('getChatMember', { chat_id: chatId, user_id: userId });

export const getMe = () => call<{ id: number; username?: string }>('getMe', {});
export const getBotGroupPermissions = (chatId: string | number, userId: number) =>
  call<TelegramMember & { can_invite_users?: boolean }>('getChatMember', { chat_id: chatId, user_id: userId });
export const createTrialInvite = (chatId: string | number, expires: number) =>
  call<{ invite_link: string; expire_date?: number }>('createChatInviteLink', {
    chat_id: chatId, creates_join_request: true, expire_date: expires, name: 'Antrenament de probă',
  });
export const approveJoinRequest = (chatId: string | number, userId: number) =>
  call('approveChatJoinRequest', { chat_id: chatId, user_id: userId });
export const declineJoinRequest = (chatId: string | number, userId: number) =>
  call('declineChatJoinRequest', { chat_id: chatId, user_id: userId });
export const revokeInvite = (chatId: string | number, link: string) =>
  call('revokeChatInviteLink', { chat_id: chatId, invite_link: link });

// Trial content is plain text: names, questions and configurable conditions are
// never interpreted as Telegram HTML. Split long messages without dropping text.
export function splitTelegramText(text: string): string[] {
  const chars = Array.from(text);
  const parts: string[] = [];
  while (chars.length) parts.push(chars.splice(0, 1800).join(''));
  return parts.length ? parts : [' '];
}
export async function sendTrialText(chatId: number | string, text: string, keyboard?: InlineKeyboard) {
  const parts = splitTelegramText(text);
  let sentCount = 0;
  let last: TelegramResponse<SentMessage> = { ok: false };
  for (let i = 0; i < parts.length; i++) {
    last = await sendMessage(chatId, parts[i], i === parts.length - 1 && keyboard ? { reply_markup: { inline_keyboard: keyboard } } : undefined);
    if (!last.ok) return { ...last, sentCount };
    sentCount++;
  }
  return { ...last, sentCount };
}

// General-purpose polls are independent of attendance buttons and records.
export const getChat = (chatId: string) =>
  call<{id:number;type:string;title?:string}>('getChat', {chat_id:chatId});
export const sendGeneralPoll = (chatId: string, question: string, options: string[]) =>
  call<SentMessage>('sendPoll', {chat_id:chatId, question, options:options.map(text=>({text})), type:'regular', is_anonymous:true, allows_multiple_answers:false});
