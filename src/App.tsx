import { TopBar } from './components/TopBar';
import { Hero } from './components/Hero';
import { FormatSection } from './components/FormatSection';
import { VenueSection } from './components/VenueSection';
import { RegistrationSection } from './components/RegistrationSection';
import { ParticipantsSection } from './components/ParticipantsSection';
import { Footer } from './components/Footer';
import { Toast } from './components/Toast';
import { useScrollReveal } from './hooks/useScrollReveal';
import { useToast } from './hooks/useToast';
import { useStats } from './hooks/useStats';

export const App = () => {
  const { toast, hiding, showToast } = useToast();
  // Un singur poller de statistici, partajat de formular și lista de participanți.
  const { stats, refresh } = useStats();
  useScrollReveal();

  return (
    <>
      <Toast toast={toast} hiding={hiding} />
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
