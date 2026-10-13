import { useEffect } from 'react';
import { fetchStats } from '../data/api';
import { isAbortError } from '../../../shared/lib/errors';
import { logClientError } from '../../../shared/lib/monitoring';
import { usePublicQuery } from '../../../shared/lib/usePublicQuery';

/** Datele rămân null până la primul succes; eșecul păstrează ultima valoare. */
export const useStats = () => {
  const query = usePublicQuery('stats', fetchStats, true, 15_000);
  useEffect(() => { if (query.error && !isAbortError(query.error)) logClientError('fetch-stats', query.error); }, [query.error]);
  return { stats: query.data?.value ?? null, refresh: query.refresh };
};
