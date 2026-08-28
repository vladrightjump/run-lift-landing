import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { EventConfigProvider } from '../../src/hooks/useEventConfig';
import { SNAPSHOT_CONFIG } from '../../src/content/eventConfig';
import { HONEYPOT_NAME } from '../../src/lib/antiBot';
import { useRegistration } from '../../src/hooks/useRegistration';
import { RegistrationSection } from '../../src/components/landing/RegistrationSection';
import { RegistrationForm } from '../../src/components/landing/RegistrationForm';
import { ComingSoon } from '../../src/components/ComingSoon';
import { DespreNoi } from '../../src/components/DespreNoi';

/**
 * Fiecare formular public trebuie să aibă capcana anti-bot ÎN `<form>`.
 *
 * De ce există testul ăsta și nu doar o convenție: exact asta s-a rupt tăcut o
 * dată deja. `RegistrationForm.tsx` a apărut pe `main` după ce PR-ul anti-bot
 * fusese scris — merge-ul l-a lăsat în pace, testele erau verzi, iar pagina
 * `/inscriere` și overlay-ul de pe landing trimiteau fără capcană. Un formular
 * nou fără honeypot nu strică nimic vizibil; se vede doar când intră boții.
 *
 * Se randează cele PATRU componente care dețin un `<form>`.
 * `RegistrationOverlay` și `Inscriere` sunt acoperite tranzitiv: ambele randează
 * `RegistrationForm`, deci randarea lor ar retesta același markup târând după ea
 * `window.history`, `useStats` și countdown-urile.
 *
 * Dacă adaugi un formular public nou, adaugă-l aici. Dacă testul pică, lipsește
 * `{...hpProps}` pe un `<input>` din interiorul `<form>`-ului.
 */

/** Formularul de înscriere are nevoie de `useRegistration`; îl dăm printr-un wrapper. */
const CuInscriere = ({ variant }: { variant: 'sectiune' | 'formular' }) => {
  const reg = useRegistration({
    stats: null,
    now: Date.now(),
    refresh: () => {},
    showToast: () => {},
  });
  return variant === 'sectiune' ? (
    <RegistrationSection reg={reg} stats={null} />
  ) : (
    <RegistrationForm reg={reg} stats={null} />
  );
};

const SUPRAFETE: { nume: string; element: () => ReactElement; deschide?: string }[] = [
  {
    nume: 'RegistrationSection (secțiunea 03 de pe landing)',
    element: () => <CuInscriere variant="sectiune" />,
  },
  {
    nume: 'RegistrationForm (pagina /inscriere + overlay-ul de pe landing)',
    element: () => <CuInscriere variant="formular" />,
  },
  {
    // Formularul stă într-un modal: fără click pe CTA nu există `<form>` de verificat.
    nume: 'ComingSoon (anunță-mă la lansare)',
    element: () => <ComingSoon showToast={() => {}} />,
    deschide: 'Anunță-mă la lansare',
  },
  {
    nume: 'DespreNoi (cere informații)',
    element: () => <DespreNoi />,
  },
];

describe('capcana anti-bot e pe toate formularele publice', () => {
  beforeEach(() => {
    // Ora fixată înainte de deadline, ca formularul de înscriere să fie deschis:
    // după închidere `showForm` e false și n-ar exista niciun `<form>` de verificat.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(SNAPSHOT_CONFIG.start).getTime() - 7 * 24 * 3600 * 1000);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 200 })));
    // jsdom n-are `matchMedia`; `heroVideoSrc` și efectele de mișcare îl cer.
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({
        matches: false,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
      })
    );
    vi.stubGlobal('IntersectionObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    cleanup();
  });

  it.each(SUPRAFETE)('$nume are honeypot în <form>', ({ element, deschide }) => {
    const { container } = render(
      <EventConfigProvider override={SNAPSHOT_CONFIG}>{element()}</EventConfigProvider>
    );

    if (deschide) fireEvent.click(screen.getByRole('button', { name: deschide }));

    const formulare = Array.from(container.querySelectorAll('form'));
    expect(formulare.length).toBeGreaterThan(0);

    for (const form of formulare) {
      expect(form.querySelector(`input[name="${HONEYPOT_NAME}"]`)).not.toBeNull();
    }
  });
});
