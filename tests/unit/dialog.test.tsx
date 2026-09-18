import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { Dialog } from '../../src/admin/eventTab/Dialog';

/**
 * Dialogul modal al tabului „Eveniment".
 *
 * Contractul păzit: un dialog care ACOPERĂ formularul nu are voie să lase
 * tabularea să plece prin el, în câmpurile de dedesubt pe care nu le mai vezi —
 * și se închide cu Escape, ca orice dialog.
 */

afterEach(cleanup);

const randeaza = (onInchide = vi.fn()) => {
  const utile = render(
    <>
      <button type="button">de unde s-a deschis</button>
      <Dialog titlu="Publici ediția 7?" onInchide={onInchide}>
        <p>Textul dialogului.</p>
        <button type="button">Da, publică</button>
        <button type="button">Anulează</button>
      </Dialog>
    </>
  );
  return { ...utile, onInchide };
};

describe('Dialog', () => {
  it('primește focusul la deschidere, pe primul control', () => {
    randeaza();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Da, publică' }));
  });

  it('titlul e numele accesibil al dialogului', () => {
    randeaza();
    expect(screen.getByRole('dialog', { name: 'Publici ediția 7?' })).toBeDefined();
  });

  it('Escape îl închide', () => {
    const { onInchide } = randeaza();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onInchide).toHaveBeenCalledTimes(1);
  });

  it('clicul pe overlay îl închide, clicul pe conținut nu', () => {
    const { onInchide } = randeaza();
    fireEvent.click(screen.getByRole('dialog'));
    expect(onInchide).not.toHaveBeenCalled();

    fireEvent.click(document.querySelector('.admin-confirm-overlay') as HTMLElement);
    expect(onInchide).toHaveBeenCalledTimes(1);
  });

  it('Tab de pe ultimul element se întoarce pe primul', () => {
    randeaza();
    const ultimul = screen.getByRole('button', { name: 'Anulează' });
    ultimul.focus();

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Tab' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Da, publică' }));
  });

  it('Shift+Tab de pe primul element merge pe ultimul', () => {
    randeaza();
    const primul = screen.getByRole('button', { name: 'Da, publică' });
    primul.focus();

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Anulează' }));
  });

  it('la închidere, focusul se întoarce de unde a plecat', () => {
    const declansator = document.createElement('button');
    document.body.appendChild(declansator);
    declansator.focus();

    const { unmount } = render(
      <Dialog titlu="Ediția 8" onInchide={vi.fn()}>
        <button type="button">Creează ciorna</button>
      </Dialog>
    );
    expect(document.activeElement).not.toBe(declansator);

    unmount();
    expect(document.activeElement).toBe(declansator);
    declansator.remove();
  });

  it('rolul `alertdialog` e disponibil pentru deciziile ireversibile', () => {
    render(
      <Dialog titlu="Publici?" rol="alertdialog" onInchide={vi.fn()}>
        <button type="button">Da</button>
      </Dialog>
    );
    expect(screen.getByRole('alertdialog', { name: 'Publici?' })).toBeDefined();
  });

  it('un dialog fără controale focusabile primește el însuși focusul', () => {
    render(
      <Dialog titlu="Doar text" onInchide={vi.fn()}>
        <p>Nimic de apăsat.</p>
      </Dialog>
    );
    expect(document.activeElement).toBe(screen.getByRole('dialog'));
  });
});
