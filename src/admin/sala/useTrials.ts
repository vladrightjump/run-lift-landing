import { useRef, useState } from 'react';
import { loadTrials } from '../../lib/trialApi';
import { useAdminResource } from '../useAdminResource';
import { useSesiuneAdmin } from '../adminSession';

export function useTrials() {
  const resource = useAdminResource(loadTrials);
  const { token, onAuthError, showToast } = useSesiuneAdmin();
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  async function act(work: (token: string) => Promise<unknown>, success: string) {
    if (lock.current) return false;
    lock.current = true; setBusy(true);
    try {
      await work(token);
      await resource.reincarca();
      showToast({ kind: 'success', msg: success });
      return true;
    } catch (error) {
      if (!onAuthError(error)) showToast({ kind: 'error', msg: 'Nu s-a putut salva. Verifică datele, starea probei și permisiunile botului, apoi reîncearcă.' });
      return false;
    } finally { lock.current = false; setBusy(false); }
  }
  return { ...resource, busy, act };
}
