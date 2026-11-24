import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { SNAPSHOT_CONFIG } from '../../../shared/content/eventConfig';
import { EventConfigProvider } from '../../../shared/lib/useEventConfig';
import { Hero } from './Hero';

const renderHero = () =>
  render(
    <EventConfigProvider override={SNAPSHOT_CONFIG}>
      <Hero trialHref="/despre-noi#prima-vizita" />
    </EventConfigProvider>
  );

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('oprește filmarea în afara ecranului și păstrează pauza aleasă de vizitator', () => {
  const preference = Object.assign(new EventTarget(), { matches: false });
  vi.stubGlobal('matchMedia', () => preference);
  let changeVisibility: (visible: boolean) => void = () => {
    throw new Error('Observatorul filmării nu a fost creat');
  };
  vi.stubGlobal('IntersectionObserver', class {
    constructor(callback: (entries: { isIntersecting: boolean }[]) => void) {
      changeVisibility = (isIntersecting) => act(() => callback([{ isIntersecting }]));
    }
    observe() {}
    disconnect() {}
  });

  const { container } = renderHero();
  const video = container.querySelector('video')!;
  let paused = true;
  vi.spyOn(video, 'paused', 'get').mockImplementation(() => paused);
  const play = vi.spyOn(video, 'play').mockImplementation(async () => {
    paused = false;
    fireEvent.playing(video);
  });
  const pause = vi.spyOn(video, 'pause').mockImplementation(() => {
    paused = true;
    fireEvent.pause(video);
  });

  changeVisibility(true);
  expect(play).toHaveBeenCalledTimes(1);
  changeVisibility(false);
  expect(pause).toHaveBeenCalledTimes(1);

  changeVisibility(true);
  fireEvent.click(screen.getByRole('button', { name: 'Pauză videoclip' }));
  expect(pause).toHaveBeenCalledTimes(2);
  changeVisibility(false);
  changeVisibility(true);
  expect(play).toHaveBeenCalledTimes(2);

  fireEvent.click(screen.getByRole('button', { name: 'Redă videoclipul' }));
  expect(play).toHaveBeenCalledTimes(3);

  act(() => {
    preference.matches = true;
    preference.dispatchEvent(new Event('change'));
  });
  expect(pause).toHaveBeenCalledTimes(3);
  expect(container.querySelector('video')).toBeNull();
  expect(container.querySelector('img')?.getAttribute('src')).toBe('/landing/hero.webp');
});

it('păstrează posterul și scoate controlul dacă filmarea nu se încarcă', () => {
  const preference = Object.assign(new EventTarget(), { matches: false });
  vi.stubGlobal('matchMedia', () => preference);
  const { container } = renderHero();

  fireEvent.error(container.querySelector('video')!);

  expect(container.querySelector('video')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Redă videoclipul' })).toBeNull();
  expect(container.querySelector('img')?.getAttribute('src')).toBe('/landing/hero.webp');
});
