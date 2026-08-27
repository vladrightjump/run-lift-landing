import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { SNAPSHOT_CONFIG, parseEventConfig, type EventConfig } from '../content/eventConfig';
import { deriveEventStrings, type EventStrings } from '../content/format';
import { deriveEditionDates, type EditionDates } from '../lib/config';
import { fetchPublicConfig, isAbortError } from '../lib/supabase';
import { getStoredToken, listEventConfig } from '../lib/adminApi';
import { logClientError } from '../lib/monitoring';

/**
 * Configurația ediției, la runtime.
 *
 * Contextul PORNEȘTE de la instantaneul de build (`SNAPSHOT_CONFIG`), sincron.
 * Deci primul cadru e complet și corect pentru ediția deployată — pagina publică
 * nu are ecran de încărcare, iar un backend căzut nu e o cale de eroare, ci doar
 * o reconciliere care nu se mai întâmplă.
 *
 * Când `public_config()` răspunde cu alt document, valoarea se înlocuiește și
 * pagina se re-randează. De asta un tab deja deschis prinde o publicare nouă
 * fără reload.
 */

const REFRESH_MS = 15_000;

/**
 * Sursa configului cerută din URL: `?config=draft` randează ciorna.
 *
 * Parametru SEPARAT de `?preview=`, care alege faza paginii (`soon`, `landing`,
 * `leaderboard`, `next`). Dacă ar fi aceeași cheie, cele două ar deveni exclusive
 * și n-ai putea verifica cum arată o ciornă în dimineața cursei — exact repetiția
 * pe care runbook-ul o cere. Așa se compun: `?config=draft&preview=leaderboard`.
 */
export const configParam = (): string | null =>
  new URLSearchParams(window.location.search).get('config');

export type EventConfigContextValue = {
  config: EventConfig;
  /** `true` cât timp încă randăm instantaneul (configul publicat n-a ajuns). */
  isSnapshot: boolean;
};

const EventConfigContext = createContext<EventConfigContextValue>({
  config: SNAPSHOT_CONFIG,
  isSnapshot: true,
});

type Props = {
  children: ReactNode;
  /**
   * Config impus, pentru preview și teste. Când e dat, nu se mai interoghează
   * backendul — ce se vede e exact ce s-a primit.
   */
  override?: EventConfig | null;
};

/**
 * De unde vine configul de randat: ciorna (la cererea explicită a unui
 * organizator autentificat) sau documentul publicat.
 *
 * Token-ul e cel pe care admin-ul îl are deja în `localStorage`, pe aceeași
 * origine — nu există link de preview semnat și nici expunere publică a ciornei.
 * Fără token, `?config=draft` e inert: un vizitator care îl ghicește vede exact
 * ce vede oricine.
 */
const sursaConfig = async (signal: AbortSignal): Promise<EventConfig | null> => {
  if (configParam() !== 'draft') return fetchPublicConfig(signal);

  const token = getStoredToken();
  if (!token) return fetchPublicConfig(signal);

  const randuri = await listEventConfig(token, undefined, signal).catch(() => null);
  const ciorna = randuri?.find((r) => r.status === 'draft');
  return ciorna ? parseEventConfig(ciorna.config) : fetchPublicConfig(signal);
};

export const EventConfigProvider = ({ children, override = null }: Props) => {
  const [config, setConfig] = useState<EventConfig>(override ?? SNAPSHOT_CONFIG);
  const [isSnapshot, setIsSnapshot] = useState(override === null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (override) {
      setConfig(override);
      setIsSnapshot(false);
      return;
    }

    const refresh = () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      sursaConfig(controller.signal)
        .then((live) => {
          // `null` = document nerandabil. Rămânem pe ce aveam; o pagină ciuntită
          // e mai rea decât o ediție cu o publicare întârziere.
          if (!live) return;
          setConfig(live);
          setIsSnapshot(false);
        })
        .catch((err) => {
          // Abort la refresh/unmount e normal. Restul lasă o urmă, dar pagina
          // rămâne pe ultima valoare bună — exact ca `useStats`.
          if (!isAbortError(err)) logClientError('fetch-public-config', err);
        });
    };

    refresh();
    const id = window.setInterval(refresh, REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      abortRef.current?.abort();
    };
  }, [override]);

  const value = useMemo(() => ({ config, isSnapshot }), [config, isSnapshot]);

  return <EventConfigContext.Provider value={value}>{children}</EventConfigContext.Provider>;
};

/** Configul activ. */
export const useEventConfig = (): EventConfig => useContext(EventConfigContext).config;

/** Configul activ plus dacă e încă instantaneul de build. */
export const useEventConfigState = (): EventConfigContextValue => useContext(EventConfigContext);

/** String-urile dependente de ediție, derivate din configul activ. */
export const useEditionStrings = (): EventStrings => {
  const config = useEventConfig();
  return useMemo(() => deriveEventStrings(config), [config]);
};

/** Reperele de timp (momente absolute), derivate din configul activ. */
export const useEditionDates = (): EditionDates => {
  const config = useEventConfig();
  return useMemo(() => deriveEditionDates(config), [config]);
};
