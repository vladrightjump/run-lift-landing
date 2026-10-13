import { rutaAdmin } from '../features/admin';
import { rutaLanding } from '../features/landing';
import { rutaDespreNoi } from '../features/despre-noi';
import { rutaAntrenament } from '../features/antrenament/index';
import { rutaConfirmare } from '../features/confirmare/index';
import { rutaInscriere } from '../features/inscriere/index';
import { rutaRenunt } from '../features/renunt/index';
import { rutaUnsubscribe } from '../features/unsubscribe/index';


export const editionPages = [
  rutaAdmin,
  rutaConfirmare,
  rutaInscriere,
  rutaUnsubscribe,
  rutaRenunt,
] as const;

export const independentPages = [
  rutaDespreNoi,
  rutaAntrenament,
] as const;

/** Același registru compune arborele și păzește paritatea cu rewrites explicite. */
export const ROUTE_PATHS = [rutaLanding, ...editionPages, ...independentPages].map((page) => page.path);
