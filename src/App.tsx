import { ComingSoon } from './components/ComingSoon';
import { Edition3Landing } from './components/Edition3Landing';
import { Toast } from './components/Toast';
import { useToast } from './hooks/useToast';
import { useCountdown } from './hooks/useCountdown';
import { SHOW_COMING_SOON, LAUNCH_DATE } from './lib/config';

export const App = () => {
  const { toast, hiding, showToast } = useToast();
  // La expirarea timerului de lansare (LAUNCH_DATE) ecranul comută singur de la
  // Coming Soon la landing-ul ediției a treia — fără redeploy manual.
  const launch = useCountdown(LAUNCH_DATE);
  // Preview manual înainte de ora lansării: /?preview=landing (noul landing)
  // sau /?preview=soon (Coming Soon). Fără param → comportamentul normal (timer).
  const preview = new URLSearchParams(window.location.search).get('preview');
  const showComingSoon =
    preview === 'landing' ? false : preview === 'soon' ? true : SHOW_COMING_SOON && !launch.done;

  return (
    <>
      <Toast toast={toast} hiding={hiding} />
      {showComingSoon ? <ComingSoon showToast={showToast} /> : <Edition3Landing />}
    </>
  );
};
