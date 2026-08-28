import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { AdminNav } from '../../src/admin/AdminNav';
import { AdminEditionTabs } from '../../src/admin/AdminEditionTabs';
import type { TabAdmin } from '../../src/admin/stareCurenta';
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
  participanti: 20,
  email: null,
  livrare: null,
  lansare: 41,
  sabloane: null,
  eveniment: null,
  'coming-soon': null,
} as Record<TabAdmin, number | null>;

const randeazaNav = (tab: TabAdmin, onTab = vi.fn()) => {
  render(<AdminNav tab={tab} onTab={onTab} contorTab={CONTOARE} nelivrate={0} />);
  return onTab;
};

describe('navigația nu promite un widget pe care nu-l implementează', () => {
  it('nu declară semantică de tab fără tabpanel-uri', () => {
    // A fost `role="tab"` + `aria-selected`, dar fără `aria-controls`, fără
    // `tabpanel` și fără navigare cu săgeți. Un cititor de ecran anunța
    // „tab 1 din 3" și săgeata nu făcea nimic.
    randeazaNav('participanti');
    expect(document.querySelectorAll('[role="tab"]')).toHaveLength(0);
    expect(document.querySelectorAll('[role="tablist"]')).toHaveLength(0);
  });

  it('marchează unde ești prin `aria-current`', () => {
    randeazaNav('livrare');
    const curente = [...document.querySelectorAll('[aria-current="true"]')].map((e) =>
      e.textContent?.trim()
    );
    // Grupul care conține tabul, plus tabul însuși.
    expect(curente.some((t) => t?.startsWith('Comunicare'))).toBe(true);
    expect(curente.some((t) => t?.startsWith('Livrare'))).toBe(true);
  });

  it('este o listă de navigație, nu butoane răzlețe', () => {
    randeazaNav('participanti');
    expect(screen.getByRole('navigation', { name: /Secțiunile/ })).toBeTruthy();
    expect(document.querySelectorAll('.admin-nav ul').length).toBeGreaterThan(0);
  });
});

describe('clicul pe grupul în care ești deja nu te mută', () => {
  it('grupul activ e inert', () => {
    // Aflat pe „Livrare" și apăsând „Comunicare" (ca să-l pliezi, sau din
    // reflex), erai aruncat pe „Trimite emailuri" și pierdeai rândul citit.
    const onTab = randeazaNav('livrare');
    fireEvent.click(screen.getByRole('button', { name: /Comunicare/ }));
    expect(onTab).not.toHaveBeenCalled();
  });

  it('un grup închis deschide prima lui frunză', () => {
    const onTab = randeazaNav('livrare');
    fireEvent.click(screen.getByRole('button', { name: /Oameni/ }));
    expect(onTab).toHaveBeenCalledWith('participanti');
  });

  it('frunzele grupului activ rămân clicabile', () => {
    const onTab = randeazaNav('livrare');
    fireEvent.click(screen.getByRole('button', { name: /Trimite emailuri/ }));
    expect(onTab).toHaveBeenCalledWith('email');
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
