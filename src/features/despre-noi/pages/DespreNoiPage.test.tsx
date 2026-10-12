import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DespreNoi } from './DespreNoiPage';
import { formResponse } from '../../../../tests/support/publicForms';
import { raspunde } from '../../../../tests/support/linkEmail';

beforeEach(() => { vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} })); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const fill = () => {
  for (const [label, value] of Object.entries({ Nume: 'Popescu', Prenume: 'Ana', Email: 'ana@example.com', Telefon: '069123456' })) fireEvent.change(screen.getByLabelText(label), { target: { value } });
};

describe('pagina Despre noi', () => {
  it('locul vine din setarea antrenamentelor, iar hărțile rămân accesibile', async () => {
    raspunde('public_homepage', { body: { training_location: 'Sala nouă', trial_first: false } });
    render(<DespreNoi />);
    await screen.findAllByText('Sala nouă');
    expect(screen.getByRole('link', { name: /Deschide în Google Maps/ })).toBeDefined();
    expect(screen.getByRole('link', { name: /Direcții/ })).toBeDefined();
    expect(screen.getByRole('heading', { name: /Vrei mai multe informații/ })).toBeDefined();
  });

  it('draftul invalid afișează eroarea fără comandă', async () => {
    const requests = formResponse();
    render(<DespreNoi />);
    fireEvent.click(screen.getByRole('button', { name: 'Ține-mă la curent' }));
    await screen.findByRole('alert');
    expect(screen.getByRole('alert').textContent).toMatch(/Verifică/);
    expect(requests.count).toBe(0);
  });

  it('emailul invalid afișează eroarea fără comandă', async () => {
    const requests = formResponse();
    render(<DespreNoi />);
    fill();
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'invalid' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ține-mă la curent' }));
    await screen.findByRole('alert');
    expect(requests.count).toBe(0);
    expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe('invalid');
  });

  it.each([200, 409])('succesul (%s) păstrează confirmarea emailului', async status => {
    const requests = formResponse({ status, text: status === 409 ? 'duplicate' : undefined });
    render(<DespreNoi />);
    fill();
    fireEvent.click(screen.getByRole('button', { name: 'Ține-mă la curent' }));
    await screen.findByRole('heading', { name: 'Te-am notat!' });
    expect(screen.getByText('ana@example.com')).toBeDefined();
    expect(requests.bodies[0]).toMatchObject({ mode: 'launch', data: { sursa: 'despre-noi' } });
  });

  it('un eșec păstrează datele completate și permite reîncercarea', async () => {
    formResponse({ status: 500, text: 'failed' });
    render(<DespreNoi />);
    fill();
    fireEvent.click(screen.getByRole('button', { name: 'Ține-mă la curent' }));
    await screen.findByRole('alert');
    expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe('ana@example.com');
    await waitFor(() => expect((screen.getByRole('button', { name: 'Ține-mă la curent' }) as HTMLButtonElement).disabled).toBe(false));
  });
});
