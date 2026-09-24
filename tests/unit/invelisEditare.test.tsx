// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { InvelisEditare, type StareBara } from '../../src/admin/continut/InvelisEditare';
import { CampEditare } from '../../src/admin/continut/campuri';

/**
 * Învelișul comun al ecranelor de conținut.
 *
 * Ce se păzește aici: cele patru ecrane care schimbă ce vede vizitatorul se
 * comportau ca trei lucruri diferite. „Evenimentul" avea ciornă, previzualizare
 * și validare care blochează publicarea; antrenamentele aveau istoric de
 * versiuni dar nici ciornă, nici previzualizare, și un singur verb; clipurile
 * n-aveau niciuna și scriau direct.
 *
 * Învelișul nu generalizează CÂMPURILE — alea rămân ale fiecărui ecran. El ține
 * succesiunea și verbele.
 */

afterEach(cleanup);

const BARA: StareBara = {
  identitate: <strong>Ediția 5</strong>,
  nesalvat: false,
  probleme: [],
  refuz: null,
  ocupat: false,
  poatePublica: true,
  onSalveaza: vi.fn(),
  onPublica: vi.fn(),
  seSalveaza: false,
  sePublica: false,
};

const randeaza = (bara: Partial<StareBara> = {}) =>
  render(
    <InvelisEditare titlu="Evenimentul" bara={{ ...BARA, ...bara }}>
      <p>corpul editorului</p>
    </InvelisEditare>
  );

describe('verbele sînt aceleași pe orice ecran de conținut', () => {
  it('oferă salvare și publicare, cu aceleași cuvinte', () => {
    randeaza();
    expect(screen.getByRole('button', { name: 'Salvează' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Publică' })).toBeTruthy();
  });

  it('în timpul scrierii spune ce se întâmplă, nu doar că e ocupat', () => {
    randeaza({ seSalveaza: true, ocupat: true });
    expect(screen.getByRole('button', { name: 'Se salvează…' })).toBeTruthy();
  });

  it('cât timp e ocupat, publicarea nu se poate declanșa a doua oară', () => {
    randeaza({ ocupat: true });
    expect(screen.getByRole('button', { name: 'Publică' })).toHaveProperty('disabled', true);
  });

  it('un document deja public oferă doar „Publică" — nicio salvare fără previzualizare', () => {
    randeaza({ onSalveaza: undefined });
    expect(screen.queryByRole('button', { name: 'Salvează' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Publică' })).toBeTruthy();
  });

  it('fără bară, ecranul nu oferă verbe — cazul „n-ai deschis nimic"', () => {
    render(
      <InvelisEditare titlu="Evenimentul" bara={null}>
        <p>corpul editorului</p>
      </InvelisEditare>
    );
    expect(screen.queryByRole('button', { name: 'Publică' })).toBeNull();
  });
});

describe('bara spune starea documentului în cuvinte', () => {
  it('nesalvat se vede, nu se deduce', () => {
    randeaza({ nesalvat: true });
    expect(screen.getByText('Nesalvat')).toBeTruthy();
  });

  it('problemele de validare blochează publicarea și spun CÂTE', () => {
    randeaza({ probleme: ['start', 'slots'], poatePublica: false });
    expect(screen.getByRole('button', { name: '2 câmpuri de reparat' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Publică' })).toHaveProperty('disabled', true);
  });

  it('o singură problemă se spune la singular', () => {
    randeaza({ probleme: ['start'], poatePublica: false });
    expect(screen.getByRole('button', { name: '1 câmp de reparat' })).toBeTruthy();
  });

  it('problemele au întâietate față de un refuz vechi al serverului', () => {
    // Un refuz vechi n-are ce concura cu ce blochează chiar acum publicarea.
    randeaza({ probleme: ['start'], refuz: 'Serverul a refuzat', poatePublica: false });
    expect(screen.queryByText('Serverul a refuzat')).toBeNull();
  });

  it('refuzul serverului se vede când nu e nicio problemă de validare', () => {
    randeaza({ refuz: 'Serverul a refuzat' });
    expect(screen.getByText('Serverul a refuzat')).toBeTruthy();
  });
});

describe('previzualizarea arată ce va vedea vizitatorul', () => {
  it('cu modificări nesalvate e un buton: previzualizarea scrie întâi', () => {
    const onPreviz = vi.fn();
    randeaza({ nesalvat: true, onPreviz, urlPreviz: '/?config=draft' });
    fireEvent.click(screen.getByRole('button', { name: 'Salvează și previzualizează' }));
    expect(onPreviz).toHaveBeenCalled();
  });

  it('fără modificări rămâne o ancoră — cu Cmd-click și click de mijloc cu tot', () => {
    randeaza({ onPreviz: vi.fn(), urlPreviz: '/?config=draft' });
    const link = screen.getByRole('link', { name: 'Previzualizează' });
    expect(link.getAttribute('href')).toBe('/?config=draft');
  });

  it('un ecran fără previzualizare nu o promite', () => {
    randeaza();
    expect(screen.queryByRole('link', { name: 'Previzualizează' })).toBeNull();
    expect(screen.queryByRole('button', { name: /previzualiz/i })).toBeNull();
  });
});

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
