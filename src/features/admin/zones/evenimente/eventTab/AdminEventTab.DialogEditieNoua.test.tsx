import { describe, it, expect } from 'vitest';
import { screen, fireEvent, within } from '@testing-library/react';
import { SNAPSHOT_CONFIG } from '../../../../../shared/content/eventConfig';

import { rand, randeaza, deschideCiorna, deschideDialogEditieNoua, creeazaPrinDialog, deschideGrupurile, camp, listEventConfig, saveEventConfigDraft, publishEventConfig } from './test-support';

describe('dialogul de ediție nouă', () => {
  it('crearea nu mai deschide direct formularul, ci întreabă întâi', async () => {
    await deschideDialogEditieNoua();
    expect(screen.getByRole('dialog')).toBeTruthy();
    // Formularul complet NU e deschis: „Numărul ediției" e câmp de-al lui.
    expect(screen.queryByLabelText('Numărul ediției')).toBeNull();
  });

  it('recalculează check-inul față de noul start, nu îl copiază', async () => {
    // Publicat: start 07:00, check-in 06:45. Mutat la 09:00 → 08:45.
    await creeazaPrinDialog('2026-10-03', '09:00');
    deschideGrupurile();
    expect(camp('Check-in de la').value).toBe('08:45');
  });

  it('anunțul ediției nu mai rămâne în urmă', async () => {
    await creeazaPrinDialog('2026-10-03', '09:00');
    deschideGrupurile();
    // Copiat, ar fi rămas pe 2026-09-03T12:00 — un moment deja consumat.
    expect(camp('Se anunță ediția').value).not.toBe(SNAPSHOT_CONFIG.launchAt.slice(0, 16));
    expect(camp('Se anunță ediția').value.startsWith('2026-10-01')).toBe(true);
  });

  it('numărul de locuri ales ajunge în ciornă', async () => {
    await creeazaPrinDialog('2026-10-03', '09:00', '42');
    deschideGrupurile();
    expect(camp('Locuri disponibile').value).toBe('42');
  });

  it('rezumatul enumeră locația și capacitatea moștenite', async () => {
    await deschideDialogEditieNoua();
    fireEvent.change(screen.getByLabelText('Data cursei'), { target: { value: '2026-10-03' } });
    const dialog = within(screen.getByRole('dialog'));
    expect(dialog.getByText('Locația')).toBeTruthy();
    expect(dialog.getByText(new RegExp(SNAPSHOT_CONFIG.venue.name))).toBeTruthy();
    expect(dialog.getByText('Capacitate')).toBeTruthy();
  });

  it('rezumatul arată momentele recalculate cu valoarea NOUĂ', async () => {
    await deschideDialogEditieNoua();
    fireEvent.change(screen.getByLabelText('Data cursei'), { target: { value: '2026-10-03' } });
    fireEvent.change(screen.getByLabelText('Ora startului'), { target: { value: '09:00' } });
    const dialog = within(screen.getByRole('dialog'));
    expect(dialog.getByText('Check-in de la')).toBeTruthy();
    expect(dialog.getByText('08:45')).toBeTruthy();
  });

  it('nu se poate crea nimic până nu e aleasă data', async () => {
    await deschideDialogEditieNoua();
    const creeaza = screen.getByRole('button', { name: 'Creează ciorna' }) as HTMLButtonElement;
    expect(creeaza.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Data cursei'), { target: { value: '2026-10-03' } });
    expect((screen.getByRole('button', { name: 'Creează ciorna' }) as HTMLButtonElement).disabled).toBe(
      false
    );
  });

  it('un start malformat nu poate ajunge în ciornă', async () => {
    // `type="date"` refuză valoarea înainte de validare — o dată malformată nu
    // devine niciodată stare. Mesajul validării există și e testat unitar
    // (`eventConfigForm.test.ts`), pe drumul pe care e încă atins; aici se
    // păzește consecința: dialogul rămâne închis peste o valoare respinsă.
    await deschideDialogEditieNoua();
    fireEvent.change(screen.getByLabelText('Data cursei'), { target: { value: '2026-10' } });
    expect((screen.getByRole('button', { name: 'Creează ciorna' }) as HTMLButtonElement).disabled).toBe(
      true
    );
    expect(saveEventConfigDraft).not.toHaveBeenCalled();
  });

  it('o problemă a ediției publicate oprește ciorna care ar moșteni-o', async () => {
    // Ciorna pornește din documentul publicat, deci îi ia și defectele. Butonul
    // mort fără explicație ar trimite organizatorul să caute greșeala în cele
    // trei câmpuri pe care tocmai le-a completat corect.
    listEventConfig.mockResolvedValue([rand({ config: { ...SNAPSHOT_CONFIG, eventName: '  ' } })]);
    await deschideDialogEditieNoua();
    fireEvent.change(screen.getByLabelText('Data cursei'), { target: { value: '2026-10-03' } });
    const dialog = within(screen.getByRole('dialog'));
    expect(dialog.getByText(/Numele evenimentului nu poate fi gol/)).toBeTruthy();
    expect((dialog.getByRole('button', { name: 'Creează ciorna' }) as HTMLButtonElement).disabled).toBe(
      true
    );
  });

  it('anularea nu deschide nicio ciornă și nu scrie nimic', async () => {
    await deschideDialogEditieNoua();
    fireEvent.change(screen.getByLabelText('Data cursei'), { target: { value: '2026-10-03' } });
    fireEvent.click(screen.getByRole('button', { name: 'Anulează' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText(/Nicio ciornă deschisă/)).toBeTruthy();
    expect(saveEventConfigDraft).not.toHaveBeenCalled();
  });

  it('formularul complet rămâne accesibil, ca „editează tot"', async () => {
    randeaza();
    fireEvent.click(
      await screen.findByRole('button', {
        name: new RegExp(`Editează ediția ${SNAPSHOT_CONFIG.number}`),
      })
    );
    deschideGrupurile();
    expect(camp('Numărul ediției').value).toBe(String(SNAPSHOT_CONFIG.number));
  });
});

describe('dialogurile tabului au tastatură', () => {
  it('Escape închide confirmarea publicării, fără să publice', async () => {
    await deschideCiorna();
    fireEvent.click(screen.getByRole('button', { name: 'Publică' }));

    fireEvent.keyDown(screen.getByRole('alertdialog'), { key: 'Escape' });
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(publishEventConfig).not.toHaveBeenCalled();
  });

  it('Escape închide dialogul de ediție nouă, fără să deschidă vreo ciornă', async () => {
    await deschideDialogEditieNoua();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Renunță' })).toBeNull();
    expect(saveEventConfigDraft).not.toHaveBeenCalled();
  });

  it('dialogul de ediție nouă deschide focusul pe primul câmp', async () => {
    await deschideDialogEditieNoua();
    expect(document.activeElement).toBe(screen.getByLabelText('Data cursei'));
  });
});
