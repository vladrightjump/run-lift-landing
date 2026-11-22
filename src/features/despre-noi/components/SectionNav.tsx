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
    if (!header || typeof IntersectionObserver === 'undefined') return;
    const footer = document.querySelector('footer');
    let observer: IntersectionObserver;
    let top = 0;
    const readPosition = () => {
      const atFooter = footer && footer.getBoundingClientRect().top < window.innerHeight;
      const section = atFooter ? targets[0] : targets.find(target => target && target.getBoundingClientRect().top <= top + 1);
      setActive(section?.id ?? '');
    };
    const observe = () => {
      observer?.disconnect();
      const headerHeight = header.getBoundingClientRect().height;
      top = Math.round(headerHeight + (window.innerHeight - headerHeight) * 0.2);
      const below = Math.max(0, window.innerHeight - top - 1);
      // Mark the section in the upper fifth of the reading area, below the sticky header.
      observer = new IntersectionObserver(readPosition, { rootMargin: '-' + top + 'px 0px -' + below + 'px 0px' });
      for (const target of targets) if (target) observer.observe(target);
      readPosition();
    };
    const endOfPage = new IntersectionObserver(readPosition);
    if (footer) endOfPage.observe(footer);
    observe();
    window.addEventListener('resize', observe);
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(observe);
    resize?.observe(header);
    return () => {
      observer.disconnect();
      endOfPage.disconnect();
      resize?.disconnect();
      window.removeEventListener('resize', observe);
    };
  }, []);

  useLayoutEffect(() => {
    const container = nav.current;
    const marker = line.current;
    const link = container?.querySelector<HTMLAnchorElement>(`a[href="#${active}"]`);
    if (!container || !marker || !link) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    let movement: ReturnType<typeof animate> | undefined;
    let previous = '';
    function place(shouldAnimate: boolean) {
      if (!container || !marker || !link) return;
      const from = getComputedStyle(marker).transform;
      const to = 'translateX(' + link.offsetLeft + 'px) scaleX(' + link.offsetWidth + ')';
      if (!shouldAnimate && previous === to && !reduced.matches) return;
      previous = to;
      movement?.stop();
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
      movement?.stop();
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
