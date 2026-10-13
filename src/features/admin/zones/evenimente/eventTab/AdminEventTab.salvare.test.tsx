import { describe, it, expect } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { SNAPSHOT_CONFIG } from '../../../../../shared/content/eventConfig';

import { deschideCiorna, camp, saveEventConfigDraft, publishEventConfig } from './test-support';

describe('editarea nu atinge site-ul', () => {
  it('tastarea nu trimite nimic la server', async () => {
    await deschideCiorna();
    fireEvent.change(camp('Numele evenimentului'), { target: { value: 'Winter Trial' } });
    expect(saveEventConfigDraft).not.toHaveBeenCalled();
    expect(publishEventConfig).not.toHaveBeenCalled();
  });

  it('„Salvează ciorna" trimite documentul editat', async () => {
    await deschideCiorna();
    fireEvent.change(camp('Numele evenimentului'), { target: { value: 'Winter Trial' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvează' }));

    await waitFor(() => expect(saveEventConfigDraft).toHaveBeenCalledTimes(1));
    const [, editie, doc] = saveEventConfigDraft.mock.calls[0];
    expect(editie).toBe(SNAPSHOT_CONFIG.number);
    expect(doc.eventName).toBe('Winter Trial');
    // Publicarea rămâne un act separat.
    expect(publishEventConfig).not.toHaveBeenCalled();
  });
});

describe('lacătul acoperă ambele scrieri, nu doar publicarea', () => {
  /** O promisiune ținută pe loc, ca să inspectăm starea din zbor. */
  const tinePeLoc = (mock: typeof saveEventConfigDraft) => {
    let elibereaza!: (v: string) => void;
    mock.mockReturnValue(
      new Promise<string>((res) => {
        elibereaza = res;
      })
    );
    return () => elibereaza('id');
  };

  it('câmpurile sînt inerte și cât ține o salvare', async () => {
    const elibereaza = tinePeLoc(saveEventConfigDraft);
    await deschideCiorna();
    fireEvent.click(screen.getByRole('button', { name: 'Salvează' }));

    await waitFor(() => expect(saveEventConfigDraft).toHaveBeenCalledTimes(1));
    expect(camp('Numele evenimentului').hasAttribute('disabled')).toBe(true);
    elibereaza();
  });

  it('controalele de layout sînt inerte în zbor', async () => {
    // Ele nu trec prin `Camp`, deci nu le atinge contextul — au nevoie de
    // propria gardă, iar un control nou adăugat aici e ușor de uitat.
    const elibereaza = tinePeLoc(publishEventConfig);
    await deschideCiorna();
    fireEvent.click(screen.getByRole('button', { name: 'Publică' }));
    fireEvent.click(screen.getByRole('button', { name: /Da, publică/ }));

    await waitFor(() => expect(publishEventConfig).toHaveBeenCalledTimes(1));
    expect(
      screen.getByRole('button', { name: /Mută „Locația” mai sus/ }).hasAttribute('disabled')
    ).toBe(true);
    elibereaza();
  });

  it('„Renunță" nu poate arunca ciorna de sub o publicare în zbor', async () => {
    const elibereaza = tinePeLoc(publishEventConfig);
    await deschideCiorna();
    fireEvent.click(screen.getByRole('button', { name: 'Publică' }));
    fireEvent.click(screen.getByRole('button', { name: /Da, publică/ }));

    await waitFor(() => expect(publishEventConfig).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: 'Renunță' }).hasAttribute('disabled')).toBe(true);
    elibereaza();
  });
});
