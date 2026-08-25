---
title: Pagina de admin - integritate, ediții și ziua cursei - Plan
type: feat
date: 2026-08-25
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
origin: docs/ideation/2026-08-22-admin-page-ideation.html
execution: code
---

# Pagina de admin - integritate, ediții și ziua cursei - Plan

## Goal Capsule

**Objective:** The organiser can trust what the admin page tells them. A deletion
can be undone without silently overbooking the edition or losing someone's place
in the queue. A broadcast cannot be sent twice by accident. A green tick next to
a name means that person got every message this edition owes them, not just the
most recent one. Opening a new edition cannot leave the live site serving the old
one. And on race morning there is a screen built for standing in a park with no
signal, instead of the public homepage.

**Means:** Fix the three verified defects first as one integrity tranche
(KTD1–KTD5), then the edition interlock (KTD6, KTD7), then read-only history,
then the race-day surface, then the status panel. Admin-dashboard hygiene — the
shared polling hook and the delivery-badge extraction — rides with the first
tranche rather than becoming its own unit.

**Authority hierarchy:** Requirements (R-IDs) win on product behavior. KTDs win
on implementation mechanism inside those constraints. Units override neither.

**Stop conditions:**
- Stop and ask before applying U4's migration if edition 5 is live and within its
  registration window. It changes deletion semantics on `registrations`, the most
  sensitive table, and the shared Supabase project has no staging branch in use.
- Stop if a migration would touch the `public` schema. That schema belongs to
  gym-app and the Telegram bot (`MIGRATIONS.md`).
- Stop and ask before U9. The start-delay override is the project's first
  runtime-editable content and reverses a deliberate SSOT discipline.
- Stop if `npm run verify` fails for a reason not named in this plan.

**Execution profile:** Not a single sitting. Tranche A (U1–U4) is the only part
fixing something wrong today and should ship as one reviewable change. Tranches
B–E are independently shippable and independently abandonable. The admin UI has
no test coverage today, so U1 lands the component-test scaffolding that every
later unit uses; write tests as each unit lands, not at the end.

**Tail ownership:** Deploy is in scope per tranche, not per unit. Per the repo's
deploy memory, a GitHub push does not reliably trigger a Vercel build — finish
each tranche with `vercel --prod`. Migrations are applied through the Supabase
MCP `apply_migration` with a `runlift_` prefix, never through a local migrations
directory (`MIGRATIONS.md`).

## Product Contract

### Summary

Seven directions from the admin-page ideation land as five tranches. The first
fixes three verified defects — an undo that reinserts instead of restoring, a
manual broadcast with no memory, and a delivery badge that hides failures. The
rest close the edition-switch desync mechanically, open the shadow archive that
has been filling for five editions, give race morning its own offline-capable
screen, and make the project's silent failure modes visible at admin load.

### Problem Frame

The admin SPA was built one tab at a time, and each tab solved its own problem
well. What is missing is anything that holds the tabs to a common truth.

Three of these gaps are defects, verified in code and against the live database.
`admin_add_registration` sets `runlift.guard_bypass` unconditionally and never
reads `event_capacity`, and the undo button in the delete toast calls exactly
that function — so undo can push an edition over capacity, and the recreated row
gets a fresh `created_at` that moves the person in the promotion queue. The
manual broadcast path (`mode: "admin"` in the edge function) never touches
`broadcast_once`, although the scheduled reminder path a hundred lines below it
does. And the delivery badge builds its map keyed on the email address alone,
so any later successful send paints over an earlier failure.

The fourth gap is operational rather than defective. `admin_create_edition`
moves `current_event_edition` and deletes `registration_deadline` and
`event_start` immediately, while the live site keeps serving the old edition's
build until someone edits `src/content/edition.ts`, runs `sync-edition` and
redeploys. The dangerous half of the switch lands first; the safe half is
manual. Today that gap is only detected, by a banner in `AdminEditionTabs.tsx`.

The rest is absence. `registrations_backup` has been mirroring every write since
edition 1 and holds rows for editions 1 through 5 — no application code reads it.
The reminder machinery in `supabase-migration-reminder-idempotent.sql` is
finished and idempotent, but `supabase-cron-reminder-ARM.sql` was never run, and
nothing in the admin shows that. The error taxonomy in `src/lib/supabase.ts`,
written after the August CSP incident, is used by roughly two of thirteen catch
blocks in `AdminDashboard.tsx`. And on race day the organiser looks at the public
homepage, because the admin has five tabs and all five are pre-event.

### Key Decisions

- **Plan all seven surviving ideation directions, sequenced by risk rather than
  by rank.** (session-settled: user-directed — chosen over planning only the
  three verified defects: the user confirmed full scope after being offered the
  narrower tranche.) Governs R1–R31.
- **The three verified defects ship first, as one tranche.** They are the only
  work in this plan that fixes something currently wrong. Governs R1–R12.
- **The rearchitecture stays out.** The ideation's sharpest rejected candidate
  (`caietul de regie` — admin reorganised as a chronological sequence with the
  tabs demoted) is a rearchitecture bet that deserves its own brainstorm rather
  than a slot behind these fixes. Governs the Scope Boundaries below.

### Requirements

#### Integritatea listei de participanți

R1. Deleting a participant from admin marks the row deleted instead of removing
it, so the deletion can be reversed as a state change rather than a re-insert.

R2. Undo after a deletion restores the original row, keeping its original `id`
and `created_at`, so the person's position in promotion order is unchanged.

R3. Adding a participant from admin — including through undo — is refused when
the edition is already at `event_capacity`, unless the operator confirms the
overfill explicitly.

R4. Waitlist auto-promotion fires when a participant is marked deleted, and does
not fire when a row is edited for any other reason.

R5. Every admin write to `registrations` (add, edit, delete, undo, promote)
leaves a row in `admin_events`, and the admin's event feed is not capped at the
most recent 50 rows.

#### Siguranța trimiterii

R6. A manual broadcast from the Emailuri tab carries an idempotency key derived
from the edition, the audience and the message subject.

R7. A second send with the same derived key is refused by the server and reported
to the operator as already sent, not silently duplicated.

R8. Before sending, the Emailuri tab shows whether the same edition, audience and
subject has already been sent, including when and to how many recipients.

R9. The operator can override the lock and send anyway in one deliberate step,
and the overridden send is recorded as a distinct send rather than suppressed.

#### Acoperirea comunicărilor

R10. The Livrare tab shows a matrix of the current edition's participants against
the communications the edition owes, with each cell reading sent, failed or
missing.

R11. A later successful send to an address never hides an earlier failed send of
a different communication.

R12. The set of communications an edition owes is defined in one place in the
code, and adding a new communication type is a single-site edit.

#### Comutarea ediției

R13. Opening a new edition puts the backend into a pending state: registration
guards keep their existing `registration_deadline` and `event_start` values until
the switch completes.

R14. The switch completes only when the deployed build is confirmed to serve the
new edition.

R15. The admin shows a field-by-field comparison of `app_config` against the
build's `EDITION`, naming which keys differ rather than emitting the full SQL
block.

R16. The admin evaluates the recurring edition-rollover pitfalls documented in
`GHID-EDITIE-NOUA.md` and reports each as a pass or fail.

R17. `src/content/edition.ts` stays the single source of truth for edition
content and continues to apply at build time. Nothing in this plan gives the
admin write access to it. R25's start-delay override is the one sanctioned
runtime exception, and it is bounded by its own expiry.

#### Arhiva participanților

R18. The admin can search across all editions by email or phone and see which
editions a person appears in.

R19. The result shows, per edition, when the person registered, when they were
removed if they were, and whether they re-registered later.

R20. The cross-edition search is read-only and does not become a write path into
`registrations_backup`.

#### Ziua cursei

R21. The admin has a race-day surface that lists the current edition's start list
and marks attendance with a single tap.

R22. Attendance marking works with no network: writes queue locally and merge
when the connection returns.

R23. Merging a queued attendance mark twice produces the same result as merging
it once.

R24. The start list can be synced to the device before leaving for the venue, and
the surface states clearly when it was last synced.

R25. The organiser can delay the event start from admin, and the delay expires
automatically after the event rather than persisting into the next edition.

R26. A start delay changes what the public page shows without a redeploy.

#### Vizibilitatea stării

R27. On admin load, a status band reports whether the session token answers,
whether email templates are served from the database or from the edge function's
fallback constants, whether `app_config`'s edition matches the build's, and
whether the email function is reachable.

R28. The status band reports whether the scheduled reminder is armed and when it
last fired.

R29. Errors surfaced in admin toasts are classified through the existing guards
in `src/lib/supabase.ts` rather than rendered as a single generic string.

R30. The status probes do not block the first paint of the admin page.

R31. A passing check is visually quiet; only failures and unknowns draw
attention.

### Success Criteria

- After tranche A, deleting and undoing a participant at capacity leaves the
  edition at exactly its capacity, and the restored row's `created_at` matches
  the original.
- After tranche A, sending the same broadcast twice in a row without an explicit
  override results in one delivery.
- After tranche B, a rollover performed against the documented guide cannot leave
  `app_config` ahead of the deployed build without the admin saying so.
- The organiser arms the reminder cron after tranche E, because its state is
  visible. It has stayed unarmed since the machinery was written.

### Scope Boundaries

In scope: the five tranches below, the shared polling hook, the admin component
test scaffolding, and the `registrations_backup_sync` correction that U4 forces.

Out of scope, carried from the ideation's rejection reasoning:

- The admin rearchitecture as a chronological run-of-show (`caietul de regie`).
  It is a rearchitecture bet and needs its own brainstorm.
- Participant-side unsubscribe-as-login. The mechanism belongs to the public
  surface, not the admin.
- Supabase realtime replacing the 15-second poll. At 30 rows and one operator it
  solves a non-problem.
- Versioned email-template history, weekly signed-action digests, and merging the
  waitlist and main list into one queue with a cut line.
- No-show rate feeding the next edition's capacity. It depends on the attendance
  data U8 creates and cannot precede it.

#### Deferred to Follow-Up Work

- An SMS fallback when Resend fails. The phone number is validated, stored,
  exported and interpolated into message text, but no send path uses it. Real and
  cheap, but not one of these seven directions.
- A `sablon` column on `email_log` recording which template produced a send. U2
  derives the coverage columns from `mod` and `audienta` instead, which works on
  five editions of existing data (KTD4). Add the column when a communication type
  appears that `mod` cannot distinguish.
- Data hygiene on `registrations_backup`: two rows carry `editie = 30000`.

### Sources

- Origin: `docs/ideation/2026-08-22-admin-page-ideation.html` (44 candidates, 7
  survivors, 16 rejections with reasoning).
- `supabase-migration-registration-guards.sql:83-95` — `admin_add_registration`
  sets the bypass flag and never reads `event_capacity`.
- `src/admin/AdminDashboard.tsx:319-330` — the undo callback calls
  `addRegistration`; `:237-245` — `ultimulEmail` keyed on email alone;
  `:246-258` — the `nelivrate` badge re-implements `deliveryLog.ts` inline.
- `supabase/functions/send-email/index.ts:250` (`mode: "admin"`, no `once_key`)
  versus `:433-438` (`mode: "broadcast"`, `once_key` honoured).
- `src/admin/AdminEditionTabs.tsx:29` — desync is detected, not prevented.
- `scripts/sync-edition.ts` — emits all five keys unconditionally, no diff.
- `scripts/write-version.mjs` — the build already publishes `dist/version.json`
  with the deployed commit. This is the interlock primitive (KTD6).
- `GHID-EDITIE-NOUA.md:105-122` — five recurring rollover pitfalls.
- Live database (project `whyndrjcezmtajbykeil`, schema `runlift`), verified
  2026-08-25: `registrations_backup_trigger` is active on INSERT/UPDATE/DELETE
  and the table holds rows for editions 1–5. `MIGRATIONS.md` files the source SQL
  (`supabase-migration-hyrox.sql`) as targeting the abandoned project — the
  trigger was nonetheless carried into `runlift`. The ideation's basis for idea 5
  holds; the document that would have contradicted it is stale.
- Live `runlift.registrations_backup_sync` body, verified 2026-08-25: the
  `UPDATE` branch does not touch `deleted_at`. This is what makes KTD2 necessary.
- External context is carried from the ideation's own scan (RunSignup RaceDay,
  box-office will-call, Spond/Heja, transactional-email operating guidance). No
  fresh external research was run for this plan; it is load-bearing only for U8's
  offline shape, which is the last tranche.

## Planning Contract

### Key Technical Decisions

KTD1. **Logical deletion on `registrations` via a `deleted_at` column, with the
edition-uniqueness index made partial.** The existing unique index on
`(lower(email), editie)` would otherwise keep a soft-deleted row occupying the
slot, and re-registering the same person would fail with a duplicate error. The
index must become `where deleted_at is null` in the same migration. Governs
R1, R2.

KTD2. **Correct `registrations_backup_sync` in the same migration that
introduces `deleted_at`.** The live trigger sets `deleted_at` only in its
`DELETE` branch. Once admin deletion becomes an `UPDATE`, the `DELETE` branch
stops firing and the `UPDATE` branch does not propagate the flag — the shadow
table would silently stop recording removals. This is why U4 must precede U6
rather than merely being sequenced ahead of it by preference. Governs R1, R18,
R19.

KTD3. **Waitlist auto-promotion moves from `AFTER DELETE` to
`AFTER UPDATE OF deleted_at`, gated on the transition.** A `WHEN (old.deleted_at
is null AND new.deleted_at is not null)` clause keeps ordinary edits — which
already fire `UPDATE` through `admin_update_registration` — from promoting anyone.
Governs R4.

KTD4. **The coverage matrix derives its columns from `email_log.mod` and
`email_log.audienta`, not from a new template-key column.** `email_log` records
the rendered `subiect`, which the organiser can edit from the Șabloane tab, so
matching on subject text is brittle. Deriving from `mod` (`confirm` →
confirmation, `broadcast` + `participanti` → reminder, `admin` → ad-hoc) works
against the five editions of data already logged and needs no schema change. The
owed-communication set lives in one exported constant, satisfying R12. Governs
R10, R11, R12.

KTD5. **`once_key` is accepted by the edge function's `mode: "admin"` branch,
and the key is derived client-side.** The primitive (`broadcast_once`) is
already granted to the function's role and proven in production on the broadcast
path. The key shape is edition, audience, and a hash of the subject. The override
in R9 sends under a key carrying an explicit override discriminator, so the
overridden send is still idempotent against a double-click. `broadcast_once`
writes `once_<key>` rows into `app_config`; keep that prefix, since the status
panel in U10 reads `once_reminder_editie_<n>` for R28. Governs R6, R7, R9.

KTD6. **The edition interlock reads the deployed build's identity from
`dist/version.json`, not from a new frontend-reports-in RPC.** The build already
writes that file (`scripts/write-version.mjs`); stamping `EDITION.number` into it
turns the live site into the authority on which edition it serves. This avoids an
anon-writable reporting endpoint, and it answers the question even when nobody
has opened the public page. The ideation proposed frontend self-reporting; this
is cheaper and has no new write surface. Governs R14, R15.

KTD7. **`admin_create_edition` writes a pending edition and stops deleting the
time markers.** Today it moves `current_event_edition` and deletes
`registration_deadline` and `event_start` in one statement — the irreversible
half. Pending means a `pending_event_edition` key; the current edition and both
guards stay untouched until U5's confirmation step promotes it. Governs R13.

KTD8. **Attendance is an append-only, idempotent column plus a local queue, not
a sync engine.** A person is present or not; replaying the same mark changes
nothing. The offline window is bounded (start 07:00, roughly two hours), so
`localStorage` with a replay-on-reconnect merge is proportionate. Governs R21,
R22, R23.

KTD9. **The start delay is an expiring override key in `app_config`, read at
runtime by the public page.** This is the SSOT exception and the plan states it
as one: `src/content/edition.ts` stays canonical for everything else (R17), and
the override carries its own expiry so it cannot leak into the next edition. The
public page currently derives `EVENT_DATE` from build constants
(`src/lib/config.ts:28-38`), so U9 adds a runtime read that did not exist.
Governs R25, R26.

KTD10. **Status probes run after first paint and are not gated on each other.**
R30 forbids blocking the initial render, and R31 forbids a permanently amber
panel. A probe that cannot answer cheaply from the browser reports unknown rather
than guessing — the CSP and exposed-schema checks are the two that cannot be
done honestly client-side without duplicating deploy logic. Governs R27, R30,
R31.

KTD11. **The duplicated polling boilerplate is extracted in U1, before the
features that would triple it.** `AdminDashboard.tsx` and `AdminLaunchTab.tsx`
carry near-identical `useState` + `refresh()` + `setInterval(15_000)` +
`visibilitychange` + `AbortController` blocks. U7, U8 and U10 each add another
polling consumer. The ideation classified this as hygiene that rides with the
first feature to land, not a direction of its own.

### High-Level Technical Design

The edition interlock (U5) is the only unit whose shape is not obvious from its
requirements:

```
Astăzi                              Cu interblocare (KTD6, KTD7)
──────                              ────────────────────────────
„+ Ediție nouă"                     „+ Ediție nouă"
   │                                   │
   ├─ current_event_edition := n+1      ├─ pending_event_edition := n+1
   ├─ DELETE registration_deadline      ├─ current_event_edition neatins
   └─ DELETE event_start                └─ ambele gărzi rămân armate
   │                                   │
   │  site live: încă ediția n          │  admin arată: în așteptare de deploy
   │  gărzi: dezarmate                  │  gărzi: armate pe ediția n
   ▼                                   ▼
 banner de avertizare               editezi edition.ts → build →
                                    dist/version.json poartă editie: n+1
                                       │
                                       ▼
                                    admin citește /version.json
                                    pending == build → promovează
                                    current := n+1, gărzile se rescriu
```

The admin polls the public origin's `/version.json` rather than being told by a
page load, so the confirmation is available whether or not anyone has visited the
site.

### Assumptions

- `/admin` and `/version.json` are the same origin (`src/main.tsx` routes
  `/admin` client-side; `vercel.json` rewrites it to `index.html`), and the CSP
  in `vercel.json` sets `connect-src 'self'`. The interlock fetch needs no CSP
  change. Verified 2026-08-25.
- `event_capacity` in `app_config` is 40 and matches `EDITION.slots.total`.
  Verified 2026-08-25. R3's guard reads `app_config`, not the build constant, so
  the two staying aligned is `sync-edition`'s job, not this plan's.
- No staging Supabase branch is in use. U4's migration is written to be
  re-runnable and is applied to production directly, which is why it carries a
  stop condition in the Goal Capsule.

### Sequencing

Tranche A (U1 → U2 → U3 → U4) ships together. U1 first because U2 consumes the
extracted delivery logic and every later unit consumes the polling hook. U4 last
within the tranche because it is the schema change.

Tranche B (U5), C (U6), D (U7 → U8 → U9) and E (U10) are independent of each
other and each depends on tranche A. U6 depends specifically on U4 (KTD2). U8
depends on U7. U9 depends on U8 only for placement, not mechanism.

## Implementation Units

| U-ID | Title | Files (primary) | Depends on |
|---|---|---|---|
| U1 | Shared polling hook + delivery logic extraction + test scaffolding | `src/admin/useAdminPolling.ts`, `src/admin/deliveryLog.ts`, `src/admin/AdminDashboard.tsx`, `src/admin/AdminLaunchTab.tsx` | — |
| U2 | Coverage matrix replaces the last-email badge | `src/admin/deliveryLog.ts`, `src/admin/AdminDeliveryTab.tsx`, `src/admin/AdminDashboard.tsx` | U1 |
| U3 | Send lock on manual broadcasts | `supabase/functions/send-email/index.ts`, `src/lib/adminApi.ts`, `src/admin/AdminEmailTab.tsx` | U1 |
| U4 | Logical deletion, real undo, admin write journal | migration, `src/lib/adminApi.ts`, `src/admin/AdminDashboard.tsx` | U1 |
| U5 | Edition interlock, field diff, rollover preflight | migration, `scripts/write-version.mjs`, `src/admin/AdminEditionTabs.tsx` | U4 |
| U6 | Cross-edition participant history | migration, `src/lib/adminApi.ts`, `src/admin/AdminDashboard.tsx` | U4 |
| U7 | `admin_snapshot` — one RPC for the race-day surface | migration, `src/lib/adminApi.ts` | U4 |
| U8 | Race-day tab with offline attendance | migration, `src/admin/AdminRaceDayTab.tsx`, `src/admin/attendanceQueue.ts` | U7 |
| U9 | Start-delay override | migration, `src/lib/config.ts`, `src/hooks/usePagePhase.ts` | U8 |
| U10 | Status band, armed reminder, classified errors | `src/admin/AdminStatusBand.tsx`, `src/admin/statusProbes.ts`, `src/admin/AdminDashboard.tsx` | U1 |

### U1. Shared polling hook, delivery logic extraction, and admin test scaffolding

**Goal:** Remove the duplicated polling boilerplate and the inline
re-implementation of delivery logic, and stand up the first component tests for
the admin UI.

**Requirements:** Enabling work for R5, R10, R27. No user-visible behavior change.

**Files:**
- `src/admin/useAdminPolling.ts` (new)
- `src/admin/AdminDashboard.tsx`, `src/admin/AdminLaunchTab.tsx`
- `src/admin/deliveryLog.ts`
- `tests/unit/useAdminPolling.test.ts` (new), `tests/unit/adminDashboard.test.tsx` (new)

**Approach:** Extract the `refresh()` + `setInterval(REFRESH_MS)` +
`visibilitychange` + `AbortController` + unmount-cleanup block into one hook
(KTD11). `AdminDashboard.tsx:190-227` and `AdminLaunchTab.tsx:21-52` are the two
call sites. Keep the 15-second interval and the abort-on-refresh semantics
exactly as they are; this unit changes no timing.

Then delete the two inline maps in `AdminDashboard.tsx:237-258`. `nelivrate`
re-implements `cheieTrimitere` and `ultimaIncercarePerCheie` from
`deliveryLog.ts`; import them instead. Leave `ultimulEmail` in place for now —
U2 replaces it rather than moving it.

Add the admin component-test setup. `vitest.config.ts` and the existing
`tests/unit/useLaunchForm.test.ts` show the hook-testing pattern already in use;
this unit extends it to rendering a tab with a stubbed `adminApi`.

**Test scenarios:**
- The hook fetches once on mount and again after the interval elapses.
- Returning to a visible document triggers a refresh; leaving it does not.
- Unmounting aborts the in-flight request and clears the interval.
- A refresh started while one is in flight aborts the earlier one.
- `nelivrate` computed through the imported helpers matches the previous inline
  result on a fixture containing a failure followed by a success for the same
  address but a different subject.
- The participants tab renders a row per registration from a stubbed API.

**Verification:** `npm run test`, `npm run typecheck`, `npm run typecheck:tests`.
Polling behavior is unchanged, so no e2e change is expected.

### U2. Coverage matrix replaces the last-email badge

**Goal:** Answer "who is missing something" instead of "what did I last send".

**Requirements:** R10, R11, R12.

**Files:**
- `src/admin/deliveryLog.ts`
- `src/admin/AdminDeliveryTab.tsx`, `src/admin/AdminDashboard.tsx`
- `tests/unit/deliveryLog.test.ts`

**Approach:** Add an exported constant naming the communications an edition owes
and the `mod`/`audienta` pair each is recognised by (KTD4, R12). Add a pure
function mapping participants plus log entries to a per-person, per-communication
cell of sent, failed or missing — reusing `ultimaIncercarePerCheie`, which
already keys correctly on address plus subject.

Delete `ultimulEmail` from `AdminDashboard.tsx:237-245` and the badge it feeds.
That map is the R11 defect: keyed on address alone, it lets a later send of any
kind paint over an earlier failure. Render the matrix in `AdminDeliveryTab.tsx`
alongside the existing `participantiFaraEmail` panel, which stays — it answers
the all-or-nothing case the matrix does not highlight.

At 31 participants and three columns the matrix fits on screen. It is not
designed for larger scales and does not need to be.

**Test scenarios:**
- A person with a successful confirmation and a failed reminder shows sent in one
  column and failed in the other. This is the regression the old badge hid.
- A person with no log entries at all shows missing in every column.
- A failed send followed by a successful resend of the *same* communication shows
  sent.
- A communication type with no log entries for anyone renders as a column of
  missing rather than being omitted.
- Adding an entry to the owed-communication constant adds a column without any
  other edit (R12).

**Verification:** `npm run test`, `npm run typecheck`.

### U3. Send lock on manual broadcasts

**Goal:** A manual broadcast cannot be sent twice by accident.

**Requirements:** R6, R7, R8, R9.

**Files:**
- `supabase/functions/send-email/index.ts`
- `src/lib/adminApi.ts`, `src/admin/AdminEmailTab.tsx`
- `tests/unit/emailAudience.test.ts` or a new `tests/unit/sendLock.test.ts`

**Approach:** Add `once_key` handling to the `mode: "admin"` branch
(`index.ts:250-284`), mirroring the broadcast branch at `:433-438`: when a key is
supplied, call `broadcast_once` first and return the already-sent shape when it
returns false (KTD5). The key is optional, so existing callers are unaffected.

Derive the key in a pure, unit-testable function: edition, audience, and a hash
of the subject. Thread it through `sendBulkEmail` in `adminApi.ts`.

In `AdminEmailTab.tsx`, before sending, look up the current edition's log for the
same audience and subject and show when it was last sent and to how many people
(R8). The data is already loaded for the Livrare tab. The override (R9) sends
under a key carrying an override discriminator so a double-clicked override is
still idempotent.

Getting the key granularity right matters more than the mechanism: too coarse and
a legitimate resend with a corrected audience is blocked, and the operator learns
to reach past the lock every time.

**Test scenarios:**
- The same edition, audience and subject produce the same key; a changed subject
  does not; a changed audience does not.
- The edge function returns the already-sent shape on a second call with the same
  key and does not call the provider.
- A send with no `once_key` behaves exactly as today.
- An override send under the same edition, audience and subject succeeds.
- A repeated override under the same discriminator is refused.
- The pre-send panel shows nothing when the combination has never been sent.

**Verification:** `npm run test`, `npm run typecheck`. The edge function is not
covered by the local suite; verify the deployed function manually against a
single-recipient test address before using it on an audience.

### U4. Logical deletion, real undo, and the admin write journal

**Goal:** Undo restores rather than reinserts, and every admin write leaves a
trace.

**Requirements:** R1, R2, R3, R4, R5.

**Files:**
- Migration `runlift_soft_delete_registrations` (applied via Supabase MCP)
- `src/lib/adminApi.ts`, `src/admin/AdminDashboard.tsx`
- `tests/unit/adminDashboard.test.tsx`

**Approach:** One migration, in this order:

1. Add `deleted_at timestamptz` to `runlift.registrations`. Replace
   `registrations_email_editie_key` — currently
   `unique (lower(email), editie)` — with the same index filtered on
   `deleted_at is null` (KTD1). Without this, re-registering someone who was
   removed fails with a duplicate error.
2. Fix `registrations_backup_sync` so its `UPDATE` branch propagates
   `deleted_at` (KTD2). The live body sets it only in the `DELETE` branch;
   leaving it would make deletions invisible to the shadow table that U6 reads.
3. Change `admin_delete_registration` to set `deleted_at = now()` instead of
   deleting, keeping its existing `edition_archived` guard.
4. Add an un-delete RPC clearing `deleted_at`, guarded the same way. This is what
   undo calls (R2) — the row keeps its `id` and `created_at`.
5. Move the auto-promotion trigger to `AFTER UPDATE OF deleted_at` with a
   transition guard (KTD3), and drop the `AFTER DELETE` trigger.
6. Add a capacity check to `admin_add_registration` (R3) with an explicit
   overfill parameter, defaulting to refusing. It currently sets the bypass flag
   and never reads `event_capacity`.
7. Update the readers. Eleven functions in `runlift` reference `registrations`
   (enumerated against the live database 2026-08-25). Missing one is the main
   risk in this unit, so the classification is given rather than left to
   discovery:

   | Function | Change |
   |---|---|
   | `admin_list_registrations` | filter `deleted_at is null` |
   | `registrations_guard` | filter the capacity count |
   | `auto_promote_from_waitlist` | filter the capacity count |
   | `public_stats` | filter the count |
   | `admin_list_editions` | filter the per-edition counts |
   | `edition2_recipients` | filter — a removed person must not receive a broadcast |
   | `confirm_lookup` | filter — a removed person must not receive a confirmation |
   | `admin_update_registration` | refuse when the row is soft-deleted |
   | `admin_delete_registration` | rewritten in step 3 |
   | `admin_create_edition` | no change — its `max(editie)` should still see removed rows |
   | `unsubscribe` | no change — setting `dezabonat_la` on a removed row is harmless |
8. Write `admin_events` rows for add, edit, delete, undo and promote (R5), and
   remove the `limit 50` from `admin_list_events`, replacing it with a bounded
   parameter.

Then rewrite `handleDelete`'s undo callback in `AdminDashboard.tsx:319-330` to
call the un-delete RPC. The six-second toast stays, but it is no longer the only
window: the row is recoverable afterwards through the journal.

**Test scenarios:**
- Deleting then undoing at capacity leaves the count at capacity, not one over.
- The undone row keeps its original `created_at`, so promotion order is
  unchanged.
- Deleting a participant promotes the first waitlist entry.
- Editing a participant's name promotes nobody.
- Re-registering an email that was previously soft-deleted in the same edition
  succeeds.
- A soft-deleted participant does not appear in the admin list, in
  `public_stats`, in `admin_list_editions`' counts, or in a broadcast's
  recipients, and does not receive a confirmation email.
- Editing a soft-deleted participant is refused.
- `admin_add_registration` refuses at capacity and succeeds with the overfill
  parameter set.
- Each of the five admin write verbs appends exactly one `admin_events` row.

**Verification:** `npm run test`, `npm run typecheck`, `npm run test:integration`
(opt-in, exercises the live backend), then `npm run verify`. Before applying,
confirm the migration is re-runnable — the shared project has no staging branch.

### U5. Edition interlock, field diff, and rollover preflight

**Goal:** The dangerous half of an edition switch waits for the safe half.

**Requirements:** R13, R14, R15, R16, R17.

**Files:**
- Migration `runlift_pending_edition`
- `scripts/write-version.mjs`, `src/admin/AdminEditionTabs.tsx`, `src/lib/adminApi.ts`
- `tests/unit/editionPreflight.test.ts` (new)

**Approach:** Change `admin_create_edition` to write `pending_event_edition` and
stop deleting `registration_deadline` and `event_start` (KTD7). The guards stay
armed on the current edition until the switch completes. Add an RPC that promotes
the pending edition to current and rewrites the time markers, callable only when
the build confirms.

Stamp `EDITION.number` into `dist/version.json` in `scripts/write-version.mjs`,
which already writes the commit and build time (KTD6). The admin fetches
`/version.json` to learn which edition the live build serves.

The confirmation is admin-side, not server-enforced: the admin observes the
deployed edition and passes it to the promotion RPC, which compares it against
`pending_event_edition`. Do not try to make the RPC fetch the URL itself. An
operator with a valid token could pass a wrong value, which is acceptable — the
admin is already the authority on this table, and the interlock exists to stop an
accident, not an attacker.

Replace the banner in `AdminEditionTabs.tsx:29` with a field-by-field comparison
of the five `app_config` keys `sync-edition` manages against the build's
`EDITION`, naming which differ (R15). Today `scripts/sync-edition.ts` emits all
five unconditionally, so the operator reads an identical SQL block each rollover
and has to guess what changed.

Add preflight checks for the pitfalls in `GHID-EDITIE-NOUA.md:105-122` (R16).
Three are answerable cheaply: `app_config` desync, `ogImageVersion` not
incremented, and the launch-notification edition default. The exposed-schema and
CSP checks are not honestly answerable from the browser — report them as unknown
with a pointer, per KTD10.

`src/content/edition.ts` remains canonical and build-applied (R17). Nothing here
writes to it.

**Test scenarios:**
- Opening an edition leaves `registration_deadline` and `event_start` intact and
  the registration guard still refusing post-deadline public inserts.
- Promotion is refused while the build reports the old edition.
- Promotion succeeds once the build reports the new edition, and the time markers
  are rewritten at that point.
- The diff names only keys that actually differ, and reports nothing when
  `app_config` matches the build.
- Each preflight check renders pass, fail, or unknown, and never renders unknown
  as a failure.

**Verification:** `npm run test`, `npm run build` (which runs
`check-deploy-config.ts` and `write-version.mjs`), then confirm `dist/version.json`
carries the edition.

### U6. Cross-edition participant history

**Goal:** Answer "has this person been here before?" from data that has been
accumulating since edition 1.

**Requirements:** R18, R19, R20.

**Files:**
- Migration `runlift_admin_person_history`
- `src/lib/adminApi.ts`, `src/admin/AdminDashboard.tsx`
- `tests/unit/personHistory.test.ts` (new)

**Approach:** Add a read-only RPC over `registrations_backup`, token-guarded like
every other admin RPC, taking an email or phone and returning the person's rows
across editions with `created_at`, `deleted_at` and `backed_up_at`. Grant select
only; no write path (R20).

Surface it as a search in the participants tab. The shape to render is per
edition: registered, removed, re-registered (R19).

This unit depends on U4 having corrected the backup trigger (KTD2). Without that
correction, every removal from U4 onward would be missing from the very table
this unit reads.

Two rows in the table carry `editie = 30000`; filter implausible edition numbers
rather than rendering them.

**Test scenarios:**
- A person present in editions 1, 3 and 5 returns three rows in edition order.
- A person removed in edition 3 and re-registered in edition 4 shows the removal
  and the later registration distinctly.
- Search by phone returns the same person as search by email.
- Search is case-insensitive on email.
- A person with no history returns empty rather than erroring.
- Rows with out-of-range edition numbers are excluded.

**Verification:** `npm run test`, `npm run typecheck`, plus a manual query
against the live table to confirm the RPC matches what the data actually holds.

### U7. `admin_snapshot` — one RPC for the race-day surface

**Goal:** One round trip returns everything the race-day screen needs.

**Requirements:** Enabling work for R21, R24.

**Files:**
- Migration `runlift_admin_snapshot`
- `src/lib/adminApi.ts`
- `tests/unit/adminSnapshot.test.ts` (new)

**Approach:** A token-guarded RPC returning the current edition's start list,
waitlist, and a content hash, in one call. The ideation classified this as the
first implementation unit of the race-day direction rather than a direction of
its own. The hash lets the surface tell the operator whether its cached copy is
current (R24) without refetching the body.

**Test scenarios:**
- The snapshot returns the same participants as `admin_list_registrations` for
  the current edition, excluding soft-deleted rows.
- The hash changes when a participant is added and is stable when nothing changes.
- An invalid token is refused.

**Verification:** `npm run test`, `npm run typecheck`.

### U8. Race-day tab with offline attendance

**Goal:** A screen that works standing in a park with no signal.

**Requirements:** R21, R22, R23, R24.

**Files:**
- Migration `runlift_attendance`
- `src/admin/AdminRaceDayTab.tsx` (new), `src/admin/attendanceQueue.ts` (new)
- `src/admin/AdminDashboard.tsx`
- `tests/unit/attendanceQueue.test.ts` (new)

**Approach:** Add `present_at timestamptz` to `registrations` and a token-guarded
RPC that sets it idempotently — setting it twice is not an error and does not
change the stored value (KTD8, R23).

The queue module is the testable core and should hold all the logic: enqueue a
mark, persist to `localStorage`, replay on reconnect, reconcile against the
server snapshot. Keep the component thin over it. The snapshot from U7 is cached
alongside the queue so the list renders offline (R24), with its sync time shown.

Add the tab as a sixth tab in `AdminDashboard.tsx`. The ideation raised a cheaper
alternative — enriching the public start list when an admin token is present —
and it remains a legitimate fallback if this unit proves larger than it looks;
the scope call was made in favour of the dedicated surface.

**Test scenarios:**
- Marking attendance offline persists across a reload.
- Reconnecting replays the queue and clears it.
- Replaying the same mark twice leaves one attendance record with the original
  timestamp.
- A mark made offline for someone deleted server-side in the meantime is
  reconciled without crashing and is reported to the operator.
- The list renders from cache with no network, showing its sync time.
- An empty queue replays as a no-op.

**Verification:** `npm run test`, `npm run typecheck`, then a manual pass with
the browser's network throttling set to offline. This is the one unit where a
passing unit suite is not sufficient evidence.

### U9. Start-delay override

**Goal:** The organiser can push the start time when the weather decides
otherwise, without a redeploy.

**Requirements:** R25, R26.

**Files:**
- Migration `runlift_start_override`
- `src/lib/config.ts`, `src/hooks/usePagePhase.ts`, `src/admin/AdminRaceDayTab.tsx`
- `tests/unit/startOverride.test.ts` (new)

**Approach:** Confirm with the user before starting (Goal Capsule stop
condition). This is the project's first runtime-editable content and the
discipline in `src/content/edition.ts` was built on not having one.

An `app_config` override key carrying both the delayed start and an expiry
(KTD9). The public page reads it at runtime and prefers it over the build
constant while it is unexpired. `src/lib/config.ts:28-38` derives `EVENT_DATE`,
`EVENT_END_DATE` and `LEADERBOARD_DATE` from `EDITION.start`, all build-time
constants, so this unit introduces a runtime read where none existed — expect it
to touch `usePagePhase` and the phase tests from the existing
`2026-08-21-faze-zi-eveniment.md` plan.

The expiry is what keeps this bounded: an override cannot survive into the next
edition.

**Test scenarios:**
- With no override, phase boundaries match today's behavior exactly.
- An unexpired override moves the leaderboard and countdown boundaries with it.
- An expired override is ignored and the build constant applies.
- A malformed override value is ignored rather than breaking the page.
- The override does not affect `/inscriere`, which follows the registration
  deadline (per `2026-08-21-faze-zi-eveniment.md`, R11).

**Verification:** `npm run test`, `npm run test:e2e` (the existing
`tests/faze.spec.ts` covers the phase boundaries this unit modifies), then
`npm run verify`.

### U10. Status band, armed reminder, and classified errors

**Goal:** The project's silent failure modes become visible before they bite.

**Requirements:** R27, R28, R29, R30, R31.

**Files:**
- `src/admin/AdminStatusBand.tsx` (new), `src/admin/statusProbes.ts` (new)
- `src/admin/AdminDashboard.tsx`
- `tests/unit/statusProbes.test.ts` (new)

**Approach:** Probes as pure functions over injected fetchers, run after first
paint and independently (KTD10, R30). Report unknown rather than guessing where a
browser check would duplicate deploy logic.

Four are cheap: the session token answers, `app_config`'s edition matches the
build's, the email function is reachable, and templates come from the database
rather than the edge function's `*_FALLBACK` constants. The last needs the edge
function to say which source it used — today `send-email/index.ts` cannot
distinguish "database unavailable" from "template missing", so a fallback send is
indistinguishable from a real one. Add that signal to its response.

For R28, read `once_reminder_editie_<n>` from `app_config` (KTD5) — that key
proves whether the reminder ever fired. It does not exist for any edition today,
which is the direct evidence the cron was never armed. Show armed state and last
fire, and run `supabase-cron-reminder-ARM.sql` as part of this unit.

For R29, route the thirteen catch blocks in `AdminDashboard.tsx` through
`isTimeoutError` and `isNetworkOrCspError` from `src/lib/supabase.ts`. Roughly
two use any classification today; the rest fall back to "Nu am putut salva.
Încearcă din nou." The taxonomy was written after the August CSP incident
(`ERROR-HANDLING.md`) and the admin is the surface most likely to hide the next
one.

R31 is a design constraint, not a nicety: a band that always shows an amber
warning is worse than no band, because it trains the operator to ignore it.

**Test scenarios:**
- Each probe reports pass, fail, or unknown, and never throws.
- A probe that times out reports unknown, not fail.
- Probes do not run before first paint.
- With every probe passing, the band is visually quiet.
- A timeout error surfaces the timeout message; a CSP or network failure surfaces
  its own; an unclassified error still surfaces the generic message.
- The reminder row reads never fired when the `once_` key is absent, and shows
  the timestamp when present.

**Verification:** `npm run test`, `npm run typecheck`, then confirm the reminder
cron is armed by checking `cron.job` in the live database.

## Verification Contract

Per unit, the commands named in that unit. Before shipping each tranche:

- `npm run verify` — typecheck, test typecheck, unit tests, build (which runs the
  CSP guard in `scripts/check-deploy-config.ts`), and Playwright e2e.
- `npm run test:integration` — opt-in, and required for U4, U5, U6 and U7 because
  they change RPC contracts. It also catches `app_config` versus `EDITION` drift.
- After any migration, run `get_advisors` (security) against the live project, as
  `MIGRATIONS.md` requires, and add a row to that document's migration table.
- Deploy each tranche with `vercel --prod`. A GitHub push does not reliably
  trigger a Vercel build.

U8 additionally requires a manual offline pass; a passing unit suite is not
sufficient evidence that the queue survives a real connection drop.

## Definition of Done

Global:
- Every requirement R1–R31 is either implemented or explicitly recorded as
  deferred with its reason.
- No migration touched the `public` schema.
- `MIGRATIONS.md` lists each applied migration.
- No abandoned or experimental code remains in the diff. Tranche D in particular
  invites dead ends around offline storage — remove what did not pan out rather
  than leaving it behind a flag.
- The delete-then-undo path has been exercised by hand against a real edition at
  capacity, not only in tests.

Per unit: the unit's test scenarios pass, its named verification commands pass,
and behavior-bearing units have a test that fails before the change and passes
after.

## Open Questions

- **U9, deferred and gated:** does the organiser want the start-delay override at
  all? It is the only requirement in this plan that reverses an existing
  discipline. It does not block the plan — U1–U8 and U10 ship without it — and
  the Goal Capsule's stop condition prevents U9 from starting unanswered.
- **U3, deferred:** how coarse should the send-lock key be? The plan fixes it at
  edition, audience and subject. If a legitimate resend after an audience
  correction proves common, the key needs a component the operator can vary
  without reaching for the override.
- **U8, deferred:** if the race-day surface proves larger than U8 estimates, the
  ideation's cheaper alternative — enriching the existing public start list when
  an admin token is present — is a real fallback and does not require the sixth
  tab.
