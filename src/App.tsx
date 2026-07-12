import { TopBar } from './components/TopBar';
import { Hero } from './components/Hero';
import { FormatSection } from './components/FormatSection';
import { VenueSection } from './components/VenueSection';
import { RegistrationSection } from './components/RegistrationSection';
import { ParticipantsSection } from './components/ParticipantsSection';
import { Footer } from './components/Footer';
import { ComingSoon } from './components/ComingSoon';
import { Toast } from './components/Toast';
import { useScrollReveal } from './hooks/useScrollReveal';
import { useToast } from './hooks/useToast';
import { useStats } from './hooks/useStats';
import type { ToastKind } from './hooks/useToast';
import { SHOW_COMING_SOON } from './lib/config';

type LandingProps = { showToast: (kind: ToastKind, msg: string) => void };

const Landing = ({ showToast }: LandingProps) => {
  // Un singur poller de statistici, partajat de formular și lista de participanți.
  const { stats, refresh } = useStats();
  useScrollReveal();

  return (
    <>
      <TopBar />
      <Hero />
      <FormatSection />
      <VenueSection />
      <RegistrationSection showToast={showToast} stats={stats} refreshStats={refresh} />
      <ParticipantsSection stats={stats} />
      <Footer />
    </>
  );
};

export const App = () => {
  const { toast, hiding, showToast } = useToast();

  return (
    <>
      <Toast toast={toast} hiding={hiding} />
      {SHOW_COMING_SOON ? <ComingSoon showToast={showToast} /> : <Landing showToast={showToast} />}
    </>
  );
};
