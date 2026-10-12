import styles from './SignupBanner.module.css';
import { useEffect, useState } from 'react';
import { useEventConfig } from '../../../shared/lib/useEventConfig';
import { consumeJustSignedUp } from '../../../shared/lib/justSignedUp';
import type { JustSignedUp } from '../../../shared/lib/justSignedUp';

/**
 * Bannerul verde de aterizare: „Ești înscris — locul 13/40". Apare o singură
 * dată, imediat după redirectul de pe `/inscriere`, și dispare la primul scroll
 * (sau la click pe ✕). Sursa e `sessionStorage`, nu backendul.
 */
export const SignupBanner = () => {
  const TOTAL_SLOTS = useEventConfig().slots.total;
  const [data, setData] = useState<JustSignedUp | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    setData(consumeJustSignedUp());
  }, []);

  // Ascundem la primul scroll AL UTILIZATORULUI. Ascultătorul se pune cu
  // întârziere pentru că aterizarea e pe `/#participanti`: browserul sare
  // singur la ancoră, iar acel scroll automat ar închide bannerul înainte să
  // apuce cineva să-l vadă.
  useEffect(() => {
    if (!data) return;
    const onScroll = () => setHidden(true);
    const armId = window.setTimeout(() => {
      window.addEventListener('scroll', onScroll, { passive: true, once: true });
    }, 1200);
    return () => {
      window.clearTimeout(armId);
      window.removeEventListener('scroll', onScroll);
    };
  }, [data]);

  if (!data || hidden) return null;

  return (
    <div role="status" className={styles['e3-banner']} data-css={"e3-banner"}>
      <span className={styles['e3-banner-mark']} data-css={"e3-banner-mark"} aria-hidden="true">✓</span>
      <span className={styles['e3-banner-text']} data-css={"e3-banner-text"}>
        {data.waitlist
          ? `${data.prenume}, ești pe lista de așteptare. Te anunțăm imediat ce se eliberează un loc.`
          : `${data.prenume}, ești înscris${data.loc ? `, locul ${data.loc}/${TOTAL_SLOTS}` : ''}. Confirmarea a plecat pe email.`}
      </span>
      <button type="button" onClick={() => setHidden(true)} aria-label="Închide" className={styles['e3-banner-close']} data-css={"e3-banner-close"}>
        ✕
      </button>
    </div>
  );
};
