import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { HeroFilm } from './HeroFilm';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('pune filmarea pe pauză și afișează posterul când utilizatorul cere mișcare redusă', () => {
  const preference = Object.assign(new EventTarget(), { matches: false });
  vi.stubGlobal('matchMedia', () => preference);
  const { container } = render(<HeroFilm />);
  const video = container.querySelector('video')!;
  const pause = vi.spyOn(video, 'pause').mockImplementation(() => fireEvent.pause(video));
  vi.spyOn(video, 'paused', 'get').mockReturnValue(false);

  fireEvent.play(video);
  fireEvent.click(screen.getByRole('button', { name: 'Pune filmarea pe pauză' }));
  expect(pause).toHaveBeenCalledOnce();
  expect(screen.getByRole('button', { name: 'Pornește filmarea' })).toBeDefined();

  act(() => {
    preference.matches = true;
    preference.dispatchEvent(new Event('change'));
  });
  expect(container.querySelector('video')).toBeNull();
  expect(screen.queryByRole('button')).toBeNull();
  expect(container.querySelector('img')?.getAttribute('src')).toBe('/fpv-poster.jpg');
});
