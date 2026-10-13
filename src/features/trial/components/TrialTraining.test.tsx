import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { TrialTraining } from './TrialTraining';
import { trialLink } from '../data/api';

afterEach(cleanup);

describe('intrarea la proba', () => {
  it('trimite spre bot, nu spre un grup, si explica Start', () => {
    render(<TrialTraining config={{ enabled: true, bot_username: 'ParkTrialBot', contact_text: '' }} />);
    expect(screen.getByRole('link', { name: /Vreau la un antrenament/ }).getAttribute('href')).toBe('https://t.me/ParkTrialBot?start=trial_home');
    expect(screen.getByText(/Apasă Start/)).toBeDefined();
  });
  it('nu publica CTA dezactivat sau username invalid', () => {
    const { rerender } = render(<TrialTraining config={{ enabled: false, bot_username: 'ParkTrialBot', contact_text: '' }} />);
    expect(screen.queryByRole('link')).toBeNull();
    rerender(<TrialTraining config={{ enabled: true, bot_username: 'https://evil.test', contact_text: '' }} />);
    expect(screen.queryByRole('link')).toBeNull();
    expect(trialLink('@ParkTrialBot', 'share')).toBe('https://t.me/ParkTrialBot?start=trial_share');
  });
});
