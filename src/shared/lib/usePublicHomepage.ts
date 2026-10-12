import { useEffect, useRef, useState } from 'react';
import { HOMEPAGE_IMPLICIT, loadPublicHomepage, type PublicHomepage } from './homepagePublic';
import { usePublicQuery } from './usePublicQuery';

/** După două secunde ordinea se fixează; un răspuns târziu schimbă doar locul. */
export function usePublicHomepage(enabled = true): PublicHomepage & { gata: boolean } {
  const query = usePublicQuery('homepage', loadPublicHomepage, enabled);
  const [homepage, setHomepage] = useState<PublicHomepage>(HOMEPAGE_IMPLICIT);
  const [gata, setGata] = useState(false);
  const dupaLimita = useRef(false);
  useEffect(() => {
    if (!enabled) return;
    dupaLimita.current = false;
    const timer = window.setTimeout(() => { dupaLimita.current = true; setGata(true); }, 2000);
    return () => window.clearTimeout(timer);
  }, [enabled]);
  useEffect(() => {
    if (!enabled) return;
    if (query.data) {
      const nou = query.data.value;
      setHomepage(vechi => dupaLimita.current ? { ...vechi, trainingLocation: nou.trainingLocation } : nou);
      setGata(true);
    } else if (query.isError) setGata(true);
  }, [enabled, query.data, query.isError]);
  return { ...homepage, gata };
}
