import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { TrialTraining } from './TrialTraining';
import { trialLink } from '../data/api';

afterEach(cleanup);

describe('intrarea la proba', () => {
  it('trimite spre bot, nu spre un grup, si explica Start', () => {
    render(<TrialTraining config={{ enabled: true, bot_username: 'ParkTrialBot', contact_text: '' }} />);
    expect(screen.getByRole('link', { name: /Aleg ziua în Telegram/ }).getAttribute('href')).toBe('https://t.me/ParkTrialBot?start=trial_home');
    expect(screen.getByText(/Apasă Start/)).toBeDefined();
  });
  it('arată sesiunea din Chișinău, reperul real și detaliile publicate', () => {
    const config = { enabled: true, bot_username: 'ParkTrialBot', contact_text: '',
      bring_text: 'Apă', trial_price: '90 MDL', next_session: {
        starts_at: '2099-01-14T05:00:00Z', location: 'Intrarea nord',
      } };
    const { rerender } = render(<TrialTraining config={config} />);
    expect(screen.getByText(/14 ianuarie 2099.*07:00/)).toBeTruthy();
    expect(screen.getByText('Apă')).toBeTruthy();
    expect(screen.getByText('90 MDL')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Intrarea nord' }).getAttribute('href')).toContain('Intrarea%20nord');
    rerender(<TrialTraining config={{ ...config, next_session: null }} />);
    expect(screen.getByText(/nicio probă/)).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Aleg ziua/ })).toBeNull();
    rerender(<TrialTraining config={{ ...config, next_session: { ...config.next_session, starts_at: '2020-01-01T00:00:00Z' } }} />);
    expect(screen.queryByText(/Intrarea nord/)).toBeNull();
  });
  it('nu publica CTA dezactivat sau username invalid', () => {
    const { rerender } = render(<TrialTraining config={{ enabled: false, bot_username: 'ParkTrialBot', contact_text: '' }} />);
    expect(screen.queryByRole('link')).toBeNull();
    rerender(<TrialTraining config={{ enabled: true, bot_username: 'https://evil.test', contact_text: '' }} />);
    expect(screen.queryByRole('link')).toBeNull();
    expect(trialLink('@ParkTrialBot', 'share')).toBe('https://t.me/ParkTrialBot?start=trial_share');
  });
});
