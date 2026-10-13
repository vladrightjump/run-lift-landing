import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAdminResource } from '../../data/useAdminResource';
import { useSesiuneAdmin } from '../../data/adminSession';
import { listRegistrations, listWaitlist, listEmailLog, listAdminEvents, type AdminRegistration, type AdminWaitlistEntry } from './api';
import { emailuriNelivrate } from './deliveryLog';
import type { EcranAdmin } from '../../data/stareCurenta';

/** Același ciclu de ediție; Query deține cererile și ultimele date bune. */
export const useDashboardData = (editie: number | null, curenta: number, tab: EcranAdmin) => {
  const { token, showToast } = useSesiuneAdmin();
  const client = useQueryClient();
  const rows = useAdminResource(
    useCallback((t: string, signal: AbortSignal) => listRegistrations(t, editie ?? undefined, signal), [editie]),
    undefined, { queryKey: ['evenimente', 'dashboard', 'registrations', editie, tab], enabled: editie !== null, resetKey: editie }
  );
  const waitlist = useAdminResource(
    useCallback((t: string, signal: AbortSignal) => listWaitlist(t, editie ?? undefined, signal), [editie]),
    undefined, { queryKey: ['evenimente', 'dashboard', 'waitlist', editie, tab], enabled: editie !== null, resetKey: editie }
  );
  const emailLog = useAdminResource(
    useCallback((t: string, signal: AbortSignal) => listEmailLog(t, editie ?? undefined, tab === 'livrare', signal), [editie, tab]),
    undefined, { queryKey: ['evenimente', 'dashboard', 'email-log', editie], enabled: editie !== null, resetKey: editie }
  );
  const events = useAdminResource(
    useCallback((t: string, signal: AbortSignal) => listAdminEvents(t, 200, signal), []),
    undefined, { queryKey: ['evenimente', 'dashboard', 'events', editie, tab], enabled: editie !== null }
  );
  const currentWaitlist = useAdminResource(
    useCallback((t: string, signal: AbortSignal) => listWaitlist(t, curenta, signal), [curenta]),
    undefined, { queryKey: ['evenimente', 'dashboard', 'current-waitlist', editie, curenta, tab], enabled: editie !== null && editie !== curenta }
  );
  const currentEmail = useAdminResource(
    useCallback((t: string, signal: AbortSignal) => listEmailLog(t, curenta, false, signal), [curenta]),
    undefined, { queryKey: ['evenimente', 'dashboard', 'current-email', editie, curenta, tab], enabled: editie !== null && editie !== curenta }
  );
  const seenEvents = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!events.date) return;
    if (seenEvents.current === null) {
      seenEvents.current = new Set(events.date.map((e) => e.id));
      return;
    }
    for (const e of events.date) {
      if (e.tip === 'auto_promote' && !seenEvents.current.has(e.id)) {
        const nume = typeof e.detaliu?.nume === 'string' ? e.detaliu.nume : 'Cineva';
        showToast({ kind: 'success', msg: `${nume} a fost promovat automat din așteptare.` });
      }
      seenEvents.current.add(e.id);
    }
  }, [events.date, showToast]);
  const setRows: Dispatch<SetStateAction<AdminRegistration[] | null>> = (update) => {
    client.setQueriesData<{ date: AdminRegistration[] }>({ queryKey: ['admin-resource', token, 'evenimente', 'dashboard', 'registrations', editie] },
      (value) => value && { date: (typeof update === 'function' ? update(value.date) : update) ?? [] });
  };
  const setWaitlist: Dispatch<SetStateAction<AdminWaitlistEntry[] | null>> = (update) => {
    client.setQueriesData<{ date: AdminWaitlistEntry[] }>({ queryKey: ['admin-resource', token, 'evenimente', 'dashboard', 'waitlist', editie] },
      (value) => value && { date: (typeof update === 'function' ? update(value.date) : update) ?? [] });
  };
  const refresh = useCallback(async () => {
    const queryKey = ['admin-resource', token, 'evenimente', 'dashboard'];
    await client.cancelQueries({ queryKey });
    await client.invalidateQueries({ queryKey });
  }, [client, token]);
  const signalWaitlist = editie === curenta ? waitlist.date : currentWaitlist.date;
  const signalEmail = editie === curenta ? emailLog.date : currentEmail.date;
  const [lastSignals, setLastSignals] = useState({ asteptare: 0, nelivrate: 0 });
  const semnaleEditieCurenta = {
    asteptare: signalWaitlist == null ? lastSignals.asteptare : signalWaitlist.length,
    nelivrate: signalEmail == null ? lastSignals.nelivrate : emailuriNelivrate(signalEmail).length,
  };
  if (semnaleEditieCurenta.asteptare !== lastSignals.asteptare || semnaleEditieCurenta.nelivrate !== lastSignals.nelivrate) {
    setLastSignals(semnaleEditieCurenta);
  }
  return { rows: rows.date, waitlist: waitlist.date, emailLog: emailLog.date, events: events.date,
    loadError: rows.eroare, setRows, setWaitlist, refresh,
    semnaleEditieCurenta };
};
