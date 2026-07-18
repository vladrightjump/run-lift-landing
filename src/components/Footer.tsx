import { INSTAGRAM_URL, INSTAGRAM_HANDLE } from '../lib/config';

export const Footer = () => (
  <footer>
    <span className="foot-brand">Run + Lift · 2026</span>
    <span className="foot-community">
      Comunitatea:{' '}
      <a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer">
        {INSTAGRAM_HANDLE}
      </a>
    </span>
    <span className="foot-organizers">
      Organizatori: <span className="name">Vladislav Filip</span>{' '}
      <a href="tel:+37369509949">+373 69 509 949</a>{' '}
      <a href="https://www.instagram.com/vladfillip" target="_blank" rel="noopener noreferrer">
        @vladfillip
      </a>{' '}
      · <span className="name">Roma Morari</span>{' '}
      <a href="tel:+37369819404">+373 69 819 404</a>{' '}
      <a href="https://www.instagram.com/morarroma" target="_blank" rel="noopener noreferrer">
        @morarroma
      </a>
    </span>
  </footer>
);
