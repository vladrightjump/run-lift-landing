import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { animate } from 'motion/mini';
import styles from './SectionNav.module.css';

const sections = [
  ['poveste', 'Povestea noastră'],
  ['comunitate', 'Comunitatea'],
  ['antrenament', 'Antrenamentul'],
  ['prima-vizita', 'Prima vizită'],
  ['program', 'Program și hartă'],
  ['informatii', 'Noutăți'],
] as const;

export function SectionNav() {
  const nav = useRef<HTMLElement>(null);
  const line = useRef<HTMLSpanElement>(null);
  const [active, setActive] = useState('');

  useEffect(() => {
    const targets = sections.map(([id]) => document.getElementById(id)).reverse();
    const header = nav.current?.closest('header');
    const page = header?.parentElement;
    const scroller = document.scrollingElement;
    if (!header || !page || !scroller) return;

    let frame: number | undefined;
    const readPosition = () => {
      frame = undefined;
      const height = scroller.clientHeight;
      if (!height) return;
      const headerHeight = header.getBoundingClientRect().height;
      // Citim secțiunea în partea de sus a spațiului rămas sub antet.
      const readingLine = headerHeight + Math.max(0, height - headerHeight) / 5;
      const scrollTop = scroller.scrollTop;
      const atEnd = scrollTop > 0 && scroller.scrollHeight - height - scrollTop <= 1;
      const section = atEnd ? targets[0] : targets.find(target => target && target.getBoundingClientRect().top <= readingLine);
      setActive(section?.id ?? '');
    };
    const schedule = () => {
      frame ??= window.requestAnimationFrame(readPosition);
    };
    schedule();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
    resize?.observe(header);
    resize?.observe(page);
    return () => {
      if (frame !== undefined) window.cancelAnimationFrame(frame);
      resize?.disconnect();
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, []);

  useLayoutEffect(() => {
    const container = nav.current;
    const marker = line.current;
    if (!container || !marker) return;
    if (!active) {
      if (!container.contains(document.activeElement)) container.scrollLeft = 0;
      return;
    }
    const link = container.querySelector<HTMLAnchorElement>(`a[href="#${active}"]`);
    if (!link) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    let movement: ReturnType<typeof animate> | undefined;
    let previous = '';
    function place(shouldAnimate: boolean) {
      if (!container || !marker || !link) return;
      const from = getComputedStyle(marker).transform;
      const to = 'translateX(' + link.offsetLeft + 'px) scaleX(' + link.offsetWidth + ')';
      if (!shouldAnimate && previous === to && !reduced.matches) return;
      previous = to;
      movement?.cancel();
      marker.style.transform = to;
      if (shouldAnimate && !reduced.matches && typeof marker.animate === 'function' && from !== 'none') {
        movement = animate(marker, { transform: [from, to] }, { duration: 0.24, ease: 'easeOut' });
      }
      const left = link.offsetLeft;
      if (left < container.scrollLeft || left + link.offsetWidth > container.scrollLeft + container.clientWidth) {
        container.scrollTo({ left: left - (container.clientWidth - link.offsetWidth) / 2, behavior: 'instant' });
      }
    }
    place(true);
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => place(false));
    resize?.observe(container);
    resize?.observe(link);
    const endMotion = () => place(false);
    reduced.addEventListener('change', endMotion);
    return () => {
      // React poate ascunde indicatorul înainte de cleanup.
      if (movement && marker.getClientRects().length) {
        marker.style.transform = getComputedStyle(marker).transform;
      }
      movement?.cancel();
      resize?.disconnect();
      reduced.removeEventListener('change', endMotion);
    };
  }, [active]);

  return (
    <nav ref={nav} className={styles.nav} aria-label="Pe această pagină">
      <div className={styles.track}>
        {sections.map(([id, label]) => (
          <a key={id} href={'#' + id} aria-current={active === id ? 'location' : undefined}>{label}</a>
        ))}
        <span ref={line} className={styles.line} hidden={!active} aria-hidden="true" />
      </div>
    </nav>
  );
}
