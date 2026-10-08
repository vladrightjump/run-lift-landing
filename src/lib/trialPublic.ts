import { rpc } from './adminApi';

export type PublicTrialConfig = { enabled: boolean; bot_username: string; contact_text: string };

export function trialLink(username: string, source: 'home' | 'share' | 'instagram' = 'home'): string | null {
  const name = username.replace(/^@/, '');
  return /^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(name)
    ? `https://t.me/${name}?start=trial_${source}` : null;
}

export async function loadPublicTrial(signal?: AbortSignal): Promise<PublicTrialConfig | null> {
  const data = await rpc<PublicTrialConfig>('public_trial_config', {}, signal);
  return data?.enabled && typeof data.bot_username === 'string' && trialLink(data.bot_username) ? data : null;
}
