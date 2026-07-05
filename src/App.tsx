import { TopBar } from './components/TopBar';
import { Hero } from './components/Hero';
import { FormatSection } from './components/FormatSection';
import { VenueSection } from './components/VenueSection';
import { RegistrationSection } from './components/RegistrationSection';
import { Footer } from './components/Footer';
import { Toast } from './components/Toast';
import { useScrollReveal } from './hooks/useScrollReveal';
import { useToast } from './hooks/useToast';

export const App = () => {
  const { toast, hiding, showToast } = useToast();
  useScrollReveal();

  return (
    <>
      <Toast toast={toast} hiding={hiding} />
      <TopBar />
      <Hero />
      <FormatSection />
      <VenueSection />
      <RegistrationSection showToast={showToast} />
      <Footer />
    </>
  );
};
