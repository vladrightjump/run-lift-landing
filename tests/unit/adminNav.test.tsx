import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { AdminNav } from '../../src/admin/AdminNav';
import { AdminEditionTabs } from '../../src/admin/AdminEditionTabs';
import type { EcranAdmin } from '../../src/admin/stareCurenta';
import type { AdminEdition } from '../../src/lib/adminApi';

/**
 * Navigația și selectorul de ediție.
 *
 * Ce se păzește aici: controalele nu promit mai mult decât fac. Un `role="tab"`
 * fără `tabpanel` și fără săgeți, sau un `<select>` care arată o ediție aleasă
 * când nu e aleasă niciuna, sînt amândouă aceeași greșeală — interfața spune
 * altceva decât starea reală.
 */

afterEach(cleanup);

const CONTOARE = {
  desfasurare: null,
  participanti: 20,
  email: null,
  livrare: null,
  lansare: 41,
  sabloane: null,
  eveniment: null,
  clipuri: null,
  antrenament: null,
  'coming-soon': null,
} as Record<EcranAdmin, number | null>;

const randeazaNav = (onEcran = vi.fn()) => {
  render(<AdminNav onEcran={onEcran} contorEcran={CONTOARE} nelivrate={0} />);
  return onEcran;
};

describe('registrul arată ce e în fiecare ecran, fără să-l deschizi', () => {
  it('nu declară semantică de tab fără tabpanel-uri', () => {
    // A fost `role="tab"` + `aria-selected`, dar fără `aria-controls`, fără
    // `tabpanel` și fără navigare cu săgeți. Un cititor de ecran anunța
    // „tab 1 din 3" și săgeata nu făcea nimic.
    randeazaNav();
    expect(document.querySelectorAll('[role="tab"]')).toHaveLength(0);
    expect(document.querySelectorAll('[role="tablist"]')).toHaveLength(0);
  });

  it('este o navigație cu nume, nu butoane răzlețe', () => {
    randeazaNav();
    expect(screen.getByRole('navigation', { name: /Toate ecranele/ })).toBeTruthy();
    expect(document.querySelectorAll('.admin-registru-lista').length).toBeGreaterThan(0);
  });

  it('arată descrierea fiecărui ecran, nu doar numele', () => {
    // Descrierile existau și înainte, dar ajungeau doar în `title`: se citeau
    // numai la hover, numai cu mouse, niciodată de un cititor de ecran.
    randeazaNav();
    expect(screen.getByText('Ce email a ajuns la cine și ce n-a ajuns')).toBeTruthy();
    expect(
      screen.getByText('Programul săptămânal — ce scrie pe pagina de antrenament')
    ).toBeTruthy();
  });

  it('toate grupurile sînt deschise odată — nimic nu cere un clic ca să se vadă', () => {
    randeazaNav();
    for (const nume of ['Oameni', 'Comunicare', 'Conținutul site-ului']) {
      expect(screen.getByText(nume)).toBeTruthy();
    }
    expect(screen.getByRole('button', { name: /Trimite emailuri/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Clipuri/ })).toBeTruthy();
  });

  it('nu se listează pe sine — registrul stă deja pe ecranul de pornire', () => {
    randeazaNav();
    expect(screen.queryByRole('button', { name: /Desfășurarea ediției/ })).toBeNull();
  });

  it('un clic deschide ecranul', () => {
    const onEcran = randeazaNav();
    fireEvent.click(screen.getByRole('button', { name: /Trimite emailuri/ }));
    expect(onEcran).toHaveBeenCalledWith('email');
  });

  it('antrenamentele se deschid din registru, nu dintr-o manetă a cromului', () => {
    const onEcran = randeazaNav();
    fireEvent.click(screen.getByRole('button', { name: /Antrenamente/ }));
    expect(onEcran).toHaveBeenCalledWith('antrenament');
  });

  it('contorul spune ce e înăuntru fără să deschizi', () => {
    randeazaNav();
    expect(screen.getByRole('button', { name: /Participanți/ }).textContent).toContain('20');
  });

  it('emailurile nelivrate sînt o alertă, nu un contor', () => {
    render(<AdminNav onEcran={vi.fn()} contorEcran={CONTOARE} nelivrate={3} />);
    const livrare = screen.getByRole('button', { name: /Livrare/ });
    expect(livrare.querySelector('.admin-tab-alert')?.textContent).toBe('3');
  });
});

describe('selectorul de ediție nu arată o alegere care nu s-a făcut', () => {
  const editie = (over: Partial<AdminEdition> = {}): AdminEdition => ({
    editie: 5,
    participanti: 20,
    asteptare: 3,
    lansare: 41,
    prima: null,
    ultima: null,
    este_curenta: true,
    ...over,
  });

  const select = () => screen.getByLabelText('Ediția') as HTMLSelectElement;

  it('cu lista sosită dar nicio ediție aleasă, nu afișează prima ca selectată', () => {
    // Se întâmplă când backendul nu marchează nicio ediție drept curentă:
    // controlul ar fi arătat „Ediția 5 … curentă" în timp ce tabelele de
    // dedesubt filtrează pe nimic.
    render(
      <AdminEditionTabs
        editions={[editie({ editie: 5, este_curenta: false }), editie({ editie: 4, este_curenta: false })]}
        selected={null}
        onSelect={vi.fn()}
        onCreate={vi.fn()}
        creating={false}
      />
    );
    expect(select().value).toBe('');
    expect(screen.getByText('Alege ediția…')).toBeTruthy();
  });

  it('cu o ediție aleasă, o arată pe ea și nu mai oferă placeholderul', () => {
    render(
      <AdminEditionTabs
        editions={[editie()]}
        selected={5}
        onSelect={vi.fn()}
        onCreate={vi.fn()}
        creating={false}
      />
    );
    expect(select().value).toBe('5');
    expect(screen.queryByText('Alege ediția…')).toBeNull();
  });

  it('alegerea trimite numărul ediției, nu textul', () => {
    const onSelect = vi.fn();
    render(
      <AdminEditionTabs
        editions={[editie(), editie({ editie: 4, este_curenta: false })]}
        selected={5}
        onSelect={onSelect}
        onCreate={vi.fn()}
        creating={false}
      />
    );
    fireEvent.change(select(), { target: { value: '4' } });
    expect(onSelect).toHaveBeenCalledWith(4);
  });

  it('fără nicio ediție, spune asta în loc să pară gol', () => {
    render(
      <AdminEditionTabs
        editions={[]}
        selected={null}
        onSelect={vi.fn()}
        onCreate={vi.fn()}
        creating={false}
      />
    );
    expect(screen.getByText('Nicio ediție încă')).toBeTruthy();
  });
});
