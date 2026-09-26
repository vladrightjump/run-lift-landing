import '../edition3.css';
import { useEffect, useRef, useState } from 'react';
import { useEventConfig, useEditionDates } from '../hooks/useEventConfig';
import { useCountdown } from '../hooks/useCountdown';
import { useStats } from '../hooks/useStats';
import { useNow } from '../hooks/useNow';
import { useRegistration } from '../hooks/useRegistration';
import { useScrollReveal } from '../hooks/useScrollReveal';
import { useSpotlight } from '../hooks/useSpotlight';
import { useMagnetic } from '../hooks/useMagnetic';
import { formatRoDate } from '../content/format';
import type { ToastKind } from '../hooks/useToast';
import { TopBar } from './landing/TopBar';
import { Hero } from './landing/Hero';
import { Marquee } from './landing/Marquee';
import { FormatSection } from './landing/FormatSection';
import { VenueSection } from './landing/VenueSection';
import { RegistrationSection } from './landing/RegistrationSection';
import { RegistrationOverlay } from './landing/RegistrationOverlay';
import { SignupBanner } from './landing/SignupBanner';
import { ParticipantsSection } from './landing/ParticipantsSection';
import { ReelsSection } from './landing/ReelsSection';
import { useTrainingReels } from '../hooks/useTrainingReels';
import { Footer } from './landing/Footer';

type Props = {
  /**
   * `full` (implicit) — landing-ul complet, cu înscriere.
   * `leaderboard` — fereastra din ziua cursei: fără nicio cale spre formular,
   * cu „cine vine" mutat imediat sub hero. Vezi `usePagePhase`.
   */
  mode?: 'full' | 'leaderboard';
};

/**
 * Landing-ul ediției curente („Hyrox Trial"). Compozitor subțire: leagă hookurile
 * (countdown, stats, timp, înscriere) și randează secțiunile. Logica de înscriere
 * stă în `useRegistration`; fiecare secțiune într-un fișier din `landing/`.
 */
export const Landing = ({ mode = 'full' }: Props) => {
  const lista = mode === 'leaderboard';
  const config = useEventConfig();
  const { layout } = config;
  const { EVENT_DATE } = useEditionDates();
  // Banda de sub hero: pasul cursei plus datele care contează. Toate vin din
  // configul publicat, deci se schimbă odată cu ediția, fără atingeri în cod.
  // Pe ziua cursei scoatem numărul de locuri — nu mai e nimic de rezervat.
  const marquee = [
    'Run',
    'Lift',
    'Repeat',
    formatRoDate(config.start),
    config.venue.name,
    ...(lista ? [] : [`${config.slots.total} de locuri`]),
  ];
  // Cheile necunoscute au căzut deja la parsare; aici rămâne doar filtrarea pe
  // vizibilitate, ca poziția din listă să dea numerotarea.
  //
  // „Instagram" cade și pe lipsa clipurilor, iar filtrarea trebuie făcută AICI,
  // nu prin `return null` în componentă: numerotarea se derivă din poziția în
  // lista asta, deci o secțiune care se randează gol ar lăsa un număr sărit
  // (01, 03, 04) — exact ce evită filtrarea pe vizibilitate.
  // Clipurile se cer AICI, nu în secțiune: filtrarea de mai jos are nevoie de
  // lungime, iar numărul secțiunii se derivă din poziția în lista filtrată.
  const reels = useTrainingReels();
  const sectiuniVizibile = layout.filter(
    (s) => s.visible && (s.key !== 'reels' || reels.length > 0)
  );
  const cd = useCountdown(EVENT_DATE);
  const { stats, refresh } = useStats();
  const now = useNow(30_000);
  // Secțiunile de sub fold intră cu fade-up în cascadă, nu dintr-odată.
  useScrollReveal();
  // Haloul care urmărește cursorul peste carduri.
  useSpotlight();
  // CTA-urile mari se lasă atrase de cursor.
  useMagnetic();

  // Toast propriu (vizual specific landing-ului). showToast e dat înscrierii.
  // Formularul ca overlay: CTA-urile îl deschid pe loc, fără să piardă pagina.
  const [overlay, setOverlay] = useState(false);

  const [toast, setToast] = useState<{ kind: ToastKind; msg: string } | null>(null);
  const toastTimerRef = useRef<number | undefined>(undefined);
  const showToast = (kind: ToastKind, msg: string) => {
    window.clearTimeout(toastTimerRef.current);
    setToast({ kind, msg });
    toastTimerRef.current = window.setTimeout(() => setToast(null), 3500);
  };
  useEffect(() => () => window.clearTimeout(toastTimerRef.current), []);

  const reg = useRegistration({ stats, now, refresh, showToast });

  return (
    <div className="e3-root">
      {/* Firul de progres al paginii. Decorativ — scroll-ul e deja indicat de
          bara nativă; aici doar dublează, în culoarea brandului. */}
      <div className="e3-progress" aria-hidden="true" />
      {toast && (
        <div role="status" className={toast.kind === 'error' ? 'e3-toast e3-toast-err' : 'e3-toast'}>
          <span className="e3-toast-mark" aria-hidden="true">{toast.kind === 'error' ? '!' : '✓'}</span>
          {toast.msg}
        </div>
      )}

      <SignupBanner />
      <TopBar cd={cd} onInscrie={lista ? undefined : () => setOverlay(true)} showCta={!lista} />
      <Hero onInscrie={lista ? undefined : () => setOverlay(true)} showCta={!lista} />
      <Marquee items={marquee} />
      {lista ? (
        // În fereastra de dinaintea startului singurul lucru care contează e
        // cine vine — formatul și locația rămân dedesubt, pentru cine tocmai
        // deschide harta în drum spre Valea Morilor.
        //
        // Aranjarea de aici NU e configurabilă, deliberat: în dimineața cursei
        // pagina răspunde la o singură întrebare, iar asta nu e a organizatorului
        // de rearanjat în acel moment.
        <>
          {/* Numerele urmează ordinea de pe ecran, nu ordinea din modul complet. */}
          <ParticipantsSection stats={stats} canSignUp={false} num="01" />
          <FormatSection num="02" />
          <VenueSection num="03" />
        </>
      ) : (
        // Ordinea și vizibilitatea vin din configul publicat. Numărul se derivă
        // din POZIȚIA în lista filtrată, nu se stochează — altfel ascunderea unei
        // secțiuni ar lăsa o gaură în numerotare.
        sectiuniVizibile.map(({ key }, i) => {
          const num = String(i + 1).padStart(2, '0');
          switch (key) {
            case 'format':
              return <FormatSection key={key} num={num} />;
            case 'venue':
              return <VenueSection key={key} num={num} />;
            case 'registration':
              return <RegistrationSection key={key} reg={reg} stats={stats} num={num} />;
            case 'participants':
              return <ParticipantsSection key={key} stats={stats} num={num} />;
            case 'reels':
              return <ReelsSection key={key} num={num} reels={reels} />;
            default:
              return null;
          }
        })
      )}
      <Footer />
      {!lista && overlay && (
        <RegistrationOverlay reg={reg} stats={stats} onClose={() => setOverlay(false)} />
      )}
    </div>
  );
};
