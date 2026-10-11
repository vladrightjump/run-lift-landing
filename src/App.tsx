import { ComingSoon } from './components/ComingSoon';
import { Landing } from './components/Landing';
import { IntreEditii } from './components/IntreEditii';
import { Toast } from './components/Toast';
import { useToast } from './hooks/useToast';
import { useCountdown } from './hooks/useCountdown';
import { usePagePhase, previewParam } from './hooks/usePagePhase';
import { useEventConfig, useEditionDates } from './hooks/useEventConfig';

export const App = () => {
  const { showComingSoon: SHOW_COMING_SOON } = useEventConfig();
  const { LAUNCH_DATE } = useEditionDates();
  const { toast, hiding, showToast } = useToast();
  // La expirarea timerului de lansare (LAUNCH_DATE) ecranul comută singur de la
  // Coming Soon la landing-ul ediției curente — fără redeploy manual.
  const launch = useCountdown(LAUNCH_DATE);
  // În ziua cursei landing-ul mai comută o dată („cine vine"), iar după finalul
  // cursei homepage-ul devine ecranul dintre ediții. Vezi `usePagePhase`.
  const phase = usePagePhase();
  // Preview manual înainte de ora lansării: /?preview=landing (noul landing)
  // sau /?preview=soon (Coming Soon). Fazele zilei au propriile valori
  // (leaderboard, next), citite de `usePagePhase`. Fără param → timerul.
  const preview = previewParam();
  const preLansare =
    preview === 'landing' ? false : preview === 'soon' ? true : SHOW_COMING_SOON && !launch.done;

  // Precedența: poarta de lansare e prima (cât timp ediția nu e încă anunțată,
  // nimic din ziua cursei nu are ce căuta pe ecran), fazele zilei după ea.
  const ecran = preLansare ? (
    <ComingSoon showToast={showToast} />
  ) : phase === 'next' ? (
    <IntreEditii showToast={showToast} />
  ) : (
    <Landing mode={phase === 'leaderboard' ? 'leaderboard' : 'full'} />
  );

  return (
    <>
      <Toast toast={toast} hiding={hiding} />
      {ecran}
    </>
  );
};
