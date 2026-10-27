import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { atribuire, blocProgram, profilSportiv, program, ziProgram } from '../../../../tests/support/builders/programare';
import type { AntrenamentZi, Bloc, Miscare } from '../data/tipuri';
import { ModalVideo } from './ModalVideo';
import { FoaieAntrenament } from './FoaieAntrenament';

const baza = blocProgram();
const superset = blocProgram({ seturi: [baza.seturi[0], { ...baza.seturi[0], id: 'set-2', exercitiu: 2, ordine: 2,
  miscare: { ...baza.seturi[0].miscare, id: 'miscare-2', nume: 'Fandare demo' } }] });
const generic = blocProgram({ id: 'generic', tip: 'generic', ordine: 2, nume: 'Respirație demo', text: 'Respiră lent timp de două minute.', seturi: [], parametri: { prefix: 'B' } });
const antrenament: AntrenamentZi = { atribuire: atribuire(), program: program(), zi: ziProgram({ blocuri: [superset, generic, blocProgram({ id: 'ascuns', ascuns: true, parametri: { prefix: 'C' } })] }) };
const monteaza = (extra: { bloc?: Bloc; exercitiu?: number; telefon?: boolean; onInchide?: () => void; onAlege?: (blocId: string, exercitiu: number) => void } = {}) => {
  const onInchide = extra.onInchide ?? vi.fn();
  const onAlege = extra.onAlege ?? vi.fn();
  const rezultat = render(<FoaieAntrenament antrenament={antrenament} data="2026-10-21" bloc={extra.bloc ?? superset} exercitiu={extra.exercitiu ?? 1}
    profil={profilSportiv()} telefon={extra.telefon ?? false} onAlege={onAlege} onInchide={onInchide} onVideo={vi.fn()} />);
  return { ...rezultat, onInchide, onAlege };
};
afterEach(cleanup);

describe('Pagina antrenamentului', () => {
  it('pe desktop arată cele trei zone, iar selectorul include blocul generic fără seturi și omite blocurile ascunse', () => {
    const { onAlege } = monteaza();
    const pagina = screen.getByRole('region', { name: 'Antrenament: Program sintetic' });
    expect(within(pagina).getByRole('region', { name: 'Blocurile zilei' })).toBeDefined();
    expect(within(pagina).getByRole('region', { name: 'Exercițiul curent' })).toBeDefined();
    expect(within(pagina).getByRole('region', { name: 'Istoricul exercițiului' })).toBeDefined();
    expect(screen.queryByRole('tablist')).toBeNull();
    const navigare = screen.getByRole('navigation', { name: 'Blocurile antrenamentului' });
    expect(within(navigare).getAllByRole('button').map(buton => buton.textContent)).toEqual(['A1', 'A2', 'B']);
    fireEvent.click(within(navigare).getByRole('button', { name: 'A2' }));
    expect(onAlege).toHaveBeenLastCalledWith(superset.id, 2);
    fireEvent.click(within(navigare).getByRole('button', { name: 'B' }));
    expect(onAlege).toHaveBeenLastCalledWith(generic.id, 1);
  });

  it('pe telefon este dialog cu file accesibile; istoricul gol rămâne citibil și selectorul revine la Exercițiu', () => {
    monteaza({ telefon: true });
    const foaie = screen.getByRole('dialog', { name: 'Antrenament: Program sintetic' });
    const exercitiu = within(foaie).getByRole('tab', { name: 'Exercițiu' });
    expect(exercitiu.getAttribute('aria-selected')).toBe('true');
    expect(screen.queryByText('Nu există rezultate înregistrate pentru acest exercițiu.')).toBeDefined();
    fireEvent.keyDown(exercitiu, { key: 'ArrowRight' });
    const istoric = within(foaie).getByRole('tab', { name: 'Istoric' });
    expect(istoric.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(istoric);
    const panou = within(foaie).getByRole('tabpanel');
    expect(within(panou).getByText('Nu există rezultate înregistrate pentru acest exercițiu.')).toBeDefined();
    fireEvent.click(within(foaie).getByRole('button', { name: 'A2' }));
    expect(exercitiu.getAttribute('aria-selected')).toBe('true');
  });

  it('dialogul mobil blochează derularea fundalului și păstrează focusul până la închidere', () => {
    const radacina = document.createElement('div');
    radacina.className = 'admin-app';
    const fundal = document.createElement('button');
    const inertInitial = fundal.inert;
    fundal.textContent = 'Deschizător demo';
    radacina.append(fundal);
    document.body.append(radacina);
    fundal.focus();
    const { unmount, onInchide } = monteaza({ telefon: true });
    const foaie = screen.getByRole('dialog');
    expect(foaie.parentElement).toBe(radacina);
    expect(document.body.style.overflow).toBe('hidden');
    expect(fundal.inert).toBe(true);
    const inchide = within(foaie).getByRole('button', { name: 'Închide antrenamentul' });
    inchide.focus();
    fireEvent.keyDown(inchide, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(within(foaie).getAllByRole('button').at(-1));
    fireEvent.keyDown(foaie, { key: 'Escape' });
    expect(onInchide).toHaveBeenCalledTimes(1);
    unmount();
    expect(document.body.style.overflow).toBe('');
    expect(fundal.inert).toBe(inertInitial);
    expect(document.activeElement).toBe(fundal);
    radacina.remove();
  });

  it('blocul generic fără seturi păstrează textul complet în foaia mobilă', () => {
    monteaza({ bloc: generic, telefon: true });
    const foaie = screen.getByRole('dialog');
    expect(within(foaie).getByText('Respiră lent timp de două minute.')).toBeDefined();
    expect(within(foaie).getByRole('button', { name: 'B' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('modalul video se deschide deasupra foii, iar Escape închide numai video și întoarce focusul', () => {
    const Demo = () => {
      const [video, setVideo] = useState<Miscare | null>(null);
      return <><FoaieAntrenament antrenament={antrenament} data="2026-10-21" bloc={superset} exercitiu={1} profil={profilSportiv()}
        telefon onAlege={vi.fn()} onInchide={vi.fn()} onVideo={setVideo} />{video && <ModalVideo miscare={video} onInchide={() => setVideo(null)} />}</>;
    };
    render(<Demo />);
    const declansator = screen.getAllByRole('button', { name: 'Video: Genuflexiune demo' })[0];
    declansator.focus();
    fireEvent.click(declansator);
    const video = screen.getByRole('dialog', { name: 'Genuflexiune demo' });
    expect(within(video).getByTitle('Demonstrație: Genuflexiune demo').getAttribute('src')).toContain('youtube-nocookie.com/embed/abcdefghijk');
    fireEvent.keyDown(video, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Genuflexiune demo' })).toBeNull();
    expect(screen.getByRole('dialog', { name: 'Antrenament: Program sintetic' })).toBeDefined();
    expect(document.activeElement).toBe(declansator);
  });
});
