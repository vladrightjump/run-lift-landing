// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { DialogPrezenta, normalizeazaTimp } from '../../src/admin/DialogPrezenta';
import type { AdminRegistration } from '../../src/lib/adminApi';

/**
 * Formularul de prezență.
 *
 * Miza e starea a treia. `prezent` are voie să fie `null` — „încă nu se știe" —
 * iar o bifă obișnuită n-ar putea s-o exprime: ar scrie „n-a venit" pe toată
 * lista din clipa înscrierii, cu săptămâni înainte de cursă. Restul e
 * normalizarea timpului, care traduce ce se tastează în ce înțelege `interval`.
 */

const RAND: AdminRegistration = {
  id: 'r1',
  created_at: '2026-08-20T10:00:00Z',
  nume: 'Ana Popescu',
  telefon: '+40700000000',
  email: 'ana@exemplu.ro',
  echipa: '',
  editie: 6,
  dezabonat_la: null,
};

const monteaza = (rand: AdminRegistration = RAND, ocupat = false) => {
  const onSalveaza = vi.fn();
  const onInchide = vi.fn();
  render(
    <DialogPrezenta rand={rand} ocupat={ocupat} onSalveaza={onSalveaza} onInchide={onInchide} />
  );
  return { onSalveaza, onInchide };
};

const camp = (eticheta: string) => screen.getByLabelText(eticheta) as HTMLInputElement;
const salveaza = () => fireEvent.click(screen.getByRole('button', { name: 'Salvează' }));

afterEach(cleanup);

describe('normalizeazaTimp', () => {
  it('minute și secunde devin HH:MM:SS', () => {
    expect(normalizeazaTimp('32:15')).toBe('00:32:15');
  });

  it('cu ore, la fel', () => {
    expect(normalizeazaTimp('1:02:15')).toBe('01:02:15');
  });

  it('peste 24 de ore rămâne durată', () => {
    expect(normalizeazaTimp('26:00:00')).toBe('26:00:00');
  });

  /** `null` = șterge timpul. Distinct de `undefined` = textul e stricat. */
  it('golul e null, nu eroare', () => {
    expect(normalizeazaTimp('')).toBeNull();
    expect(normalizeazaTimp('   ')).toBeNull();
  });

  it('ce nu se înțelege e undefined, ca apelantul să refuze salvarea', () => {
    expect(normalizeazaTimp('cam 30 de minute')).toBeUndefined();
    expect(normalizeazaTimp('32')).toBeUndefined();
    expect(normalizeazaTimp('32:75')).toBeUndefined();
  });
});

describe('DialogPrezenta — cele trei stări ale prezenței', () => {
  it('un rând necompletat pornește pe „încă nu se știe"', () => {
    monteaza();
    expect(camp('Încă nu se știe').checked).toBe(true);
    expect(camp('A venit').checked).toBe(false);
    expect(camp('N-a venit').checked).toBe(false);
  });

  it('„încă nu se știe" se trimite ca null, nu ca false', () => {
    const { onSalveaza } = monteaza();
    salveaza();
    expect(onSalveaza).toHaveBeenCalledWith({ prezent: null, numar: null, timp_final: null });
  });

  it('„n-a venit" e o afirmație distinctă, și se trimite ca false', () => {
    const { onSalveaza } = monteaza();
    fireEvent.click(camp('N-a venit'));
    salveaza();
    expect(onSalveaza.mock.calls[0][0].prezent).toBe(false);
  });

  it('un rând deja completat își reia starea', () => {
    monteaza({ ...RAND, prezent: true, numar: 12, timp_final: '00:32:15' });
    expect(camp('A venit').checked).toBe(true);
    expect(camp('Număr de concurs').value).toBe('12');
    expect(camp('Timp final').value).toBe('00:32:15');
  });

  it('prezența se poate întoarce la „nu se știe" — greșelile se corectează', () => {
    const { onSalveaza } = monteaza({ ...RAND, prezent: true });
    fireEvent.click(camp('Încă nu se știe'));
    salveaza();
    expect(onSalveaza.mock.calls[0][0].prezent).toBeNull();
  });
});

describe('DialogPrezenta — numărul și timpul', () => {
  it('trimite tripleta completă, normalizată', () => {
    const { onSalveaza } = monteaza();
    fireEvent.click(camp('A venit'));
    fireEvent.change(camp('Număr de concurs'), { target: { value: '7' } });
    fireEvent.change(camp('Timp final'), { target: { value: '32:15' } });
    salveaza();
    expect(onSalveaza).toHaveBeenCalledWith({
      prezent: true,
      numar: 7,
      timp_final: '00:32:15',
    });
  });

  /**
   * `null` ȘTERGE, deliberat: dacă golul ar însemna „lasă neatins", un număr
   * pus din greșeală n-ar mai putea fi scos niciodată.
   */
  it('golirea câmpurilor trimite null, adică șterge', () => {
    const { onSalveaza } = monteaza({ ...RAND, numar: 12, timp_final: '00:32:15' });
    fireEvent.change(camp('Număr de concurs'), { target: { value: '' } });
    fireEvent.change(camp('Timp final'), { target: { value: '' } });
    salveaza();
    expect(onSalveaza.mock.calls[0][0]).toMatchObject({ numar: null, timp_final: null });
  });

  it('un timp de neînțeles oprește salvarea și spune cum se scrie', () => {
    const { onSalveaza } = monteaza();
    fireEvent.change(camp('Timp final'), { target: { value: 'vreo 30 de minute' } });
    salveaza();
    expect(onSalveaza).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain('32:15');
  });

  it('un număr zero sau negativ oprește salvarea', () => {
    const { onSalveaza } = monteaza();
    fireEvent.change(camp('Număr de concurs'), { target: { value: '0' } });
    salveaza();
    expect(onSalveaza).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('eroarea dispare după corectare', () => {
    const { onSalveaza } = monteaza();
    fireEvent.change(camp('Timp final'), { target: { value: 'aiurea' } });
    salveaza();
    expect(screen.queryByRole('alert')).toBeTruthy();

    fireEvent.change(camp('Timp final'), { target: { value: '32:15' } });
    salveaza();
    expect(onSalveaza).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('DialogPrezenta — cât timp salvează', () => {
  it('câmpurile și butoanele sunt inerte', () => {
    monteaza(RAND, true);
    expect(camp('Număr de concurs').disabled).toBe(true);
    expect(camp('Timp final').disabled).toBe(true);
    expect(camp('A venit').disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Salvează' }) as HTMLButtonElement).disabled).toBe(
      true
    );
  });
});
