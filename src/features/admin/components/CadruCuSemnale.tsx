import { useNow } from '../../../shared/lib/useNow';
import { deRezolvat } from '../zones/acum/acum';
import { AdminCadru } from './AdminCadru';
import { type PropsCadru } from './AdminCadru';
import { useSala } from '../zones/antrenamente';
import type { SemnaleAdmin } from '../data/stareCurenta';

/**
 * Cadrul, cu numărul de pe zona Acum calculat din aceeași listă ca „De
 * rezolvat" (R6, R9): un număr care spune 1 când lista are 2 l-ar învăța pe
 * organizator să nu-l creadă. Datele grupului vin din furnizorul comun.
 */
export const CadruCuSemnale = ({
  semnale,
  ...props
}: Omit<PropsCadru, 'atentie'> & { semnale: SemnaleAdmin }) => {
  const { date } = useSala();
  const acum = new Date(useNow(60_000));
  return <AdminCadru {...props} atentie={deRezolvat(semnale, props.faza, date, acum).length} />;
};
