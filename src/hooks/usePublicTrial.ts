import { useEffect, useState } from 'react';
import { loadPublicTrial, type PublicTrialConfig } from '../lib/trialPublic';

export function usePublicTrial() {
  const [config, setConfig] = useState<PublicTrialConfig | null>(null);
  useEffect(() => {
    const control = new AbortController();
    // An unavailable or not-yet-migrated service keeps this optional entry hidden.
    void loadPublicTrial(control.signal).then(setConfig).catch(() => {});
    return () => control.abort();
  }, []);
  return config;
}
