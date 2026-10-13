import { describe, it, expect } from 'vitest';
import { screen, waitFor, fireEvent, within } from '@testing-library/react';
import { SNAPSHOT_CONFIG } from '../../../../../shared/content/eventConfig';

import { rand, showToast, randeaza, deschideCiorna, deschideGrupurile, camp, listEventConfig, saveEventConfigDraft, publishEventConfig } from './test-support';

describe('publicarea cere confirmare și spune ce urmează', () => {
  it('confirmarea numește ce va vedea vizitatorul', async () => {
    await deschideCiorna();
    fireEvent.click(screen.getByRole('button', { name: 'Publică' }));

    const dialog = screen.getByRole('alertdialog');
    expect(within(dialog).getByText(/landing-ul cu înscrieri/)).toBeTruthy();
    // Share preview-ul rămâne pe build — spus explicit, nu ascuns.
    expect(within(dialog).getByText(/share preview/i)).toBeTruthy();
    expect(publishEventConfig).not.toHaveBeenCalled();
  });

  it('Coming Soon e numit ca atare în confirmare', async () => {
    await deschideCiorna();
    fireEvent.change(screen.getByLabelText('Homepage-ul arată'), { target: { value: 'soon' } });
    fireEvent.click(screen.getByRole('button', { name: 'Publică' }));
    // `strong`: de când confirmarea listează și diferențele, „Coming Soon"
    // apare de două ori — o dată ca urmare („vizitatorii vor vedea…"), o dată
    // ca valoare nouă a câmpului. Aici ne interesează prima.
    expect(
      within(screen.getByRole('alertdialog')).getByText('Coming Soon', { selector: 'strong' })
    ).toBeTruthy();
  });

  it('anularea nu publică nimic', async () => {
    await deschideCiorna();
    fireEvent.click(screen.getByRole('button', { name: 'Publică' }));
    fireEvent.click(screen.getByRole('button', { name: 'Anulează' }));
    expect(publishEventConfig).not.toHaveBeenCalled();
  });

  it('confirmarea publică ediția ciornei', async () => {
    await deschideCiorna();
    fireEvent.click(screen.getByRole('button', { name: 'Publică' }));
    fireEvent.click(screen.getByRole('button', { name: /Da, publică/ }));

    await waitFor(() => expect(publishEventConfig).toHaveBeenCalledWith('t', SNAPSHOT_CONFIG.number));
  });
});

describe('„Publică" trimite ce e pe ecran', () => {
  /** Deschide ciorna, schimbă un câmp, confirmă publicarea. */
  const publicaDupaOEditare = async (valoare = 'Winter Trial') => {
    await deschideCiorna();
    fireEvent.change(camp('Numele evenimentului'), { target: { value: valoare } });
    fireEvent.click(screen.getByRole('button', { name: 'Publică' }));
    fireEvent.click(screen.getByRole('button', { name: /Da, publică/ }));
  };

  it('salvează documentul editat ÎNAINTE de a publica', async () => {
    await publicaDupaOEditare();

    await waitFor(() => expect(publishEventConfig).toHaveBeenCalledTimes(1));
    expect(saveEventConfigDraft).toHaveBeenCalledTimes(1);
    // Ordinea e tot fixul: publicarea citește rândul pe care tocmai l-am scris.
    expect(saveEventConfigDraft.mock.invocationCallOrder[0]).toBeLessThan(
      publishEventConfig.mock.invocationCallOrder[0]
    );
  });

  it('documentul salvat poartă editarea, nu ciorna veche de pe server', async () => {
    // Garda împotriva succesului FALS: cu o ciornă pe server, varianta veche
    // publica documentul ei și zicea „Ediția N e publicată".
    await publicaDupaOEditare();

    await waitFor(() => expect(saveEventConfigDraft).toHaveBeenCalledTimes(1));
    const [, editie, doc] = saveEventConfigDraft.mock.calls[0];
    expect(editie).toBe(SNAPSHOT_CONFIG.number);
    expect(doc.eventName).toBe('Winter Trial');
  });

  it('dacă salvarea e refuzată, nu se publică nimic', async () => {
    saveEventConfigDraft.mockRejectedValue(new Error('network'));
    await publicaDupaOEditare();

    await waitFor(() => expect(saveEventConfigDraft).toHaveBeenCalledTimes(1));
    expect(publishEventConfig).not.toHaveBeenCalled();
  });

  it('o salvare refuzată nu anunță succesul', async () => {
    saveEventConfigDraft.mockRejectedValue(new Error('network'));
    await publicaDupaOEditare();

    await waitFor(() => expect(saveEventConfigDraft).toHaveBeenCalledTimes(1));
    expect(showToast).not.toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'success' })
    );
  });

  it('confirmarea spune că salvează, nu doar că publică', async () => {
    await deschideCiorna();
    fireEvent.click(screen.getByRole('button', { name: 'Publică' }));
    // Organizatorul trebuie să afle CE face „Da, publică" înainte să apese.
    // Nota de jos zice deja „rămâne salvată" despre versiunea veche — deci
    // căutăm exact promisiunea despre ciorna de pe ecran.
    expect(
      within(screen.getByRole('alertdialog')).getByText(/salvează ciorna așa cum arată acum/i)
    ).toBeTruthy();
  });
});

describe('formularul e blocat cât ține publicarea', () => {
  /** O promisiune pe care o rezolvăm noi, ca să inspectăm starea din zbor. */
  const publicarePeLoc = () => {
    let elibereaza!: (v: string) => void;
    publishEventConfig.mockReturnValue(
      new Promise<string>((res) => {
        elibereaza = res;
      })
    );
    return () => elibereaza('pub-id');
  };

  it('„Salvează" e dezactivat cât timp publicarea e în zbor', async () => {
    const elibereaza = publicarePeLoc();
    await deschideCiorna();
    fireEvent.click(screen.getByRole('button', { name: 'Publică' }));
    fireEvent.click(screen.getByRole('button', { name: /Da, publică/ }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Se publică…' })).toBeTruthy()
    );
    expect(screen.getByRole('button', { name: 'Salvează' }).hasAttribute('disabled')).toBe(
      true
    );
    elibereaza();
  });

  it('o editare din zbor nu poate ajunge la server pe furiș', async () => {
    // Apelurile await țin `ciorna` pe care au capturat-o. Dacă textul s-ar
    // putea schimba între timp, s-ar publica instantaneul vechi ȘI s-ar
    // raporta succes — exact eșecul pe care U1 îl închide.
    const elibereaza = publicarePeLoc();
    await deschideCiorna();
    fireEvent.click(screen.getByRole('button', { name: 'Publică' }));
    fireEvent.click(screen.getByRole('button', { name: /Da, publică/ }));

    await waitFor(() => expect(saveEventConfigDraft).toHaveBeenCalledTimes(1));
    expect(camp('Numele evenimentului').hasAttribute('disabled')).toBe(true);
    elibereaza();
  });
});

describe('publicarea trimite ce e pe ecran chiar și peste o ciornă veche de pe server', () => {
  it('documentul publicat e cel editat, nu ciorna care era deja salvată', async () => {
    // Cazul real din #12, în forma lui cea mai rea: EXISTĂ o ciornă pe server,
    // deci vechea variantă nu cădea cu `no_draft` — publica documentul ei și
    // raporta succes. Fără rândul ăsta în fixtură, testul n-ar putea pica.
    listEventConfig.mockResolvedValue([
      rand({
        id: 'ciorna-veche',
        status: 'draft',
        published_at: null,
        config: { ...SNAPSHOT_CONFIG, eventName: 'Ciorna Veche' },
      }),
      rand(),
    ]);
    randeaza();
    // Tabul deschide singur ciorna de pe server.
    await waitFor(() => expect(camp('Numărul ediției')).toBeTruthy());
    deschideGrupurile();
    expect(camp('Numele evenimentului').value).toBe('Ciorna Veche');

    fireEvent.change(camp('Numele evenimentului'), { target: { value: 'Winter Trial' } });
    fireEvent.click(screen.getByRole('button', { name: 'Publică' }));
    fireEvent.click(screen.getByRole('button', { name: /Da, publică/ }));

    await waitFor(() => expect(saveEventConfigDraft).toHaveBeenCalledTimes(1));
    const [, , doc] = saveEventConfigDraft.mock.calls[0];
    expect(doc.eventName).toBe('Winter Trial');
    await waitFor(() => expect(publishEventConfig).toHaveBeenCalledTimes(1));
  });
});
