import { useEventConfig } from '../../hooks/useEventConfig';
import type { Reel } from '../../lib/supabase';
import { ReelsRail } from './ReelsRail';

type Props = {
  /** Numărul afișat al secțiunii — se schimbă când ordinea secțiunilor se schimbă. */
  num?: string;
  /** Clipurile, cerute o dată de `Landing` — el are nevoie de lungime ca să filtreze. */
  reels: readonly Reel[];
};

/**
 * Secțiunea „Instagram" de pe landing.
 *
 * Clipurile vin din `admin/Clipuri`, aceeași listă pe care o arată și
 * „Despre noi": două secțiuni, o singură sursă. Din documentul de configurare
 * rămân doar titlul și textul secțiunii — acelea chiar țin de ediție.
 */
export const ReelsSection = ({ num = '05', reels }: Props) => {
  const { reels: texte } = useEventConfig();

  return <ReelsRail reels={reels} num={num} headline={texte.headline} body={texte.body} />;
};
