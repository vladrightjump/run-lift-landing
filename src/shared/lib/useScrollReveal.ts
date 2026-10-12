import { useEffect } from 'react';

/**
 * Observă elementele cu atributul `data-reveal` și le animă cu fade-up
 * la intrarea în viewport. Rulează după mount, apoi observă elementele
 * de sub fold.
 */
export const useScrollReveal = () => {
  useEffect(() => {
    if (!('IntersectionObserver' in window)) return;
    // Fără animații de reveal pentru utilizatorii care preferă mișcare redusă.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const el = entry.target as HTMLElement;
          observer.unobserve(el);
          const delay = Number(el.dataset.revealDelay || 0);
          el.animate(
            [
              { opacity: 0, transform: 'translateY(20px)' },
              { opacity: 1, transform: 'translateY(0)' },
            ],
            { duration: 550, delay, easing: 'ease-out', fill: 'backwards' }
          );
          el.style.opacity = '';
        }
      },
      { threshold: 0.15 }
    );

    const timer = window.setTimeout(() => {
      let idx = 0;
      for (const el of document.querySelectorAll<HTMLElement>('[data-reveal]')) {
        if (el.getBoundingClientRect().top > window.innerHeight * 0.9) {
          el.style.opacity = '0';
          el.dataset.revealDelay = String((idx % 3) * 120);
          observer.observe(el);
          idx++;
        }
      }
    }, 100);

    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
    };
  }, []);
};
