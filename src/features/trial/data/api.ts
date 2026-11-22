import { rpcStrict } from '../../../shared/lib/rpc';

export type PublicTrialConfig = {
  enabled: boolean;
  bot_username: string;
  contact_text: string;
  bring_text?: string;
  trial_price?: string;
  next_session?: { starts_at: string; location: string } | null;
};

export function trialLink(username: string, source: 'home' | 'share' | 'instagram' = 'home'): string | null {
  const name = username.replace(/^@/, '');
  return /^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(name)
    ? `https://t.me/${name}?start=trial_${source}` : null;
}

export async function loadPublicTrial(signal?: AbortSignal): Promise<PublicTrialConfig | null> {
  const data = await rpcStrict<PublicTrialConfig | null>('public_trial_config', {}, signal);
  if (data === null || data.enabled === false) return null;
  if (data.enabled !== true || typeof data.bot_username !== 'string' || !trialLink(data.bot_username)) {
    throw new Error('invalid_public_trial_config');
  }
  const session = data.next_session;
  if (session != null && (typeof session.starts_at !== 'string' || !Number.isFinite(Date.parse(session.starts_at)))) {
    throw new Error('invalid_public_trial_session');
  }
  return data;
}
