import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { FormatSection } from '../../src/components/landing/FormatSection';
import { ETAPE } from '../../src/content/etape';

/**
 * Exploratorul formatului: RUN / LIFT / REPEAT ca tab-uri (modelul WAI-ARIA
 * Tabs). Se păzește contractul de interacțiune, identic pe atingere, mouse și
 * tastatură: o singură etapă selectată, panoul ei vizibil, săgețile și
 * Home/End mută selecția, iar doar tab-ul selectat e în ordinea Tab.
 */

afterEach(cleanup);

const tab = (nume: string) => screen.getByRole('tab', { name: new RegExp(nume) });
const panou = () => screen.getByRole('tabpanel');

describe('FormatSection — exploratorul etapelor', () => {
  it('pornește cu RUN selectat și arată detaliile RUN', () => {
    render(<FormatSection num="01" />);
    expect(tab('RUN').getAttribute('aria-selected')).toBe('true');
    expect(tab('LIFT').getAttribute('aria-selected')).toBe('false');
    expect(panou().textContent).toContain(ETAPE[0].intro);
  });

  it('click pe LIFT: LIFT devine selectat, RUN nu mai e, panoul arată LIFT', () => {
    render(<FormatSection num="01" />);
    fireEvent.click(tab('LIFT'));
    expect(tab('LIFT').getAttribute('aria-selected')).toBe('true');
    expect(tab('RUN').getAttribute('aria-selected')).toBe('false');
    expect(panou().textContent).toContain(ETAPE[1].intro);
    expect(panou().textContent).not.toContain(ETAPE[0].intro);
  });

  it('săgeata dreapta mută selecția și focusul; de pe REPEAT revine la RUN', () => {
    render(<FormatSection num="01" />);
    fireEvent.keyDown(tab('RUN'), { key: 'ArrowRight' });
    expect(tab('LIFT').getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(tab('LIFT'));
    fireEvent.keyDown(tab('LIFT'), { key: 'ArrowRight' });
    fireEvent.keyDown(tab('REPEAT'), { key: 'ArrowRight' });
    expect(tab('RUN').getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(tab('RUN'));
  });

  it('săgeata stânga de pe RUN sare la REPEAT', () => {
    render(<FormatSection num="01" />);
    fireEvent.keyDown(tab('RUN'), { key: 'ArrowLeft' });
    expect(tab('REPEAT').getAttribute('aria-selected')).toBe('true');
  });

  it('Home sare la RUN, End sare la REPEAT', () => {
    render(<FormatSection num="01" />);
    fireEvent.keyDown(tab('RUN'), { key: 'End' });
    expect(tab('REPEAT').getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(tab('REPEAT'), { key: 'Home' });
    expect(tab('RUN').getAttribute('aria-selected')).toBe('true');
  });

  it('doar tab-ul selectat e în ordinea Tab', () => {
    render(<FormatSection num="01" />);
    expect(tab('RUN').getAttribute('tabindex')).toBe('0');
    expect(tab('LIFT').getAttribute('tabindex')).toBe('-1');
    expect(tab('REPEAT').getAttribute('tabindex')).toBe('-1');
    fireEvent.click(tab('REPEAT'));
    expect(tab('REPEAT').getAttribute('tabindex')).toBe('0');
    expect(tab('RUN').getAttribute('tabindex')).toBe('-1');
  });

  it('panoul e etichetat de tab-ul selectat, iar tab-ul îl controlează', () => {
    render(<FormatSection num="01" />);
    fireEvent.click(tab('LIFT'));
    expect(panou().getAttribute('aria-labelledby')).toBe(tab('LIFT').id);
    expect(tab('LIFT').getAttribute('aria-controls')).toBe(panou().id);
  });

  it('o tastă fără rol în model nu schimbă selecția', () => {
    render(<FormatSection num="01" />);
    fireEvent.keyDown(tab('RUN'), { key: 'a' });
    expect(tab('RUN').getAttribute('aria-selected')).toBe('true');
  });

  it('textele etapelor nu au linii de pauză', () => {
    for (const e of ETAPE) {
      for (const t of [e.intro, ...e.detalii]) expect(t).not.toMatch(/[—–]/);
    }
  });
});
