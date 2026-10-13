/** Datele și semnalele grupului, consumate de cadrul adminului și zona Acum. */
export { FurnizorSala, useSala } from './useSala';
export { useTrials } from './useTrials';
export {
  trialNeedsAttention,
  trimiteComanda,
  marcheazaComandaVerificata,
  type ComandaAcum,
  type SalaComanda,
  type SalaDate,
  type SalaMembru,
} from './api';
export { cereFiltruUrmatorul, type FiltruUrmatorul } from './filtruUrmatorul';
export { antrenamentulUrmator, cineVine, zileAnulate } from './model';
export { RO_DOW, frazaSondaj, numeZi, plusZile, urmatorulSondaj, ziuaSaptamanii } from './sondaj';
export { stareBot } from './stareBot';
