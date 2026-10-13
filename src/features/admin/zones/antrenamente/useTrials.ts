import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { loadTrials } from './api';
import { useAdminResource } from '../../data/useAdminResource';
import { useSesiuneAdmin } from '../../data/adminSession';
import { useAdminMutation } from '../../data/useAdminMutation';

export function useTrials() {
  const resource = useAdminResource(loadTrials, undefined, { queryKey: ['antrenamente', 'trials'] });
  const { token, onAuthError, showToast } = useSesiuneAdmin();
  const client = useQueryClient();
  const scrie = useAdminMutation((work: (token: string) => Promise<unknown>) => work(token));
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  async function act(work: (token: string) => Promise<unknown>, success: string) {
    if (lock.current) return false;
    lock.current = true; setBusy(true);
    try {
      await scrie(work);
      const queryKey = ['admin-resource', token, 'antrenamente', 'trials'];
      await client.cancelQueries({ queryKey });
      await client.invalidateQueries({ queryKey, refetchType: 'none' });
      const ownRefresh = resource.reincarca();
      // Alătură celelalte citiri celei pornite mai sus, fără s-o anuleze.
      // `reincarca` păstrează rezultatul false când poll-ul înlocuiește cererea.
      const familyRefresh = client.refetchQueries({ queryKey, type: 'active' }, { cancelRefetch: false, throwOnError: true });
      const refreshed = await Promise.all([ownRefresh, familyRefresh]).then(([own]) => own).catch(() => false);
      if (!refreshed) {
        showToast({ kind: 'error', msg: 'Acțiunea a fost salvată, dar datele nu au putut fi reîncărcate. Ciorna este păstrată; reîncarcă înainte de alte modificări.' });
        return false;
      }
      showToast({ kind: 'success', msg: success });
      return true;
    } catch (error) {
      if (!onAuthError(error)) showToast({ kind: 'error', msg: 'Nu s-a putut salva. Verifică datele, starea probei și permisiunile botului, apoi reîncearcă.' });
      return false;
    } finally { lock.current = false; setBusy(false); }
  }
  return { ...resource, busy, act };
}
