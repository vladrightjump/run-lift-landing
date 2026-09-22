// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { ListaDerulanta } from '../../src/admin/controale/ListaDerulanta';
import { GrupRadio } from '../../src/admin/controale/GrupRadio';
import { ListaOrdonabila } from '../../src/admin/controale/ListaOrdonabila';

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
