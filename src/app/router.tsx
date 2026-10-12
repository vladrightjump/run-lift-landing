import {
  createBrowserHistory,
  createRootRoute,
  createRoute,
  createRouter,
  defaultParseSearch,
  defaultStringifySearch,
  Outlet,
  type RouterHistory,
} from '@tanstack/react-router';
import { EventConfigProvider } from '../hooks/useEventConfig';
import { editionPages, independentPages, landingPage } from './routes';

/**
 * `/despre-noi` și `/antrenament` NU primesc provider-ul, deliberat.
 *
 * `/despre-noi` arată locul antrenamentelor și linkurile de social — lucruri care
 * rămân în cod pentru că nu țin de ediție. Nu afișează nimic derivat din ediție,
 * deci n-are ce reconcilia, iar un provider pus peste tot ar fi adăugat un fetch
 * de care pagina n-are nevoie.
 *
 * Pagina cere totuși un singur lucru de la server, prin hook propriu: clipurile
 * de antrenament (`public_training_reels`), fiindcă banda se administrează din
 * `/admin`. E aceeași formă ca `/antrenament` de mai jos — RPC propriu, nu
 * documentul ediției — nu o excepție de la regula asta.
 *
 * `/antrenament` e în aceeași situație, dintr-un alt motiv: antrenamentul
 * săptămânii nu aparține niciunei ediții. Își cere singur datele, dintr-un RPC
 * propriu, și rămâne corect și între ediții — tocmai săptămânile în care are cel
 * mai mult sens.
 *
 * Componentele lor care ar chema hook-urile ar primi oricum instantaneul de build
 * din valoarea implicită a contextului.
 */
const EditionLayout = () => (
  <EventConfigProvider><Outlet /></EventConfigProvider>
);

// Restul căilor client rămân landing, ca înainte. Rewrites de server sunt
// explicite: o adresă necunoscută pe Vercel continuă să răspundă cu 404.
const LandingFallback = () => (
  <EventConfigProvider><landingPage.component /></EventConfigProvider>
);

const rootRoute = createRootRoute({ component: Outlet, notFoundComponent: LandingFallback });
const editionRoute = createRoute({ getParentRoute: () => rootRoute, id: 'edition', component: EditionLayout });
const landingRoute = createRoute({ getParentRoute: () => editionRoute, ...landingPage });
const routeTree = rootRoute.addChildren([
  editionRoute.addChildren([
    landingRoute,
    ...editionPages.map((page) => createRoute({ getParentRoute: () => editionRoute, ...page })),
  ]),
  ...independentPages.map((page) => createRoute({ getParentRoute: () => rootRoute, ...page })),
]);

const normalizedPath = (path: string) => path.replace(/\/+$/, '') || '/';

/** Instanțierea vine după redirect, monitoring și analytics în app/main.tsx. */
export const makeRouter = (history: RouterHistory = createBrowserHistory()) => createRouter({
  routeTree,
  history,
  caseSensitive: true,
  notFoundMode: 'root',
  defaultHashScrollIntoView: false,
  // Fără ecranul implicit de eroare al routerului; erorile rămân globale,
  // prin monitoring, ca în entry-ul anterior.
  disableGlobalCatchBoundary: true,
  // Vechiul entry ignora toate slash-urile finale la potrivire, fără redirect.
  // TanStack canonicalizează la montare; păstrăm adresa browserului când
  // destinația logică e aceeași, inclusiv query-ul brut și fragmentul admin.
  rewrite: {
    output: ({ url }) => {
      const current = new URL(history.location.href, url.origin);
      if (
        normalizedPath(current.pathname) === normalizedPath(url.pathname) &&
        defaultStringifySearch(defaultParseSearch(current.search)) === url.search &&
        current.hash === url.hash
      ) return current;
      return url;
    },
  },
});

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof makeRouter>;
  }
}
