import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { QueryKey } from '@tanstack/react-query';
import { useState } from 'react';
import type { ReactNode } from 'react';

const authHandlers = new WeakMap<QueryClient, (error: unknown) => boolean>();
const handledErrors = new WeakMap<object, unknown>();

/** Un singur cache pentru aplicație; callback-ul de sesiune rămâne în admin. */
export const createAppQueryClient = () => {
  const client = new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        if (authHandlers.get(client)?.(error)) handledErrors.set(query, error);
        else handledErrors.delete(query);
      },
    }),
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false, refetchOnReconnect: false, networkMode: 'always' },
      mutations: { retry: false },
    },
  });
  return client;
};

export const registerQueryAuthHandler = (
  client: QueryClient,
  handler: (error: unknown) => boolean
) => {
  authHandlers.set(client, handler);
  return () => {
    if (authHandlers.get(client) === handler) authHandlers.delete(client);
  };
};

export const wasAuthErrorHandled = (client: QueryClient, queryKey: QueryKey, error: unknown) => {
  const query = client.getQueryCache().find({ queryKey, exact: true });
  return !!query && handledErrors.has(query) && handledErrors.get(query) === error;
};

export const AppProviders = ({ children }: { children: ReactNode }) => {
  const [client] = useState(createAppQueryClient);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};
