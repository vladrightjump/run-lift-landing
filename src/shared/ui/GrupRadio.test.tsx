// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { GrupRadio } from './GrupRadio';

/**
 * Primitivele de control.
 *
 * Ce se păzește aici: controlul se alege după FORMA alegerii, nu după ce e mai
 * rapid de randat. În tot `src/features/admin/` erau 108 butoane față de 9 liste
 * derulante și un singur buton radio — inclusiv acolo unde alegerea era vădit
 * „una dintre acestea".
 *
 * Și: fiecare primitivă își leagă eticheta de control și își spune problema în
 * cuvinte. Un control fără etichetă legată e mut pentru un cititor de ecran,
 * iar o eroare semnalată doar prin culoare nu există pentru cine n-o vede.
 */

afterEach(cleanup);

describe('grupul radio — o alegere dintre puține variante exclusive', () => {
  const OPTIUNI = [
    { valoare: 'toti', eticheta: 'Toți participanții' },
    { valoare: 'asteptare', eticheta: 'Lista de așteptare', descriere: 'Doar cei fără loc' },
  ];

  it('e un grup cu nume, nu butoane răzlețe', () => {
    render(
      <GrupRadio eticheta="Cui trimiți" valoare="toti" optiuni={OPTIUNI} onSchimba={vi.fn()} />
    );
    expect(screen.getByRole('group', { name: 'Cui trimiți' })).toBeTruthy();
  });

  it('exact una e aleasă odată', () => {
    render(
      <GrupRadio eticheta="Cui trimiți" valoare="toti" optiuni={OPTIUNI} onSchimba={vi.fn()} />
    );
    const alese = screen.getAllByRole('radio').filter((r) => (r as HTMLInputElement).checked);
    expect(alese).toHaveLength(1);
    expect(screen.getByLabelText(/Toți participanții/)).toHaveProperty('checked', true);
  });

  it('alegerea trimite valoarea', () => {
    const onSchimba = vi.fn();
    render(
      <GrupRadio eticheta="Cui trimiți" valoare="toti" optiuni={OPTIUNI} onSchimba={onSchimba} />
    );
    fireEvent.click(screen.getByLabelText(/Lista de așteptare/));
    expect(onSchimba).toHaveBeenCalledWith('asteptare');
  });

  it('descrierea unei variante se vede lângă ea', () => {
    render(
      <GrupRadio eticheta="Cui trimiți" valoare="toti" optiuni={OPTIUNI} onSchimba={vi.fn()} />
    );
    expect(screen.getByText('Doar cei fără loc')).toBeTruthy();
  });
});
