/** Synthetic WodUp API data. No paid program content. */
export const miscareWodup = (id = '101', extra: Record<string, unknown> = {}) => ({
  id, name: 'Synthetic Carry', category: 'strength', hasReps: true, hasLoad: true,
  videosArray: [{ service: 'youtube', videoId: 'abcdefghijk' }],
  currentUserMovementOverlays: [], ...extra,
});

export const componentaWodup = (extra: Record<string, unknown> = {}) => ({
  id: 'component-1', prefix: 'A', rowOrder: 0, isAlternating: false,
  name: null, notes: 'Synthetic coaching note', notesForCoaches: 'Synthetic private note',
  preInstructions: 'Before', postInstructions: 'After', hidden: false,
  workout: {
    type: 'Strength', details: { type: 'Strength', movements: [
      { id: 101, reps: '8', load: '50', loadFemale: '35', loadUnit: 'lbs' },
      { id: 101, reps: '8', load: '50', loadFemale: '35', loadUnit: 'lbs' },
    ], rest: { type: 'fixed', duration: 30 } },
    movementData: [miscareWodup()],
  }, ...extra,
});

export const raspunsWodup = (componente = [componentaWodup()], data = '2026-09-16') => ({
  data: { currentUser: { activityTimeline: [
    { date: data, subscribedWods: [{ id: 'day-1', name: 'Synthetic session', occursOn: data,
      classType: { id: 'program-demo', name: 'Synthetic program', levels: [] },
      wodComponents: componente }] },
    { date: '2026-09-17', subscribedWods: [] },
  ] } },
});
