import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CardSaptamana } from './CardSaptamana';

/**
 * Pagina și previzualizarea din editorul adminului randează aceeași
 * componentă, deci ce vede organizatorul înainte de „Publică" e cardul public.
 */
describe('Cardul săptămânii', () => {
  it('pe pagină, titlul e un h2 și rândurile se păstrează', () => {
    render(<CardSaptamana numar={2} titlu="Deal lung" corp={'6×400m\npauză 90s'} />);
    const card = screen.getByRole('article');
    expect(screen.getByRole('heading', { level: 2, name: 'Deal lung' })).toBeTruthy();
    expect(card.textContent).toContain('Săptămâna 2');
    expect(card.textContent).toContain('6×400m\npauză 90s');
  });

  it('în editor, același card cu titlul un nivel mai jos', () => {
    const { container: pagina } = render(<CardSaptamana numar={2} titlu="Deal lung" corp="x" />);
    const { container: editor } = render(<CardSaptamana numar={2} titlu="Deal lung" corp="x" nivelTitlu="h3" />);
    expect(screen.getByRole('heading', { level: 3, name: 'Deal lung' })).toBeTruthy();
    expect(editor.innerHTML).toBe(pagina.innerHTML.replace(/<(\/?)h2/g, '<$1h3'));
  });
});
