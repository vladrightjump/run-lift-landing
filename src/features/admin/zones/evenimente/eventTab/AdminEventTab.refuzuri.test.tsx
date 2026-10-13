import { describe, it, expect } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { SNAPSHOT_CONFIG } from '../../../../../shared/content/eventConfig';

import { rand, fataDeStart, baraActiuni, problemaDinBara, showToast, randeaza, deschideCiorna, camp, listEventConfig, saveEventConfigDraft, publishEventConfig, restoreEventConfig } from './test-support';

describe('refuzurile serverului ajung la organizator', () => {
  it('ascunderea înscrierii cât timp e deschisă e explicată, nu doar „a eșuat"', async () => {
    publishEventConfig.mockRejectedValue(
      new Error('Supabase 400: registration_hidden_while_open: inscrierile sunt deschise pana la ...')
    );
    await deschideCiorna();
    fireEvent.click(screen.getByRole('button', { name: 'Publică' }));
    fireEvent.click(screen.getByRole('button', { name: /Da, publică/ }));

    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith({
        kind: 'error',
        msg: expect.stringMatching(/nu poți ascunde secțiunea de înscriere/i),
      })
    );
  });

  it('un config respins de server e raportat cu motivul lui', async () => {
    saveEventConfigDraft.mockRejectedValue(
      new Error('Supabase 400: config_invalid: capacitatea trebuie sa fie pozitiva')
    );
    await deschideCiorna();
    fireEvent.click(screen.getByRole('button', { name: 'Salvează' }));

    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith({
        kind: 'error',
        msg: expect.stringMatching(/capacitatea trebuie sa fie pozitiva/),
      })
    );
  });
});

describe('refuzul rămâne citibil după ce trece toastul', () => {
  const bara = baraActiuni;
  const refuz = problemaDinBara;

  const publica = async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Publică' }));
    fireEvent.click(screen.getByRole('button', { name: /Da, publică/ }));
  };

  it('o publicare refuzată își lasă motivul în bară', async () => {
    publishEventConfig.mockRejectedValue(
      new Error('registration_hidden_while_open: înscrierile sunt deschise')
    );
    await deschideCiorna();
    await publica();

    await waitFor(() => expect(refuz()).toMatch(/înscrierile sunt deschise/i));
  });

  it('un refuz la publicare nu se dă drept eșec de salvare', async () => {
    // Garda pentru KTD5. Fără marcajul pasului, ramura de rezervă din
    // `mesajRefuz` ar zice „Nu am putut salva" pentru o publicare picată.
    publishEventConfig.mockRejectedValue(new Error('boom necunoscut'));
    await deschideCiorna();
    await publica();

    await waitFor(() => expect(refuz()).toBeTruthy());
    expect(refuz()).toMatch(/public/i);
    expect(refuz()).not.toMatch(/nu am putut salva/i);
  });

  it('o salvare refuzată din fluxul de publicare se citește ca salvare', async () => {
    saveEventConfigDraft.mockRejectedValue(new Error('boom necunoscut'));
    await deschideCiorna();
    await publica();

    await waitFor(() => expect(refuz()).toBeTruthy());
    expect(refuz()).toMatch(/salv/i);
    expect(publishEventConfig).not.toHaveBeenCalled();
  });

  it('o publicare reușită nu lasă niciun refuz în bară', async () => {
    await deschideCiorna();
    await publica();

    await waitFor(() => expect(publishEventConfig).toHaveBeenCalledTimes(1));
    expect(refuz()).toBe('');
  });

  it('o încercare nouă curăță refuzul dinainte', async () => {
    publishEventConfig.mockRejectedValueOnce(new Error('boom necunoscut'));
    await deschideCiorna();
    await publica();
    await waitFor(() => expect(refuz()).toBeTruthy());

    publishEventConfig.mockResolvedValue('pub-id');
    await publica();
    await waitFor(() => expect(refuz()).toBe(''));
  });

  it('refuzul nu supraviețuiește renunțării la ciornă', async () => {
    // „Renunță" doar anulează `ciorna`; bara se demontează, dar starea
    // componentei rămîne. Fără curățare, ciorna următoare s-ar deschide cu
    // reproșul celei aruncate.
    publishEventConfig.mockRejectedValue(new Error('boom necunoscut'));
    await deschideCiorna();
    await publica();
    await waitFor(() => expect(refuz()).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Renunță' }));
    fireEvent.click(
      screen.getByRole('button', { name: new RegExp(`Editează ediția ${SNAPSHOT_CONFIG.number}`) })
    );
    expect(refuz()).toBe('');
  });

  it('o problemă de validare ia slotul înaintea unui refuz vechi', async () => {
    publishEventConfig.mockRejectedValue(new Error('boom necunoscut'));
    await deschideCiorna();
    await publica();
    await waitFor(() => expect(refuz()).toBeTruthy());

    fireEvent.change(camp('Se închid înscrierile'), { target: { value: fataDeStart(2) } });
    expect(refuz()).toMatch(/de reparat/);
  });

  it('refuzul e anunțat din bară, nu de lângă ea', async () => {
    // Bara e deja `role="status"`. Mesajul trebuie să fie ÎNĂUNTRU: altfel un
    // cititor de ecran nu-l anunță niciodată. Căutarea e restrânsă la bară —
    // tabul are mai multe elemente cu același rol.
    publishEventConfig.mockRejectedValue(new Error('boom necunoscut'));
    await deschideCiorna();
    await publica();

    await waitFor(() => expect(refuz()).toBeTruthy());
    expect(bara().getAttribute('role')).toBe('status');
  });
});

describe('refuzurile celorlalte scrieri ajung tot în bară', () => {
  const refuz = problemaDinBara;

  it('un „Salvează" refuzat lasă motivul în bară, nu doar în toast', async () => {
    saveEventConfigDraft.mockRejectedValue(new Error('boom necunoscut'));
    await deschideCiorna();
    fireEvent.click(screen.getByRole('button', { name: 'Salvează' }));

    await waitFor(() => expect(refuz()).toBeTruthy());
    expect(refuz()).toMatch(/salv/i);
  });

  it('un „Revino la asta" refuzat spune că revenirea a picat, nu salvarea', async () => {
    // `mesajRefuz` avea o singură propoziție de rezervă, despre salvare, iar
    // republicarea o moștenea: „Nu am putut salva" pe butonul care repune
    // versiunea veche pe site.
    restoreEventConfig.mockRejectedValue(new Error('boom necunoscut'));
    listEventConfig.mockResolvedValue([
      rand(),
      rand({ id: 'veche', status: 'superseded', published_at: '2026-07-01T09:00:00Z' }),
    ]);
    randeaza();
    fireEvent.click(await screen.findByRole('button', { name: 'Revino la asta' }));

    // Fără ciornă deschisă bara nu există — refuzul are propriul banner.
    const banner = await waitFor(() => {
      const b = document.querySelector('[data-css~="admin-banner"].warn');
      if (!b) throw new Error('niciun banner');
      return b as HTMLElement;
    });
    expect(banner.textContent).toMatch(/revenirea/i);
    expect(banner.textContent).not.toMatch(/salvarea/i);
  });

  it('o cădere de rețea nu se dă drept refuz al serverului', async () => {
    // Un `admin_save_event_config_draft` care a apucat să scrie și și-a pierdut
    // răspunsul arată identic cu unul care n-a plecat. „A fost refuzată" ar fi
    // o afirmație pe care n-o putem susține.
    saveEventConfigDraft.mockRejectedValue(new Error('Failed to fetch'));
    await deschideCiorna();
    fireEvent.click(screen.getByRole('button', { name: 'Salvează' }));

    await waitFor(() => expect(refuz()).toBeTruthy());
    expect(refuz()).not.toMatch(/a fost refuzată/i);
    expect(refuz()).toMatch(/nu știm dacă a ajuns/i);
  });

  it('un refuz cu motiv de la server spune răspicat că a fost refuzat', async () => {
    publishEventConfig.mockRejectedValue(
      new Error('registration_hidden_while_open: înscrierile sunt deschise')
    );
    await deschideCiorna();
    fireEvent.click(screen.getByRole('button', { name: 'Publică' }));
    fireEvent.click(screen.getByRole('button', { name: /Da, publică/ }));

    await waitFor(() => expect(refuz()).toMatch(/a fost refuzată/i));
  });
});
