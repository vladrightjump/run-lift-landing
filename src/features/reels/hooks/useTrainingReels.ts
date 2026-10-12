import { useEffect } from 'react';
import { fetchTrainingReels, type Reel } from '../data/api';
import { isAbortError } from '../../../shared/lib/errors';
import { logClientError } from '../../../lib/monitoring';
import { usePublicQuery } from '../../../shared/lib/usePublicQuery';

/** O singură încărcare pe montare; lipsa serviciului ascunde banda. */
export const useTrainingReels = (): readonly Reel[] => {
  const query = usePublicQuery('reels', fetchTrainingReels);
  useEffect(() => { if (query.error && !isAbortError(query.error)) logClientError('fetch-training-reels', query.error); }, [query.error]);
  return query.data?.value ?? [];
};
