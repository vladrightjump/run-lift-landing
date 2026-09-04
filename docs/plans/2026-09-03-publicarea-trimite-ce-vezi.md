---
title: „Publică" trimite ce vezi pe ecran - Plan
type: fix
date: 2026-09-03
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

# „Publică" trimite ce vezi pe ecran - Plan

## Goal Capsule

**Objective:** The organiser edits a field in Setup → Evenimentul, presses
„Publică", confirms — and the live site is running the document that was on
screen. If it cannot be, they find out before they leave the page.

**Means:** `publicaCiorna` saves the draft before it publishes, so the row the
server publishes is the document in the fields (KTD1). Publish and save refusals
persist in the sticky action bar the organiser just clicked, instead of relying
only on a 3.2-second toast (KTD3).

**Authority:** The Requirements below own product behavior. KTD1 owns the
publish mechanism. `src/admin/AdminEventTab.tsx` is the only file that changes;
the `admin_publish_event_config` RPC contract stays as it is, and no stylesheet
change is needed (KTD5).

**Stop conditions:** Stop and ask before changing any RPC signature, before
touching `admin_set_coming_soon`, and before adding a new toast or dialog
primitive. None of those is in scope.

## Product Contract

### Summary

Make „Publică" publish what is on screen. `publicaCiorna` saves the draft first,
then publishes it, so the button does what its label says in one gesture. The
confirmation dialog is reworded to promise exactly that. Publish and save
refusals stop depending on a toast the organiser can miss: they persist in the
sticky action bar until the next attempt.

### Problem Frame

Publishing edition 6 failed silently on 2026-09-03. The organiser edited a field
and pressed „Publică" without pressing „Salvează". The confirmation dialog
appeared, they confirmed, the dialog closed, and nothing reached the site.
`admin_publish_event_config` answered `400 P0001 no_draft`.

The cause is a split between what the organiser is looking at and what the
server publishes. `admin_publish_event_config` takes only `p_editie`
(`supabase-migration-event-config.sql:253`). It looks up the `draft` row for that
edition and publishes it. The document in the React fields is never sent. Until
„Salvează" runs, no `draft` row exists, so there is nothing to publish.

The reported symptom is the milder of two. The worse one is not in the issue:
when a `draft` row *does* exist and the organiser has typed on top of it,
publish ships the stale saved row and the UI reports **success** —
„Ediția N e publicată." A false success is harder to catch than a silent
failure, because nothing prompts the organiser to go and check.

The issue's third proposal — route `no_draft` into a toast — is already built
and shipped. `mesajRefuz` maps `no_draft` to a Romanian message
(`src/admin/AdminEventTab.tsx:88`), `publicaCiorna` catches the rejection, and
`handleAuthError` does not swallow it (it returns `true` only for
`InvalidTokenError`, `src/admin/AdminDashboard.tsx:188-197`). The toast rendered.
It is a 3.2-second bottom-centre notice that appears over the very bar the
organiser just clicked, at the moment the confirmation dialog unmounts, roughly
two and a half screens below the top of the tab. It fired and was missed. That
is evidence about the surface, not about the wiring, and it is why this plan
spends its effort on the structural fix rather than on error plumbing.

### Key Decisions

- **„Publică" saves first, then publishes** — one gesture, matching the button's
  label, entirely client-side. Chosen over disabling the button while edits are
  unsaved, and over changing the RPC to accept the document. Governs R1, R2, R6.
- **The publish RPC contract does not change** — no migration in this fix. The
  server keeps publishing a reviewed `draft` row, which is what
  `event_config_validate` and the `registration_hidden_while_open` guard are
  written against. Governs R6.

### Requirements

#### Publishing what is on screen

- R1. Pressing „Publică" and confirming saves the document currently in the
  form, then publishes that document. The organiser performs one gesture.
- R2. When the form holds edits newer than the last save, publishing ships those
  edits — not the previously saved draft.
- R3. When the save step is refused, publishing does not run and the organiser is
  told the save failed. The site keeps running the previously published config.
- R4. „Salvează" stays as its own button. Saving without publishing remains a
  supported action, and `Previzualizează` still depends on it.

#### Refusals that cannot be walked past

- R5. A refused publish or a refused save leaves a message in the sticky action
  bar that persists until the next save or publish attempt, or until the open
  draft is replaced. Validation problems share that slot and take precedence over
  a refusal. The transient toast stays as-is alongside it.
- R7. The refusal names which step failed — saving or publishing — so the
  organiser knows whether their edits reached the server.
- R6. The confirmation dialog states that confirming saves the current fields and
  publishes them. It must not promise an outcome the button does not deliver.

### Acceptance Examples

- AE1. A draft for edition 6 is saved. The organiser changes the start time and
  presses „Publică" → „Da, publică". The published config carries the new start
  time. Covers R1, R2.
- AE2. No draft row exists. The organiser opens „Editează ediția 6", changes the
  venue, and publishes. The publish succeeds and the site shows the new venue.
  This is the reported failure, now passing. Covers R1.
- AE3. The server refuses the publish with `registration_hidden_while_open`. The
  draft is saved (the save step succeeded), nothing is published, and the refusal
  is still readable in the action bar after the toast has faded, naming the
  publish step. Covers R5, R7.
- AE4. The save step fails with a network error. `publishEventConfig` is never
  called, and the action bar says the save failed. Covers R3, R5, R7.
- AE5. The organiser starts a publish and types into a field before it resolves.
  The fields are not editable during the publish, so the document that is
  published is the one they confirmed. Covers R2.

### Success Criteria

- The organiser who reported this can reproduce their exact steps — edit a
  field, press „Publică", confirm — and see the change on the public site
  without pressing „Salvează".
- Within one admin session, no publish path can report success while the site
  runs a different document than the one in the fields. A second admin tab
  publishing inside the two-call window is outside this guarantee (KTD2).

### Scope Boundaries

In scope, all in `src/admin/AdminEventTab.tsx`: `publicaCiorna`, the `catch`
block of `salveazaCiorna`, the confirmation dialog copy, the sticky action bar's
status slot, and the disabled/readonly gating of the form while a publish is in
flight.

Out of scope — outside this fix's identity:

- `admin_publish_event_config` and every other RPC signature. The draft-based
  contract is deliberate; changing it is a migration and a separate decision.
- `admin_set_coming_soon`, the Coming Soon tab's shortcut. It bypasses drafts by
  design (`src/lib/adminApi.ts:169-184`) and does not have this bug.
- The toast component and its timing. The toast is not the fix here, and
  re-tuning it would change every other admin surface.

#### Deferred to Follow-Up Work

- **„Previzualizează" has the same split.** The link opens `/?config=draft`,
  which reads the *server* draft. Editing a field and pressing „Previzualizează"
  without saving previews stale content, with no signal that it is stale. Same
  root cause, different button. This plan does not fix it, and the chosen
  save-then-publish approach does not incidentally cover it — a dirty-state
  indicator would have. Worth its own issue.
- **Two drafts for different editions can coexist.** The unique index is
  `(editie) where status = 'draft'`
  (`supabase-migration-event-config.sql:49-51`), so a draft for edition 6 and one
  for edition 7 both persist, while `incarca` loads `rows.find(r => r.status ===
  'draft')` — the first in the server's ordering, which `admin_get_event_config`
  sorts `created_at desc`. Pre-existing. Publish leaves no residue only when it
  succeeds and the edition number is unchanged: on AE3's refused-publish branch
  the newly saved draft survives, and because it is the newest draft the next
  `incarca` loads it — displacing an older in-progress draft for another edition.
  The same is true today of pressing „Salvează" and then failing to publish.

## Planning Contract

### Key Technical Decisions

- KTD1. **`publicaCiorna` awaits `saveEventConfigDraft` before
  `publishEventConfig`.** (session-settled: user-directed — chosen over
  disabling „Publică" while edits are unsaved: that keeps publishing a
  two-gesture action and leaves the dialog's promise to be reworded anyway.
  Also chosen over adding `p_config` to the publish RPC: atomic, but a migration
  and an RPC contract change for a bug the client causes.) Both calls already
  exist in `src/lib/adminApi.ts`; no new API surface. Governs R1, R2.

- KTD2. **The two-call window is accepted and made recoverable, not hidden.**
  Save-then-publish is not one transaction. If the save lands and the publish is
  refused, the organiser is left with a saved draft and the old config still
  live — a state they can reach today by pressing „Salvează" and then failing to
  publish, and one they can retry from. The alternative (KTD1's rejected
  RPC change) buys atomicity at the cost of a migration. The plan spends its
  budget on making the outcome legible instead: R3 requires the save failure and
  the publish failure to read differently, so the organiser knows whether their
  edits survived.

- KTD3. **Refusals reuse the sticky action bar's existing status slot rather
  than a new banner.** `.admin-bara-problema` already renders validation
  failures there (`src/admin/AdminEventTab.tsx:955-960`,
  `src/index.css:1235`), and the bar is where the organiser's eyes are — it
  exists because the top of the tab is two and a half screens up
  (`src/admin/AdminEventTab.tsx:947-951`). A new banner would render at the top
  of the form, which is the surface that already failed to be seen. Governs R5.

- KTD4. **The `no_draft` branch in `mesajRefuz` stays.** After KTD1 it becomes
  nearly unreachable from the UI. Keep it for direct-RPC callers and for the
  window between the save and the publish. Note what it no longer covers: the
  concurrent-session case now resolves the other way. If another tab publishes
  edition N first, the draft row is consumed, so this session's save re-inserts a
  fresh draft, the publish supersedes the other tab's just-published row, and it
  reports success. Today that second session is stopped by `no_draft`. Whether
  last-write-wins is acceptable here is Open Question OQ4.

- KTD5. **The refusal carries which step failed; `mesajRefuz` is not modified.**
  `mesajRefuz` branches on the server's error code, and its fallback returns
  „Nu am putut salva. Încearcă din nou." for anything it does not recognise
  (`src/admin/AdminEventTab.tsx:93`) — so a network-refused *publish* would claim
  the save failed, which is the exact confusion R7 exists to prevent. The step is
  therefore recorded at the call site, where the `catch` block already knows which
  call rejected, and `mesajRefuz` keeps supplying only the reason. `mesajRefuz` is
  shared with `revino`, so editing it is out of scope. Governs R7.

- KTD6. **No stylesheet change.** `.admin-bara-stare` is already
  `display: flex; flex-wrap: wrap; min-width: 0` inside an `.admin-bara-actiuni`
  that also wraps, with no `nowrap` or `overflow` on the chain
  (`src/index.css:1221-1235`), so a multi-line refusal wraps under the existing
  `.admin-bara-problema` rule. This keeps the Goal Capsule's one-file claim true.

### Assumptions

- The `poatePublica` guard (`ciorna !== null && probleme.length === 0`) already
  gates both buttons, so the save added inside `publicaCiorna` cannot be reached
  with a config that `event_config_validate` would reject. Checked during review:
  `validateEventConfig` (`src/admin/eventConfigForm.ts`) is at least as strict as
  the server validator on every field the server checks. The one server rule with
  no client counterpart is `registration_hidden_while_open`, which AE3 already
  routes through the refusal surface. Do not add a second client-side validation
  pass.
- Distinguishing *which call* failed is not the same as knowing whether the write
  landed. A network failure after `admin_save_event_config_draft` has committed is
  indistinguishable from one before it, so R7's save-step message states which
  step was attempted, not that the write definitely did not happen.

### Sequencing

U1 then U2. U2's error surfacing needs U1's two-step failure shape to have
something to distinguish.

## Implementation Units

### U1. „Publică" saves the current document before publishing it

**Goal:** Pressing „Publică" and confirming publishes what is in the form.

**Requirements:** R1, R2, R4, R6. Covers AE1, AE2, AE5.

**Files:**
- `src/admin/AdminEventTab.tsx` — `publicaCiorna`, the form's in-flight gating,
  and the confirmation dialog's body copy
- `tests/unit/adminEventTab.test.tsx`

**Approach:** In `publicaCiorna`, call `saveEventConfigDraft(token,
ciorna.number, ciorna)` and await it before `publishEventConfig(token,
ciorna.number)`. Both are already imported. A rejected save must skip the
publish entirely — do not swallow it and continue. `salveazaCiorna` keeps its
own save-only behaviour and U1 does not touch it, so R4 holds; U2 later adds
refusal state to its `catch` block, which does not change what the button does.

Lock the editing surface while `publica` is true. `publicaCiorna` dismisses the
confirmation dialog on its first line, and today only the two bar buttons are
gated — every field input stays live across both awaits. Because the awaited
calls hold the `ciorna` they captured, an edit typed during the round-trip would
publish the older snapshot and still fire the success toast, which is the failure
R2 exists to close. Gate „Salvează" on `salveaza || publica || !poatePublica` as
part of the same lock.

The confirmation dialog currently reads „Site-ul public trece pe configul ăsta
imediat, fără deploy." (`src/admin/AdminEventTab.tsx:1034`). After this change
that sentence becomes true, but it does not yet tell the organiser that
confirming also saves. Add that, in the dialog's existing voice and in Romanian.
Leave the `admin-confirm-note` paragraph below it — which carries both the
share-preview caveat and the reversibility note — unchanged.

**Test Scenarios:**
- Editing a field and publishing calls `saveEventConfigDraft` with the edited
  document, and calls it before `publishEventConfig` (assert call order, not
  just that both ran).
- The document passed to `saveEventConfigDraft` carries the edit — the
  regression guard for the false-success case. Assert on the config argument,
  not on the call count.
- A rejected `saveEventConfigDraft` leaves `publishEventConfig` uncalled.
- A rejected `saveEventConfigDraft` does not show the success toast.
- „Salvează" on its own still calls `saveEventConfigDraft` and never
  `publishEventConfig` (guard against U1 collapsing the two buttons — this
  assertion already exists at `tests/unit/adminEventTab.test.tsx:171-181`;
  confirm it still passes rather than rewriting it).
- The confirmation dialog names both effects before the organiser confirms.
- An edit typed while a publish is in flight cannot reach the server, and no
  success toast fires against a stale snapshot (AE5).
- „Salvează" is disabled while a publish is in flight.
- Existing coverage still holds: an invalid config keeps „Publică" disabled, so
  the new save cannot fire from a state the server would reject.

**Verification:** `npm run test -- adminEventTab` passes, including the
pre-existing publish and validation blocks.

### U2. A refused publish stays readable after the toast fades

**Goal:** The organiser who pressed „Publică" and got nothing can find out why
without opening DevTools.

**Requirements:** R3, R5, R7. Covers AE3, AE4.

**Files:**
- `src/admin/AdminEventTab.tsx` — refusal state, the `admin-bara-stare` block
- `tests/unit/adminEventTab.test.tsx`

No stylesheet change — see KTD6.

**Approach:** Hold the last refusal in component state as a pair: which step
failed, and the message. Per KTD5, the step comes from the call site, not from
`mesajRefuz` — wrap the `saveEventConfigDraft` call inside `publicaCiorna` in its
own `catch` that records the save step, leave the outer `catch` recording the
publish step, and record the save step in `salveazaCiorna`'s `catch` too. The
message stays `mesajRefuz(err)` in every branch, so the bar and the toast never
disagree about the reason. Render a Romanian step lead-in plus the message in the
sticky bar's `admin-bara-stare` slot, styled with the existing
`.admin-bara-problema` class. Do not modify `mesajRefuz` itself.

Clear the refusal when the next save or publish attempt starts, on a success, and
whenever the open draft is replaced — „Renunță" (`setCiorna(null)`), „Editează
ediția N" (`porneteDinPublicat`), „+ Ciornă pentru ediția N+1" (`porneste`), and
„Revino la asta" (`revino`). Without the last group the refusal outlives the
draft it described: „Renunță" only nulls `ciorna`, which unmounts the bar without
touching component state, so reopening a draft would re-render a stale refusal
against a document the organiser never tried to publish.

Validation problems already occupy that slot and take precedence: while
`probleme.length > 0` the bar shows „N câmpuri de reparat", and „Publică" is
disabled, so a stale refusal must not compete with it. Show the refusal only when
there are no validation problems (R5).

Leave `showToast` calls in place. The toast is the "it just happened" signal;
the bar is the "it is still true" one.

**Test Scenarios:**
- A rejected `publishEventConfig` leaves its message in the action bar after the
  toast state is gone.
- A rejected `saveEventConfigDraft` inside the publish flow produces a message
  that reads as a save failure, distinct from a publish failure.
- A publish rejected with an error `mesajRefuz` does not recognise still reads as
  a publish failure, not a save failure. This is the regression guard for KTD5 —
  without the step marker, `mesajRefuz`'s fallback would claim the save failed.
- Starting a new publish attempt clears the previous refusal before the new
  result arrives.
- A successful publish leaves no refusal in the bar.
- A refusal does not survive discarding the draft and reopening one.
- A validation problem takes the slot over a stale refusal.
- The refusal is announced to assistive tech — the bar already carries
  `role="status"`. Several elements in the tab carry that role, so scope the
  query to `.admin-bara-actiuni` rather than using a bare `getByRole('status')`,
  and assert the message is inside the bar rather than adjacent to it.

**Verification:** `npm run test -- adminEventTab` passes. `npm run typecheck`
and `npm run typecheck:tests` pass.

## Verification Contract

- `npm run test` — the full vitest suite. `tests/unit/adminEventTab.test.tsx` is
  the file that proves this plan.
- `npm run typecheck` and `npm run typecheck:tests`.
- `npm run verify` before opening the PR — it chains typecheck, tests, build, and
  the Playwright preview run, which is what CI (`.github/workflows/ci-deploy.yml`)
  executes.
- No migration runs. If the implementation reaches for one, it has left the plan
  — see the Goal Capsule's stop conditions.

**Manual check, in a real admin session, before closing the issue.** The bug was
found by hand and the automated coverage mocks `adminApi` entirely, so the
mocks cannot prove the real RPC pair works. Reproduce the reported steps against
a live draft: edit one field, press „Publică", confirm, then load the public
page and confirm it carries the edit.

The manual check also carries the one property the unit tests cannot: `showToast`
is a bare `vi.fn()` in the harness and no toast ever renders
(`tests/unit/adminEventTab.test.tsx:53`), so tests can assert the bar's content
but not that the message outlives the toast.

## Definition of Done

- Editing a field and pressing „Publică" publishes that edit, with no „Salvează"
  in between.
- No single-session path exists where the success toast fires while the published
  config differs from the form. The concurrent-tab window KTD2 accepts is out of
  this criterion's scope.
- A refused save and a refused publish are both readable after their toast has
  faded, and they read differently — including when the server's error is one
  `mesajRefuz` does not recognise.
- The confirmation dialog describes what confirming actually does.
- Issue #12 references the commit.
- No abandoned approach is left in the diff — no dirty-state tracking, no unused
  refusal state, no commented-out RPC variants from exploring KTD1's rejected
  alternatives.

## Open Questions

Four items a document review surfaced that this plan does not settle. None blocks
U1 or U2, but OQ1 and OQ2 are regressions this change makes reachable — decide
them before the work is called done.

- OQ1 (deferred, but decide before merge). **„Previzualizează" starts previewing
  the live site.** `sursaConfig` falls back to `fetchPublicConfig` when no draft
  row exists (`src/hooks/useEventConfig.tsx:71`), with no signal. Today the
  save-before-publish habit usually leaves a draft behind, so the preview usually
  shows something real; U1's whole point is that the organiser stops pressing
  „Salvează", which makes the fallback the normal case. Two remedies were
  proposed: have „Previzualizează" save the draft first, the same one-gesture
  pattern in the same file — or keep it deferred and file it with the raised
  exposure recorded. The Deferred entry's description is wrong either way: with
  no draft row the link shows published content, not stale draft content.

- OQ2 (deferred, but decide before merge). **Publishing can silently revert a
  Coming Soon change.** `admin_set_coming_soon` patches `showComingSoon`,
  `launchAt`, and `nextEditionAt` on the published document with no draft. An
  event-tab document held in memory from before that flip still carries the old
  values, and publishing it overwrites all three under a success toast. Today the
  same press fails with `no_draft`, which is what accidentally protects the flip.
  The Coming Soon tab's own overwrite banner cannot cover this: it is gated on a
  persisted draft row existing (`src/admin/AdminComingSoonTab.tsx:118-122`), which
  U1 makes rare. The Scope Boundaries claim that this shortcut "does not have this
  bug" is true of the shortcut and false of the interaction.

- OQ3 (deferred). **U2 is sized on an inferred cause.** The Problem Frame reasons
  the toast was missed because it is transient, but the toast renders at
  `bottom: 24px; z-index: 50` — already above the sticky bar KTD3 moves the
  message to. Position was not the differentiator; duration versus comprehension
  was never weighed. If the organiser read „Nu există nicio ciornă de publicat."
  and did not connect it to the button they pressed, a longer-lived copy of the
  same sentence changes nothing. One question to the reporter settles it.

- OQ4 (deferred). **Last-write-wins across two admin tabs.** Per KTD4, after this
  change a second session no longer gets `no_draft` — its save re-creates the
  draft and its publish supersedes the first session's published row, reporting
  success. Whether that is acceptable for this deployment, or wants a guard, is
  unexamined.

## Sources & Research

- Issue #12 — the report, the root-cause analysis, and the three proposals.
- `src/admin/AdminEventTab.tsx:227-244` — `publicaCiorna`, the function this
  plan changes.
- `src/admin/AdminEventTab.tsx:83-94` — `mesajRefuz`, which already handles
  `no_draft`. The evidence that the issue's proposal 3 is built.
- `src/admin/AdminDashboard.tsx:188-197` — `handleAuthError` returns `true` only
  for `InvalidTokenError`, so the refusal was not swallowed on its way to the
  toast.
- `src/index.css:1581-1583` — the toast is `position: fixed; bottom: 24px;
  z-index: 50`, above the sticky bar's `z-index: 15`. It rendered; it was missed.
- `supabase-migration-event-config.sql:253-296` — `admin_publish_event_config`.
  It takes `p_editie` only and raises `no_draft` when the lookup finds nothing.
- `supabase-migration-event-config.sql:49-51` — the one-draft-per-edition unique
  index, and `admin_get_event_config`'s `created_at desc` draft ordering, which
  together decide what a refused publish leaves behind.
- `src/hooks/useEventConfig.tsx:71` — `sursaConfig` falls back to
  `fetchPublicConfig` when no draft row exists. The basis for OQ1.
- `src/admin/AdminComingSoonTab.tsx:118-122` — the overwrite banner is gated on a
  persisted draft row. The basis for OQ2.
- `src/admin/eventConfigForm.ts` — `validateEventConfig`, checked against the SQL
  validator to confirm the Assumptions entry above.
- `docs/plans/2026-08-27-admin-configurare-si-lansare-evenimente.md` — U5 and U6
  built the tab and its publish flow. The draft-then-publish split originates
  there and is intentional; this fix works within it.
