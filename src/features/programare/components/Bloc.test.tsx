import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { blocProgram, profilSportiv } from '../../../../tests/support/builders/programare';
import { Bloc } from './Bloc';

describe('Bloc în prescripția completă', () => {
  it('păstrează prefixul sursei și toate grupurile de seturi din superset', () => {
    const baza = blocProgram();
    const set = baza.seturi[0];
    render(<Bloc bloc={blocProgram({ parametri: { prefix: 'H' }, seturi: [set, { ...set, id: 'set-2', ordine: 2 }, { ...set, id: 'set-3', ordine: 3, repetari: '3' }, { ...set, id: 'set-4', exercitiu: 2, ordine: 4, miscare: { ...set.miscare, id: 'miscare-2', nume: 'Fandare demo' } }] })} profil={profilSportiv()} extins onVideo={vi.fn()} />);
    expect(screen.getByRole('region', { name: 'Bloc H' })).toBeDefined();
    expect(screen.getByText('3 seturi alternante din:')).toBeDefined();
    expect(screen.getByText('2 × 5 Genuflexiune demo · 20 kg')).toBeDefined();
    expect(screen.getByText('3 Genuflexiune demo · 20 kg')).toBeDefined();
    expect(screen.getByText('5 Fandare demo · 20 kg')).toBeDefined();
    expect(screen.getAllByText('H1.')).toHaveLength(2);
    expect(screen.getByText('H2.')).toBeDefined();
  });

  it('nu dublează instrucțiunile blocului copiate pe set și nu arată notele rezervate antrenorului', () => {
    const set = blocProgram().seturi[0];
    render(<Bloc bloc={blocProgram({ instructiuni_inainte: 'Înainte demo.', instructiuni_dupa: 'După demo.', note_antrenor: 'Notă privată demo.', seturi: [{ ...set, provenienta: { componenta: { preInstructions: 'Înainte demo.', postInstructions: 'După demo.', notesForCoaches: 'Altă notă privată demo.' } } }] })} profil={profilSportiv()} extins onVideo={vi.fn()} />);
    expect(screen.getAllByText('Înainte demo.')).toHaveLength(1);
    expect(screen.getAllByText('După demo.')).toHaveLength(1);
    expect(screen.queryByText('Notă privată demo.')).toBeNull();
    expect(screen.queryByText('Altă notă privată demo.')).toBeNull();
  });

  it('arată textul liber, criteriul de scor și țintele textuale fără să inventeze numere', () => {
    const set = blocProgram().seturi[0];
    render(<Bloc bloc={blocProgram({ tip: 'generic', text: 'Ritm confortabil demo.', parametri: { prefix: 'Z', criteriu_scor: 'Repetări' }, seturi: [{ ...set, repetari: 'X', incarcare: null, pauza_tip: 'dupa_nevoie', tinte_text: { durata_sec: 'max' } }] })} profil={profilSportiv()} extins onVideo={vi.fn()} />);
    expect(screen.getByText('Ritm confortabil demo.')).toBeDefined();
    expect(screen.getByText('Scor: Repetări')).toBeDefined();
    expect(screen.getByText('X Genuflexiune demo · max secunde')).toBeDefined();
    expect(screen.getByText('Pauză după nevoie')).toBeDefined();
  });
});
