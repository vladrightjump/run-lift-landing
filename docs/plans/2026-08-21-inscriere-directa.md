---
title: Înscriere directă `/inscriere` - Plan
type: feat
date: 2026-08-21
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

# Înscriere directă `/inscriere` - Plan

## Goal Capsule

**Objective:** Someone who taps the link from today's video lands on a working
registration form on their phone, completes it without fighting the interface,
and gets a confirmation email — without scrolling past the hero, the format
section and the venue map first.

**Means:** Adopt the delivered `inscriere-directa` kit as-is, and extend its two
mobile fixes to the landing's existing form (KTD1, KTD4).

**Authority hierarchy:** Requirements (R-IDs) win on product behavior. KTDs win
on implementation mechanism inside those constraints. Units override neither.

**Stop conditions:**
- Stop and ask if the kit's components need changes beyond wiring and the two
  parity edits in U3 — that means the kit and the repo have drifted.
- Stop if `npm run verify` fails for a reason not named in this plan.

**Execution profile:** Ship today. Add tests as each unit lands, run the full
local suite, then deploy. The registration deadline is `2026-08-22T07:00:00`, so
the page has roughly 17 hours of useful life for Ediția 5 — treat U1–U3 as the
critical path and U4–U6 as same-session follow-through, not as next week's work.

**Tail ownership:** Deploy is in scope for this plan. Per the repo's deploy
memory, a GitHub push does not reliably trigger a Vercel build — finish with
`vercel --prod`.

## Product Contract

### Summary

Add `/inscriere` as a standalone, mobile-first registration page that reuses the
existing registration hook, validation and confirmation email unchanged. Replace
the three birth-date dropdowns with one typed `zz.ll.aaaa` field across both the
new page and the landing's existing form. Add the landing overlay, the
post-signup banner and the 3-second redirect that ship with the kit.

### Problem Frame

The only way to register today is the form near the bottom of the landing page.
A visitor arriving from Instagram must scroll past four sections to reach it. On
a phone the birth date costs three separate picker openings for one piece of
information, and every text input is sized at 15px, which makes iOS Safari zoom
in on focus and knock the layout sideways mid-form. A video goes out today that
needs a link people can tap and act on immediately.

### Requirements

**Direct entry**

- R1. `/inscriere` renders a standalone page containing the registration form,
  reachable by direct URL and by refresh without a 404.
- R2. The page opens with the first field focused, without scrolling the page.
- R3. The page carries only the context needed to act: brand, countdown, event
  date and location, remaining slots, and a collapsed "pe scurt" summary.

**Mobile comfort**

- R4. The birth date is entered in one text field as `zz.ll.aaaa`, with a
  numeric keyboard and separators inserted automatically.
- R5. Text inputs render at a font size that does not trigger iOS Safari's
  zoom-on-focus, on both `/inscriere` and the landing form.
- R6. R4 and R5 apply to the landing's existing form as well, so both entry
  points behave the same.

**Registration behavior is unchanged**

- R7. Submissions from `/inscriere` produce the same result as the landing form:
  same validation, same waitlist fallback when slots are gone, same confirmation
  email, same edition and schema on the insert.
- R8. The birth date reaching the backend stays ISO `yyyy-mm-dd`; no change to
  `validate()`, `dataNasteriiError()`, or the request body shape.

**Landing integration**

- R9. The landing's "Înscrie-te" and "Rezervă-ți locul" buttons open the
  registration form as an overlay, and fall back to navigating to `/inscriere`
  when JavaScript has not started.
- R10. After a successful registration on `/inscriere`, the visitor sees a
  confirmation, then moves to the landing's participants section; a one-time
  banner there names their place.
- R11. Any automatic move away from a confirmation screen is cancelled by user
  interaction, on both the `/inscriere` page and the landing overlay. The
  confirmation's own buttons must never be pulled out from under a tap.

### Key Decisions

- **Take the whole kit, not a subset** — includes the overlay, the banner and
  the redirect, not only the direct link.
  (session-settled: user-directed — chosen over a link-and-date-field-only slice:
  the kit's parts are written and styled to work together.) Governs R9, R10.
- **The date field and input sizing reach the landing form too** — the landing
  keeps its own layout but gets the same two fixes.
  (session-settled: user-directed — chosen over leaving the landing untouched, and
  over unifying both forms into one component: consistency without a large
  same-day visual change.) Governs R6.
- **Ship today, deadline unchanged** — `registrationDeadline` stays
  `2026-08-22T07:00:00`.
  (session-settled: user-directed — chosen over extending the deadline so the
  video link survives past tomorrow morning.) Governs R1.

### Success Criteria

- The flow completes on a real phone, not only in a desktop viewport: open
  `/inscriere`, type a birth date, submit, land on the participants list.
- No field causes the viewport to zoom on focus in iOS Safari.
- `npm run verify` passes before deploy.
- Production `/inscriere` returns the page on a hard refresh, not a 404.

### Scope Boundaries

In scope: the seven kit files, the route, the Vercel rewrite, the landing
integration, and the test updates those force.

Out of scope: any backend or schema change, any migration, any email template
change, and everything else in `BACKLOG.md` (GDPR policy, `/regulament`,
Turnstile, results page).

#### Deferred to follow-up work

- Unifying `RegistrationSection.tsx` and `RegistrationForm.tsx` into a single
  form component. The two now share `BirthDateField` and the registration hook,
  but still duplicate roughly 400 lines of layout and phase rendering.
- Regenerating `og.png` so the link preview reflects `/inscriere`.

## Planning Contract

### Key Technical Decisions

- KTD1. Copy the seven kit files into the matching repo paths and wire them,
  rather than reimplementing. The kit already imports the repo's real modules —
  `useRegistration`, `useStats`, `useCountdown`, `validation.ts`, `mySignups.ts`,
  `content/format.ts` — and every symbol and CSS keyframe it references exists.
  (session-settled: user-directed — chosen over writing the page from scratch.)

- KTD2. Register `/inscriere` in `vercel.json` as an explicit per-route rewrite
  to `/index.html`, matching the four rewrites already there. Do **not** use the
  catch-all `{"source":"/(.*)","destination":"/"}` the kit's README suggests as a
  fallback: `tests/unit/rute.test.ts` asserts rewrite sources match the routes in
  `src/main.tsx` exactly and fails on orphan rewrites, so a catch-all breaks the
  suite. That test also means no new route-parity test is needed here — it
  already covers the new route in both directions.

- KTD3. `BirthDateField` keeps a hidden `<input type="hidden" name="dataNasterii">`
  holding the ISO value, so `handleSubmit`'s `FormData` read and `validate()`
  stay untouched. This is what makes R8 free.

- KTD4. On the landing form, swap only the three `<select>` elements for
  `BirthDateField` and raise the input font size. Keep `RegistrationSection.tsx`'s
  own layout, slot counter and phase screens. Full unification is deferred above.

- KTD5. `BirthDateField` reports ISO upward; `useRegistration` stores
  `{d, m, y}`. The kit's `RegistrationForm` already carries a local ISO→parts
  adapter. The landing form needs the same adapter — the README's snippet calls a
  `setBirthFromISO` that does not exist on the hook. Do not add it to
  `useRegistration`; keep the adapter local to each form, or lift it into
  `src/components/landing/shared.ts` if both copies feel wrong.

- KTD6. Set the anti-zoom size by editing the inline `fontSize` values in
  `RegistrationSection.tsx` (`inputStyle`, `selectStyle`) from 15 to 16, not by
  adding a rule to `.e3-input` in `src/edition3.css`. Inline styles win over the
  class, so a CSS-only change would have no effect while those literals remain.

- KTD7. Guard `/inscriere` against the Coming Soon gate. `App.tsx` hides the
  landing behind `SHOW_COMING_SOON && !launch.done`, but the kit's page renders
  the form unconditionally. Today this is inert (`showComingSoon: false`,
  `launchAt` passed on 19 August), so it changes nothing for this deploy — but a
  future edition that turns the gate back on would leak an open form at
  `/inscriere`. Apply the same condition and send gated visitors to `/`.

- KTD8. Make the overlay's auto-close cancellable, matching the page's redirect.
  The kit is inconsistent with itself here: `Inscriere.tsx` moves the visitor via
  `useSuccessRedirect`, which cancels on `pointerdown`, `keydown`, `wheel` or
  `touchstart`, but `RegistrationOverlay.tsx` uses its own bare
  `setTimeout(..., CLOSE_AFTER_SUCCESS_MS)` that nothing can stop. As delivered,
  the overlay closes 3 seconds after success and jumps to `#participanti` even if
  the visitor is mid-tap on "Adaugă în calendar" or "Distribuie" — the exact
  failure `useSuccessRedirect` was written to prevent. Replace the overlay's
  timeout with `useSuccessRedirect`, or drop the auto-close and let the visitor
  close the overlay themselves. This is what R11 requires.

- KTD9. The overlay rewrites the URL to `/inscriere` via `pushState` while open,
  and restores the previous path on close; Back closes it. Keep this — it makes
  the overlay reloadable into the real page, and it is why the CTA href in U4
  points at `/inscriere` rather than staying an anchor. Consequence for tests:
  after opening the overlay the URL reads `/inscriere` even though no navigation
  happened, so asserting on the URL alone cannot distinguish the two entry points.

### High-Level Technical Design

Two entry points, one registration engine:

```
/inscriere ──► Inscriere.tsx ─────┐
                                  ├──► RegistrationForm.tsx ──► useRegistration
/ (landing) ─► RegistrationOverlay┘         │                        │
            └► RegistrationSection.tsx ─────┤                   validation.ts
                                            │                   supabase.ts
                                       BirthDateField
```

`Inscriere.tsx` and `RegistrationOverlay.tsx` are thin shells; both render
`RegistrationForm`, which differs only by props (`redirect`, `autoFocus`,
`footerSlot`). `RegistrationSection.tsx` keeps its own rendering but shares
`BirthDateField` and the same hook. Nothing new reaches the backend.

Post-signup handoff, `/inscriere` only:

```
success ──► markJustSignedUp() ──► sessionStorage
   │                                    │
   └─ 3s countdown (cancelled by any    │
      pointer/key/wheel/touch)          ▼
            └──► /#participanti ──► SignupBanner consumes flag once
```

### Sequencing

U1 → U2 is the critical path for the video link. U3 can land in parallel with U2
but must precede a green test run, because it is what breaks the existing e2e
helper. U4 and U5 depend on U2's `RegistrationForm`. U6 closes out coverage.

## Implementation Units

### U1. Shared building blocks

**Goal:** Land the three dependency-free modules the rest of the work imports.

**Requirements:** R4, R8

**Files:**
- `src/lib/justSignedUp.ts` (new)
- `src/hooks/useSuccessRedirect.ts` (new)
- `src/components/landing/BirthDateField.tsx` (new)
- `tests/unit/birthDateField.test.ts` (new)
- `tests/unit/justSignedUp.test.ts` (new)

**Approach:** Copy the three files unchanged from the kit. Nothing renders them
yet, so this unit is safe to land on its own. Per KTD3, confirm the hidden input
carries the ISO value before moving on.

**Test scenarios:**
- `12081990` typed in sequence produces the displayed text `12.08.1990` and the
  ISO value `1990-08-12`.
- A partial entry (`1208`) produces an empty ISO value, so `validate()` reports
  the date as missing rather than accepting a half-date.
- Backspace over a separator removes the separator and the digit before it.
- An impossible date (`30.02.2000`) yields an ISO string that
  `dataNasteriiError()` rejects — the existing calendar-rollover guard in
  `ageAtEvent` stays the authority.
- A value supplied from outside (`1990-08-12`) renders as `12.08.1990`, and
  clearing it to `''` clears the field — this is what `resetForm` relies on.
- `markJustSignedUp` then `consumeJustSignedUp` returns the payload once, and
  `null` on the second call.
- `consumeJustSignedUp` returns `null` on malformed JSON instead of throwing.

**Verification:** `npm run test`

### U2. `/inscriere` page and route

**Goal:** The direct link works, in dev and on a production refresh.

**Requirements:** R1, R2, R3, R7

**Dependencies:** U1

**Files:**
- `src/components/landing/RegistrationForm.tsx` (new)
- `src/components/Inscriere.tsx` (new)
- `src/main.tsx` (add the `/inscriere` branch)
- `vercel.json` (add the rewrite)

**Approach:** Copy both components from the kit. Add the route branch to
`main.tsx` alongside the existing ones, and the matching rewrite to `vercel.json`
per KTD2. Apply the Coming Soon guard from KTD7 in `Inscriere.tsx`.

**Test scenarios:**
- `tests/unit/rute.test.ts` passes unchanged — it now sees `/inscriere` in
  `main.tsx` and finds the matching rewrite. Confirm it fails when the rewrite is
  removed; that is the 404 regression it exists to catch.
- Opening `/inscriere` focuses the name field without scrolling.
- Submitting a valid form from `/inscriere` sends `editie`, ISO `data_nasterii`,
  and the `Content-Profile: runlift` header, exactly as the landing form does.
- With slots at capacity, the button reads "Intră pe lista de așteptare" and the
  submission reaches `event_waitlist`.

**Verification:** `npm run typecheck && npm run test`, plus `npm run dev` and a
manual load of `/inscriere` in a phone-sized viewport.

### U3. Landing form parity

**Goal:** The landing's own form gets the same date field and input sizing.

**Requirements:** R5, R6

**Dependencies:** U1

**Files:**
- `src/components/landing/RegistrationSection.tsx`
- `tests/inscriere.spec.ts` (update the shared `fillValid` helper and the
  sold-out test's inline fill)

**Approach:** Replace the three-`<select>` block with `BirthDateField`, wired
through a local ISO→parts adapter per KTD5. Raise `inputStyle.fontSize` to 16 per
KTD6.

The cleanup is build-blocking, not tidiness: `tsconfig.json` sets
`noUnusedLocals` and `noUnusedParameters`, so `MONTHS`, `BIRTH_YEARS`,
`selectStyle` and the now-unused `birth` binding destructured from `reg` all fail
`npm run typecheck` the moment the selects are gone. Remove them in this unit.

This unit breaks the existing e2e suite by design: `fillValid` at
`tests/inscriere.spec.ts:46-48` and the sold-out test at lines 190-192 drive the
selects via `getByLabel(...).selectOption(...)`. Both must switch to typing into
the date field. Do this in the same unit, not later.

**Test scenarios:**
- The existing "submit valid" test still asserts `data_nasterii` is `1994-05-15`
  after typing, not selecting — the backend contract is unchanged.
- The existing "data nașterii neselectată" test still shows "Introdu data
  nașterii" and sends no request when the field is left empty.
- The sold-out waitlist test still reaches `event_waitlist`.
- No `<select>` for day, month or year remains in the landing form.

**Verification:** `npm run test:e2e`

### U4. Overlay on the landing

**Goal:** The landing CTAs open the form in place instead of scrolling to it.

**Requirements:** R9, R11

**Dependencies:** U2

**Files:**
- `src/components/landing/RegistrationOverlay.tsx` (new, with the KTD8 change)
- `src/components/Landing.tsx`
- `src/components/landing/TopBar.tsx`
- `src/components/landing/Hero.tsx`

**Approach:** Copy the overlay from the kit, then apply KTD8 before wiring it —
its `CLOSE_AFTER_SUCCESS_MS` timeout must become cancellable. Hold the
open/closed state in `Landing.tsx` and pass `onInscrie` down. In `TopBar` and
`Hero`, change the CTA from `href="#inscriere"` to `href="/inscriere"` with an
`onClick` that prevents default and opens the overlay — the href is the no-JS
fallback R9 requires.

Note for `tests/unit/rute.test.ts`: its second describe block scans
`src/components/landing/*.tsx` for internal `href` values and requires each to be
a known route. `/inscriere` qualifies once U2 has landed, so U4 must not ship
ahead of U2.

**Test scenarios:**
- Clicking "Înscrie-te" in the top bar opens the overlay without navigating.
- Clicking "Rezervă-ți locul" in the hero does the same.
- Escape, a backdrop click, and the browser Back button each close the overlay.
- Both CTAs carry `href="/inscriere"`, so the link still works with JS disabled.
- Opening the overlay changes the URL to `/inscriere` without a page load, and
  closing it restores the previous path (KTD9).
- A registration completed inside the overlay shows the confirmation and does
  **not** trigger a full-page redirect: the overlay renders `RegistrationForm`
  without the `redirect` prop, so `markJustSignedUp` is not called and no banner
  appears afterwards.
- Interacting during the overlay's post-success countdown keeps the confirmation
  open, so "Adaugă în calendar" and "Distribuie" stay tappable (R11, KTD8). This
  test fails against the kit as delivered — it is the point of KTD8.

**Verification:** `npm run test && npm run test:e2e`

### U5. Post-signup banner and redirect

**Goal:** Someone who registers on `/inscriere` ends up on the participants list
with their place named.

**Requirements:** R10, R11

**Dependencies:** U2

**Files:**
- `src/components/landing/SignupBanner.tsx` (new)
- `src/components/Landing.tsx` (render the banner above `TopBar`)

**Approach:** Copy the banner from the kit and render it as the first child of
the landing root. `RegistrationForm` already calls `markJustSignedUp` on success
when `redirect` is set. `useSuccessRedirect`'s `REDIRECT_TO` is `/#participanti`,
which matches the existing `id="participanti"` on `ParticipantsSection.tsx` — no
change needed there.

**Test scenarios:**
- After a successful `/inscriere` submission, the confirmation shows a visible
  countdown before the move.
- A tap, key press, scroll or wheel event during the countdown cancels it and the
  visitor stays put.
- Landing on `/#participanti` with the flag set shows the banner once; a reload
  does not show it again.
- With `sessionStorage` unavailable, the redirect still happens and the banner is
  simply absent — the flow must not break.
- A waitlist registration produces the waitlist wording, not "ești înscris".

**Verification:** `npm run test:e2e`

### U6. End-to-end coverage for the new flows

**Goal:** The new page and the new date field are covered by their own tests, not
only by the adapted landing tests.

**Requirements:** R1, R2, R4, R10

**Dependencies:** U2, U3, U4, U5

**Files:**
- `tests/inscriere-directa.spec.ts` (new)

**Approach:** Follow the conventions in `tests/inscriere.spec.ts`: `fixClock` to
hold the clock before the deadline, `mockStats` / `mockEmail` / route mocks so
nothing touches the real database or sends email. Note that `/inscriere` does not
need `?preview=landing` — that parameter only governs `App.tsx`'s Coming Soon
branch.

**Test scenarios:**
- `/inscriere` loads, the name field has focus, and the countdown renders.
- A full registration from `/inscriere` succeeds and posts the expected body.
- The birth date typed as `15.05.1994` posts `1994-05-15`.
- An underage date shows the minimum-age message and sends no request.
- The confirmation redirects to `/#participanti` and the banner appears once.
- Interacting during the countdown cancels the redirect.
- The overlay path on the landing completes a registration without redirecting.

**Verification:** `npm run verify`

## Verification Contract

Run in this order. The build script runs the deploy-config guard before `vite
build`, so a CSP or Supabase-reference drift fails the build rather than
production.

```bash
npm run typecheck
npm run typecheck:tests
npm run test
npm run build
npm run test:e2e
```

`npm run verify` chains all five.

Manual gate before deploy — this is the point of the work and no automated test
covers it:
- Open `/inscriere` on a real iPhone (or Safari's responsive mode at 375px).
- Confirm the viewport does not zoom when focusing name, phone, email or date.
- Type a birth date and confirm the separators appear without fighting the caret.

Deploy: `vercel --prod`. A GitHub push does not reliably trigger a build.

Post-deploy: hard-refresh `https://parktraining.fit/inscriere` and confirm it
returns the page, not a 404 — that is what KTD2's rewrite buys, and it can only
be confirmed in production.

## Definition of Done

**Global:**
- All six units complete; `npm run verify` green.
- The manual mobile gate above has been performed on a phone-sized viewport.
- No `<select>` for day, month or year remains anywhere in the registration
  forms, and `MONTHS` / `BIRTH_YEARS` / `selectStyle` are removed if unused.
- No change to `src/lib/validation.ts`, `src/lib/supabase.ts`, or any migration
  file. If a change there seemed necessary, that is a stop condition, not a task.
- No leftover scaffolding from the kit's README: no catch-all rewrite in
  `vercel.json`, no `setBirthFromISO` added to `useRegistration`.
- No uncancellable timer moves a visitor off a confirmation screen, on either
  entry point (R11 / KTD8).
- Deployed with `vercel --prod`, and `/inscriere` verified live.

**Per unit:** each unit's test scenarios are implemented and passing, and its
named verification command is green before the next unit starts.

## Sources

- Kit as delivered: `~/Downloads/inscriere-directa/` — seven source files plus a
  README with the integration diff.
- Kit file `RegistrationOverlay.tsx:56-65` — the uncancellable post-success
  timeout that KTD8 replaces, versus `useSuccessRedirect.ts:52-66` in the same
  kit, which cancels on interaction.
- `tests/unit/rute.test.ts` — route/rewrite parity guard, both directions;
  removes the need for a new route test and forbids the catch-all rewrite.
- `tests/inscriere.spec.ts:42-52,187-193` — the e2e helpers that break when the
  date field changes.
- `src/hooks/useRegistration.ts:58-59,119-143` — birth state shape `{d,m,y}` and
  the `FormData` read that keeps R8 free.
- `src/lib/validation.ts:57-90` — `ageAtEvent`'s calendar-rollover and timezone
  guards, which the typed field must not bypass.
- `src/App.tsx:16-17` — the Coming Soon condition that KTD7 mirrors.
- `src/content/edition.ts:34-44` — `start`, `registrationDeadline` and
  `launchAt` for Ediția 5.
