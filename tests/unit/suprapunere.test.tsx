// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { useState } from 'react';
import { Suprapunere, pozitiePopover } from '../../src/admin/controale/Suprapunere';
import { MeniuActiuni } from '../../src/admin/controale/MeniuActiuni';
import { Toast, useToast } from '../../src/admin/controale/Toast';

/**
 * Suprapunerea comună (U2, KTD5): popover, foaie de jos, panou, dialog.
 *
 * Ce păzește: sub 760 px nimic nu se deschide ca popover mic lângă deget, ci ca
 * foaie de jos; focusul intră la deschidere, nu iese prin Tab, Escape închide,
 * iar la închidere focusul se întoarce exact de unde a plecat (R34).
 */

const setLatime = (telefon: boolean) => {
  window.matchMedia = vi.fn().mockImplementation((q: string) => ({
    matches: telefon && q.includes('max-width'),
    media: q,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
};

beforeEach(() => setLatime(false));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const Deschizator = ({ tip, onInchis }: { tip: 'popover' | 'panou' | 'dialog'; onInchis?: () => void }) => {
  const [ancora, setAncora] = useState<HTMLElement | null>(null);
  const [deschis, setDeschis] = useState(false);
  return (
    <>
      <button type="button" ref={setAncora} onClick={() => setDeschis(true)}>
        Deschide
      </button>
      {deschis && (
        <Suprapunere
          tip={tip}
          titlu="Alege ediția"
          ancora={ancora}
          onInchide={() => {
            setDeschis(false);
            onInchis?.();
          }}
        >
          <button type="button">Ediția 8</button>
          <button type="button" aria-selected="true" role="option">
            Ediția 7
          </button>
          <button type="button">Ediția 6</button>
        </Suprapunere>
      )}
    </>
  );
};

const deschide = () => fireEvent.click(screen.getByRole('button', { name: 'Deschide' }));

describe('Suprapunere', () => {
  it('pe desktop, un popover e ancorat și nu e foaie', () => {
    render(<Deschizator tip="popover" />);
    deschide();
    const cutie = screen.getByRole('dialog', { name: 'Alege ediția' });
    expect(cutie.className).toContain('admin-popover');
    expect(cutie.className).not.toContain('admin-foaie');
  });

  it('sub 760 px, același popover se deschide ca foaie de jos', () => {
    setLatime(true);
    render(<Deschizator tip="popover" />);
    deschide();
    expect(screen.getByRole('dialog', { name: 'Alege ediția' }).className).toContain('admin-foaie');
  });

  it('sub 760 px, panoul lateral devine tot foaie de jos', () => {
    setLatime(true);
    render(<Deschizator tip="panou" />);
    deschide();
    expect(screen.getByRole('dialog', { name: 'Alege ediția' }).className).toContain('admin-foaie');
  });

  it('dialogul rămâne dialog central la orice lățime', () => {
    setLatime(true);
    render(<Deschizator tip="dialog" />);
    deschide();
    expect(screen.getByRole('dialog', { name: 'Alege ediția' }).className).toContain('admin-dialog');
  });

  it('la deschidere, focusul cade pe opțiunea aleasă', () => {
    render(<Deschizator tip="popover" />);
    deschide();
    expect(document.activeElement).toBe(screen.getByRole('option', { name: 'Ediția 7' }));
  });

  it('Tab de pe ultimul element se întoarce pe primul', () => {
    render(<Deschizator tip="popover" />);
    deschide();
    screen.getByRole('button', { name: 'Ediția 6' }).focus();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Tab' });
    expect(document.activeElement?.textContent).toBe('Ediția 8');
  });

  it('Shift+Tab de pe primul element trece pe ultimul', () => {
    render(<Deschizator tip="panou" />);
    deschide();
    screen.getByRole('button', { name: 'Închide' }).focus();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Tab', shiftKey: true });
    expect(document.activeElement?.textContent).toBe('Ediția 6');
  });

  it('Escape închide și întoarce focusul pe declanșator', () => {
    const onInchis = vi.fn();
    render(<Deschizator tip="popover" onInchis={onInchis} />);
    deschide();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onInchis).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Deschide' }));
  });

  it('clicul în afară închide', () => {
    const onInchis = vi.fn();
    render(<Deschizator tip="panou" onInchis={onInchis} />);
    deschide();
    fireEvent.click(document.querySelector('.admin-supr-fundal') as HTMLElement);
    expect(onInchis).toHaveBeenCalledTimes(1);
  });

  it('panoul și foaia au antet cu titlul și un buton de închidere', () => {
    render(<Deschizator tip="panou" />);
    deschide();
    expect(screen.getByRole('heading', { name: 'Alege ediția' })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Închide' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('MeniuActiuni', () => {
  const monteaza = () => {
    const editeaza = vi.fn();
    const sterge = vi.fn();
    render(
      <MeniuActiuni
        eticheta="Mai multe pentru Ana Postică"
        elemente={[
          { eticheta: 'Deschide detaliile', onAlege: editeaza },
          { eticheta: 'Copiază telefonul', onAlege: vi.fn() },
          { eticheta: 'Șterge înscrierea…', onAlege: sterge, distructiv: true, separatInainte: true },
        ]}
      />
    );
    return { editeaza, sterge };
  };

  it('butonul anunță un meniu și dacă e deschis', () => {
    monteaza();
    const buton = screen.getByRole('button', { name: 'Mai multe pentru Ana Postică' });
    expect(buton.getAttribute('aria-haspopup')).toBe('menu');
    expect(buton.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(buton);
    expect(buton.getAttribute('aria-expanded')).toBe('true');
  });

  it('se deschide pe primul element și săgețile se mută printre elemente', () => {
    monteaza();
    fireEvent.click(screen.getByRole('button', { name: 'Mai multe pentru Ana Postică' }));
    const elemente = screen.getAllByRole('menuitem');
    expect(document.activeElement).toBe(elemente[0]);
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'ArrowDown' });
    expect(document.activeElement).toBe(elemente[1]);
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'End' });
    expect(document.activeElement).toBe(elemente[2]);
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'ArrowDown' });
    expect(document.activeElement).toBe(elemente[0]);
  });

  it('acțiunea distructivă e separată și marcată', () => {
    monteaza();
    fireEvent.click(screen.getByRole('button', { name: 'Mai multe pentru Ana Postică' }));
    const sterge = screen.getByRole('menuitem', { name: 'Șterge înscrierea…' });
    expect(sterge.className).toContain('admin-meniu-item--distructiv');
    expect(screen.getByRole('separator')).toBeDefined();
  });

  it('alegerea închide meniul și rulează acțiunea o singură dată', () => {
    const { editeaza } = monteaza();
    fireEvent.click(screen.getByRole('button', { name: 'Mai multe pentru Ana Postică' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Deschide detaliile' }));
    expect(editeaza).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).toBeNull();
  });
});

describe('Toast', () => {
  const Gazda = ({ undo }: { undo?: () => void }) => {
    const { toast, arata, inchide } = useToast();
    return (
      <>
        <button type="button" onClick={() => arata({ kind: 'success', msg: 'Ana Postică · prezentă', undo })}>
          Marchează
        </button>
        <Toast toast={toast} onInchide={inchide} />
      </>
    );
  };

  it('cu Anulează, stă 6 secunde', () => {
    vi.useFakeTimers();
    render(<Gazda undo={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Marchează' }));
    act(() => void vi.advanceTimersByTime(5900));
    expect(screen.getByRole('status').textContent).toContain('prezentă');
    act(() => void vi.advanceTimersByTime(200));
    expect(screen.queryByText(/prezentă/)).toBeNull();
  });

  it('fără Anulează, dispare mai repede', () => {
    vi.useFakeTimers();
    render(<Gazda />);
    fireEvent.click(screen.getByRole('button', { name: 'Marchează' }));
    act(() => void vi.advanceTimersByTime(3300));
    expect(screen.queryByText(/prezentă/)).toBeNull();
  });

  it('Anulează rulează undo o singură dată și închide toastul', () => {
    const undo = vi.fn();
    render(<Gazda undo={undo} />);
    fireEvent.click(screen.getByRole('button', { name: 'Marchează' }));
    fireEvent.click(screen.getByRole('button', { name: 'Anulează' }));
    expect(undo).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/prezentă/)).toBeNull();
  });
});

describe('poziția popoverului', () => {
  const ecran = { width: 1280, height: 800 };
  const cutie = { width: 320, height: 300 };

  it('stă sub declanșator când încape', () => {
    expect(pozitiePopover({ top: 100, bottom: 140, left: 200 }, cutie, ecran)).toEqual({ top: 146, left: 200, deruleaza: 0 });
  });

  it('urcă deasupra când dedesubt nu încape', () => {
    expect(pozitiePopover({ top: 600, bottom: 640, left: 200 }, cutie, ecran)).toEqual({ top: 294, left: 200, deruleaza: 0 });
  });

  it('cere derulare când nu încape nici sus, nici jos, ca să nu acopere declanșatorul', () => {
    const p = pozitiePopover({ top: 200, bottom: 240, left: 200 }, { width: 320, height: 700 }, ecran);
    expect(p.deruleaza).toBeGreaterThan(0);
    expect(p.top).toBe(246 - p.deruleaza);
  });

  it('nu iese din ecran pe orizontală', () => {
    expect(pozitiePopover({ top: 100, bottom: 140, left: 1200 }, cutie, ecran).left).toBe(1280 - 320 - 12);
    expect(pozitiePopover({ top: 100, bottom: 140, left: 2 }, cutie, ecran).left).toBe(12);
  });
});
