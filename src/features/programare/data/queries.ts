import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { wasAuthErrorHandled } from '../../../app/providers';
import { InvalidTokenError } from '../../../shared/lib/rpc';
import { useSesiuneProgramare } from './sesiune';

/** Cheile includ sesiunea; schimbarea datei sau programului nu păstrează datele altei selecții. */
export const useResursaProgramare = <T>(cheie: readonly unknown[], incarca: (token: string, signal: AbortSignal) => Promise<T>, enabled = true) => {
  const { token, onAuthError } = useSesiuneProgramare();
  const client = useQueryClient();
  const queryKey = ['programare', token, ...cheie];
  const query = useQuery({ queryKey, queryFn: async ({ signal }) => ({ date: await incarca(token, signal) }), enabled, gcTime: 0 });
  const tratata = !!query.error && wasAuthErrorHandled(client, queryKey, query.error);
  useEffect(() => {
    if (query.error instanceof InvalidTokenError && !tratata) onAuthError(query.error);
  }, [query.error, onAuthError, tratata]);
  return {
    date: query.data?.date,
    eroare: !!query.error && !query.data && !(query.error instanceof InvalidTokenError),
    reincarca: query.refetch,
  };
};

export const useMutatieProgramare = <Args extends unknown[], Result>(scrie: (token: string, ...args: Args) => Promise<Result>) => {
  const { token } = useSesiuneProgramare();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (args: Args) => scrie(token, ...args),
    onSuccess: () => client.invalidateQueries({ queryKey: ['programare', token] }),
  });
};
