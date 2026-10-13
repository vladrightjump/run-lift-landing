import { useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';

/** Păstrează semnătura apelului; Query deține scrierea și starea ei. */
export const useAdminMutation = <Args extends unknown[], Result>(
  scrie: (...args: Args) => Promise<Result>
) => {
  const { mutateAsync } = useMutation({ networkMode: 'always', mutationFn: (args: Args) => scrie(...args) });
  return useCallback((...args: Args) => mutateAsync(args), [mutateAsync]);
};
