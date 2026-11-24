import {
  birthdayCandidates, changeBirthday, claimBirthday, finishBirthday, isMissingBirthdaySchema,
  readTelegramBirthday, type BirthdayOutcome,
} from '../lib/birthdays.js';
import { botFailure } from '../lib/log.js';
import { currentTelegramMember } from '../lib/membership.js';
import { sendMessage } from '../lib/telegram.js';
import { ymdInTz } from '../lib/tz.js';

function greeting(name: string | null): string {
  const preferredName = name?.replace(/\s+/g, ' ').trim();
  return (preferredName ? 'La mulți ani, ' + preferredName + '!' : 'La mulți ani!') +
    ' 🎉 Ne bucurăm că faci parte din Run + Lift!';
}

async function sendGreeting(group: string, name: string | null): Promise<BirthdayOutcome> {
  const started = performance.now();
  try {
    const result = await sendMessage(group, greeting(name), { link_preview_options: { is_disabled: true } });
    if (result.ok && Number.isSafeInteger(result.result?.message_id)) return 'sent';
    if (!result.ok && result.error_code !== undefined && result.error_code < 500) {
      botFailure('birthday.send', 'telegram', started, result);
      return 'rejected';
    }
    botFailure('birthday.send', 'telegram', started, result, 'unconfirmed');
  } catch (error) {
    botFailure('birthday.send', 'telegram', started, error, 'unconfirmed');
  }
  return 'uncertain';
}

// Returns false only to retry eligibility or storage checks, never to resend a claim.
export async function runBirthdayGreetings(
  group: string,
  date: string,
  now: () => Date = () => new Date(),
): Promise<boolean> {
  const stillToday = () => ymdInTz(now()) === date;
  if (!stillToday()) return true;

  let candidates;
  const listedAt = performance.now();
  try {
    candidates = await birthdayCandidates(date);
  } catch (error) {
    if (!isMissingBirthdaySchema(error)) botFailure('birthday.list', 'supabase', listedAt, error, 'retry');
    return false;
  }
  const day = Number(date.slice(8, 10));
  const month = Number(date.slice(5, 7));
  let retry = false;
  for (const candidate of candidates) {
    if (!stillToday()) return true;
    const id = candidate.telegram_user_id;
    const started = performance.now();
    let dependency: 'telegram' | 'supabase' = 'telegram';
    let name: string | null;
    try {
      const member = await currentTelegramMember(group, id);
      if (!member) continue;
      if (candidate.source === 'telegram') {
        const visible = await readTelegramBirthday(id);
        if (visible?.day !== day || visible.month !== month) {
          dependency = 'supabase';
          const updated = await changeBirthday(id, 'refresh', visible, candidate.revision);
          if (updated.enabled && updated.day === day && updated.month === month) retry = true;
          continue;
        }
      }
      if (!stillToday()) return true;
      dependency = 'supabase';
      if (!(await claimBirthday(id, date, candidate.revision))) {
        retry = true;
        continue;
      }
      name = candidate.display_name ?? member.user.first_name ?? null;
    } catch (error) {
      retry = true;
      botFailure('birthday.verify_and_claim', dependency, started, error, 'retry');
      continue;
    }

    // The committed claim prevents an automatic repeat even after a transport timeout or restart.
    const outcome = stillToday() ? await sendGreeting(group, name) : 'rejected';
    const finishingAt = performance.now();
    try {
      await finishBirthday(id, date, outcome);
    } catch (error) {
      botFailure('birthday.record_outcome', 'supabase', finishingAt, error, 'unconfirmed');
    }
  }
  return !retry;
}

export function createBirthdayScheduler({
  now = () => new Date(),
  run = runBirthdayGreetings,
}: { now?: () => Date; run?: typeof runBirthdayGreetings } = {}) {
  let completedDate: string | undefined;
  let lastAttemptDate: string | undefined;
  let retryAt = 0;
  let running = false;

  return async (group: string | undefined, date: string, hhmm: string): Promise<void> => {
    if (!group || hhmm < '09:00' || running || completedDate === date ||
        (lastAttemptDate === date && now().getTime() < retryAt)) return;
    running = true;
    lastAttemptDate = date;
    try {
      if (await run(group, date, now)) completedDate = date;
    } finally {
      retryAt = now().getTime() + 15 * 60_000;
      running = false;
    }
  };
}
