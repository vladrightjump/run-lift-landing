// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { ListaOrdonabila } from './ListaOrdonabila';

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

describe('lista ordonabilă — reordonare fără buton de direcție pe rând', () => {
  const ELEMENTE = [
    { id: '1', nume: 'Primul' },
    { id: '2', nume: 'Al doilea' },
    { id: '3', nume: 'Al treilea' },
  ];

  const randeaza = (onMuta = vi.fn(), dezactivat = false) => {
    render(
      <ListaOrdonabila
        eticheta="Ordinea clipurilor"
        elemente={ELEMENTE.map((e) => ({ id: e.id, nume: e.nume, continut: <span>{e.nume}</span> }))}
        onMuta={onMuta}
        dezactivat={dezactivat}
      />
    );
    return onMuta;
  };

  it('nu are butoane de direcție pe rând', () => {
    // Erau două pe fiecare rând — jumătate dintre ele mereu dezactivate.
    randeaza();
    expect(screen.queryByRole('button', { name: /mai sus/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /mai jos/i })).toBeNull();
  });

  it('alegerea poziției mută elementul acolo', () => {
    const onMuta = randeaza();
    fireEvent.change(screen.getByLabelText('Poziția pentru „Al treilea”'), {
      target: { value: '1' },
    });
    expect(onMuta).toHaveBeenCalledWith('3', 1);
  });

  it('fiecare rând oferă toate pozițiile, inclusiv pe a lui', () => {
    // O listă care ascunde poziția curentă ar sări un număr și ar face
    // alegerea greu de citit: „2, 3" pentru un element aflat pe 1.
    randeaza();
    const control = screen.getByLabelText('Poziția pentru „Primul”') as HTMLSelectElement;
    expect([...control.options].map((o) => o.value)).toEqual(['1', '2', '3']);
    expect(control.value).toBe('1');
  });

  it('cu un singur element nu se oferă reordonare', () => {
    render(
      <ListaOrdonabila
        eticheta="Ordinea clipurilor"
        elemente={[{ id: '1', nume: 'Singurul', continut: <span>Singurul</span> }]}
        onMuta={vi.fn()}
      />
    );
    expect(screen.queryByLabelText(/Poziția pentru/)).toBeNull();
  });

  it('lista goală nu pică și nu randează controale', () => {
    render(
      <ListaOrdonabila eticheta="Ordinea clipurilor" elemente={[]} onMuta={vi.fn()} />
    );
    expect(screen.queryByLabelText(/Poziția pentru/)).toBeNull();
  });

  it('cât timp e ocupat, pozițiile nu se pot schimba', () => {
    randeaza(vi.fn(), true);
    expect(screen.getByLabelText('Poziția pentru „Primul”')).toHaveProperty('disabled', true);
  });
});
