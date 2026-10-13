// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { ListaDerulanta } from './ListaDerulanta';

/**
 * Primitivele de control.
 *
 * Ce se păzește aici: controlul se alege după FORMA alegerii, nu după ce e mai
 * rapid de randat. În tot `src/admin/` erau 108 butoane față de 9 liste
 * derulante și un singur buton radio — inclusiv acolo unde alegerea era vădit
 * „una dintre acestea".
 *
 * Și: fiecare primitivă își leagă eticheta de control și își spune problema în
 * cuvinte. Un control fără etichetă legată e mut pentru un cititor de ecran,
 * iar o eroare semnalată doar prin culoare nu există pentru cine n-o vede.
 */

afterEach(cleanup);

describe('lista derulantă — o alegere dintr-un set care crește', () => {
  const OPTIUNI = [
    { valoare: 'a', eticheta: 'Prima' },
    { valoare: 'b', eticheta: 'A doua' },
  ];

  it('eticheta e legată de control', () => {
    render(
      <ListaDerulanta eticheta="Ediția" valoare="a" optiuni={OPTIUNI} onSchimba={vi.fn()} />
    );
    expect(screen.getByLabelText('Ediția')).toBeTruthy();
  });

  it('alegerea trimite valoarea, nu textul', () => {
    const onSchimba = vi.fn();
    render(
      <ListaDerulanta eticheta="Ediția" valoare="a" optiuni={OPTIUNI} onSchimba={onSchimba} />
    );
    fireEvent.change(screen.getByLabelText('Ediția'), { target: { value: 'b' } });
    expect(onSchimba).toHaveBeenCalledWith('b');
  });

  it('descrierea se vede, nu stă în `title`', () => {
    render(
      <ListaDerulanta
        eticheta="Ediția"
        valoare="a"
        optiuni={OPTIUNI}
        onSchimba={vi.fn()}
        descriere="Ce filtrează alegerea asta"
      />
    );
    expect(screen.getByText('Ce filtrează alegerea asta')).toBeTruthy();
  });

  it('problema e anunțată, nu doar colorată', () => {
    render(
      <ListaDerulanta
        eticheta="Ediția"
        valoare="a"
        optiuni={OPTIUNI}
        onSchimba={vi.fn()}
        problema="Alege o ediție"
      />
    );
    const control = screen.getByLabelText('Ediția');
    expect(control.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByRole('alert').textContent).toBe('Alege o ediție');
  });
});
