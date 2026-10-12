import { useEffect, useState } from 'react';
import { loadPublicTrial } from '../data/api';
import { usePublicQuery } from '../../../shared/lib/usePublicQuery';

/** Cererea e opțională; pagina se așază după răspuns sau după două secunde. */
export function usePublicTrialStare() {
  const query = usePublicQuery('trial', loadPublicTrial);
  const [limita, setLimita] = useState(false);
  useEffect(() => { const timer = window.setTimeout(() => setLimita(true), 2000); return () => window.clearTimeout(timer); }, []);
  return { config: query.data?.value ?? null, gata: limita || query.isSuccess || query.isError };
}
export function usePublicTrial() { return usePublicTrialStare().config; }
