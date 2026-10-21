import { Dialog } from '../../../shared/ui/Dialog';
import { esteIdYouTube } from '../../../shared/lib/youtube';
import type { Miscare } from '../data/tipuri';
import styles from '../styles/Azi.module.css';

export const ModalVideo = ({ miscare, onInchide }: { miscare: Miscare; onInchide: () => void }) => {
  const id = miscare.youtube_id;
  if (!id || !esteIdYouTube(id)) return null;
  return <Dialog titlu={miscare.nume} onInchide={onInchide} clasa={styles.modalVideo}>
    <iframe className={styles.player} title={`Demonstrație: ${miscare.nume}`}
      src={`https://www.youtube-nocookie.com/embed/${id}?playsinline=1&rel=0`}
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      // YouTube are origine proprie; ambele permisiuni sunt necesare playerului.
      // eslint-disable-next-line react/iframe-missing-sandbox
      sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox"
      referrerPolicy="strict-origin-when-cross-origin" allowFullScreen />
    <button type="button" className={styles.secundar} onClick={onInchide}>Închide video</button>
  </Dialog>;
};
