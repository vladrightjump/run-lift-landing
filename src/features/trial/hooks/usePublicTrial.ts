import { useEffect, useState } from 'react';
import { loadPublicTrial } from '../data/api';
import { usePublicQuery } from '../../../shared/lib/usePublicQuery';

/** Cererea e opțională; pagina se așază după răspuns sau după două secunde. */
export function usePublicTrialStare() {
  const query = usePublicQuery('trial', loadPublicTrial, true, 60_000);
  const [limita, setLimita] = useState(false);
  useEffect(() => { const timer = window.setTimeout(() => setLimita(true), 2000); return () => window.clearTimeout(timer); }, []);
  return {
    config: query.isSuccess ? query.data.value : null,
    status: query.status,
    gata: limita || !query.isPending,
  };
}
export function usePublicTrial() { return usePublicTrialStare().config; }
