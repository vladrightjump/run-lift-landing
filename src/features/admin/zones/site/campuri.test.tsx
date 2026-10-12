// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { CampEditare } from './campuri';

afterEach(cleanup);

describe('ajutorul unui câmp e vizibil înainte de a greși', () => {
  it('descrierea se vede fără nicio interacțiune', () => {
    render(
      <CampEditare
        eticheta="Linkul postării"
        ajutor="Adresa spre care duce „vezi pe Instagram” de sub clip."
      >
        <input />
      </CampEditare>
    );
    expect(
      screen.getByText('Adresa spre care duce „vezi pe Instagram” de sub clip.')
    ).toBeTruthy();
  });

  it('un câmp obligatoriu o spune, nu o lasă pe seama validării', () => {
    render(
      <CampEditare eticheta="Linkul postării" obligatoriu>
        <input />
      </CampEditare>
    );
    expect(screen.getByText('obligatoriu')).toBeTruthy();
  });

  it('problema apare lângă câmp, anunțată, nu doar colorată', () => {
    render(
      <CampEditare eticheta="Linkul postării" problema="Lipsește linkul">
        <input />
      </CampEditare>
    );
    expect(screen.getByRole('alert').textContent).toBe('Lipsește linkul');
  });

  it('eticheta e legată de controlul din slot', () => {
    render(
      <CampEditare eticheta="Legenda">
        <input />
      </CampEditare>
    );
    expect(screen.getByLabelText(/Legenda/)).toBeTruthy();
  });
});
