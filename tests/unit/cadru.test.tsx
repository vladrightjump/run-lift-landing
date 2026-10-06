// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import { AdminCadru } from '../../src/admin/AdminCadru';
import { AdminEditionTabs } from '../../src/admin/AdminEditionTabs';
import { TOATE_ECRANELE } from '../../src/admin/adminNavigatie';
import type { EcranAdmin } from '../../src/admin/stareCurenta';
import type { AdminEdition } from '../../src/lib/adminApi';

/**
 * Cadrul adminului (U7) și selectorul de ediție.
 *
 * Ce se păzește aici: controalele nu promit mai mult decât fac. Filele sunt
 * butoane de navigație cu `aria-current`, nu `role="tab"` fără `tabpanel` și
 * fără săgeți — interfața nu spune altceva decât starea reală.
 */

const setTelefon = (telefon: boolean) => {
  window.matchMedia = vi.fn().mockImplementation((q: string) => ({
    matches: telefon && q.includes('max-width'),
    media: q,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
};

beforeEach(() => setTelefon(false));
afterEach(cleanup);

const CONTOARE = Object.fromEntries(
  TOATE_ECRANELE.map((e) => [e.cheie, e.cheie === 'participanti' ? 22 : e.cheie === 'lansare' ? 9 : null])
) as Record<EcranAdmin, number | null>;

const cadru = (ecran: EcranAdmin, extra: Partial<Parameters<typeof AdminCadru>[0]> = {}) => {
  const onEcran = vi.fn();
  const props = {
    ecran,
    onEcran,
    faza: 'landing' as const,
    countdown: null,
    atentie: 0,
    contorEcran: CONTOARE,
    onLogout: vi.fn(),
    children: <p>conținutul ecranului</p>,
    ...extra,
  };
  const utile = render(<AdminCadru {...props} />);
  return { ...utile, onEcran, props };
};

describe('cadrul pe desktop: șina', () => {
  it('arată toate zonele și filele deodată, fără semantică de tab', () => {
    cadru('acum');
    const sina = screen.getByRole('navigation', { name: 'Zone și ecrane' });
    for (const nume of ['Acum', 'Antrenamente', 'Evenimente', 'Site', 'Următorul', 'Participanți', 'Mesaje', 'Detalii și publicare', 'Clipuri']) {
      expect(within(sina).getByRole('button', { name: new RegExp(`^${nume}`) })).toBeDefined();
    }
    expect(document.querySelectorAll('[role="tab"], [role="tablist"]')).toHaveLength(0);
  });

  it('lista derulantă „Ecran" nu mai există', () => {
    cadru('acum');
    expect(screen.queryByLabelText('Ecran')).toBeNull();
  });

  it('un clic pe o filă deschide primul ei ecran', () => {
    const { onEcran } = cadru('acum');
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Zone și ecrane' })).getByRole('button', { name: /^Mesaje/ }));
    expect(onEcran).toHaveBeenCalledWith('email');
  });

  it('fila activă are aria-current, iar contorul spune ce e înăuntru', () => {
    cadru('participanti');
    const participanti = screen.getByRole('button', { name: /^Participanți/ });
    expect(participanti.getAttribute('aria-current')).toBe('page');
    expect(participanti.textContent).toContain('22');
  });

  it('numărul de pe Acum e numărul semnalelor, iar fără semnale lipsește (R6)', () => {
    cadru('clipuri', { atentie: 2 });
    expect(screen.getByRole('button', { name: /^Acum/ }).textContent).toContain('2');
    cleanup();
    cadru('clipuri', { atentie: 0 });
    expect(screen.getByRole('button', { name: /^Acum/ }).querySelector('.admin-numar')).toBeNull();
  });

  it('titlul e zona, iar sub el stă descrierea ecranului', () => {
    cadru('livrare');
    expect(screen.getByRole('heading', { level: 1, name: 'Evenimente' })).toBeDefined();
    expect(screen.getByText('Ce email a ajuns la cine și ce n-a ajuns')).toBeDefined();
  });

  it('Mesaje din Evenimente are subfile, cu cea activă marcată', () => {
    const { onEcran } = cadru('livrare');
    const subfile = screen.getByRole('navigation', { name: 'Mesaje' });
    expect(within(subfile).getByRole('button', { name: 'Livrare' }).getAttribute('aria-current')).toBe('page');
    fireEvent.click(within(subfile).getByRole('button', { name: 'Șabloane comune' }));
    expect(onEcran).toHaveBeenCalledWith('sabloane');
  });

  it('selectorul de ediție stă unde îl pune ecranul, sub titlu', () => {
    cadru('participanti', { selectorEditie: <div data-testid="selector">ediția</div> });
    expect(screen.getByTestId('selector')).toBeDefined();
  });

  it('numărătoarea spre anunț se vede doar în Evenimente', () => {
    cadru('participanti', { countdown: 'Anunț în 2z' });
    expect(screen.getByText('Anunț în 2z')).toBeDefined();
    cleanup();
    cadru('clipuri', { countdown: 'Anunț în 2z' });
    expect(screen.queryByText('Anunț în 2z')).toBeNull();
  });

  it('„Sari la ecran" mută focusul pe conținutul principal', () => {
    cadru('acum');
    fireEvent.click(screen.getByRole('button', { name: 'Sari la ecran' }));
    expect(document.activeElement?.id).toBe('ecran');
  });
});

describe('cadrul pe telefon: bara de jos', () => {
  beforeEach(() => setTelefon(true));

  it('zonele stau într-o bară de jos cu patru intrări, iar șina lipsește', () => {
    cadru('participanti');
    const bara = screen.getByRole('navigation', { name: 'Zone' });
    expect(within(bara).getAllByRole('button')).toHaveLength(4);
    expect(within(bara).getByRole('button', { name: /^Evenimente/ }).getAttribute('aria-current')).toBe('page');
    expect(screen.queryByRole('navigation', { name: 'Zone și ecrane' })).toBeNull();
  });

  it('filele zonei stau într-un rând sub titlu', () => {
    cadru('participanti');
    const file = screen.getByRole('navigation', { name: 'Ecrane din Evenimente' });
    expect(within(file).getByRole('button', { name: 'Participanți' }).getAttribute('aria-current')).toBe('page');
  });

  it('o zonă deschide ultima filă vizitată în ea, altfel prima (R38)', () => {
    const { onEcran, rerender, props } = cadru('acum');
    const bara = () => screen.getByRole('navigation', { name: 'Zone' });

    fireEvent.click(within(bara()).getByRole('button', { name: /^Evenimente/ }));
    expect(onEcran).toHaveBeenLastCalledWith('desfasurare');

    rerender(<AdminCadru {...props} ecran="participanti" />);
    rerender(<AdminCadru {...props} ecran="grup-bot" />);
    fireEvent.click(within(bara()).getByRole('button', { name: /^Evenimente/ }));
    expect(onEcran).toHaveBeenLastCalledWith('participanti');
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
