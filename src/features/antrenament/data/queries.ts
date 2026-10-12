import { useQuery } from '@tanstack/react-query';
import { fetchWeeklyWorkouts } from './api';

/**
 * Programul public, o singură cerere pentru pagină și pentru cardul „Până
 * atunci". Query anulează cererea când pleacă ultimul consumator, deci o
 * demontare nu ajunge niciodată în starea de eroare.
 */
export const useProgramAntrenament = () =>
  useQuery({
    queryKey: ['antrenament', 'program'],
    queryFn: ({ signal }) => fetchWeeklyWorkouts(signal),
  });
