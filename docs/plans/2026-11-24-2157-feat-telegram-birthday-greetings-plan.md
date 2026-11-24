---
title: Birthday greetings in the Run + Lift Telegram group
type: feat
date: 2026-11-24
topic: telegram-birthday-greetings
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-brainstorm
execution: code
---

# Birthday greetings in the Run + Lift Telegram group

## Goal Capsule

- **Objective** — A park-group member can receive one birthday greeting in Telegram without entering a date in the bot form.
- **Product authority** — Use the member's Telegram profile when it exposes a date. Let an organizer enter or correct the date manually. The member controls permission to be greeted.
- **Execution** — One PR. The park-group database migration is applied separately under the existing deployment process.

## Product Contract

### Requirements

- R1. The training profile asks for name and goal. The private bot command `/aniversare` exposes the independent birthday greeting setting and a way to remove the date.
- R2. When the member enables greetings, look for the optional birthday in their private Telegram chat. Store day and month only. A failed lookup leaves an unavailable or missing Telegram date without forcing manual input on the member.
- R3. In **Admin → Membri**, an authorized organizer can read, enter, correct, or clear the birthday for a linked Telegram account. A manually entered date takes precedence. Date edits do not enable group greetings.
- R4. Preserve dates and greeting preferences already saved by the previous profile form. A member can disable greetings or remove their date. A removed date stays out of Telegram imports until the member re-enables them.
- R5. Send one greeting once per year at 09:00 Chișinău time, or later the same day if the worker recovers. Confirm current group membership. For a Telegram-sourced date, verify it's still visible and correct before publishing. Publish the member's preferred name without an age or birth year.
- R6. An expired or retried run must not produce a duplicate. When Telegram may have accepted a request, retain its uncertain outcome and skip an automatic resend.

### Key Decisions

- **Telegram or organizer entry.** Members can enable birthday greetings without answering a birthday question in the profile form. (session-settled: user-directed — chosen over asking the member to type their date in the bot.) Governs R1–R3.

### Acceptance Examples

- A member's private chat exposes 27 November. Enabling greetings saves 27.11. Telegram supplies a birth year and the bot discards it.
- No date is visible. An organizer saves 27.11. The member keeps control of the private greeting switch.
- A previously imported date becomes hidden or changes. The worker skips the old greeting. A concurrent profile edit cannot overwrite an organizer's date or a member's greeting choice.
- Two worker runs see the same birthday. PostgreSQL issues one claim for that account and year. An ambiguous send is never sent again automatically.

## Planning Contract

### Key Technical Decisions

- KTD1. Keep a dedicated service-only preference table keyed by numeric Telegram account. Store date, provenance, and the separate greeting switch. Backfill existing day, month, and consent with legacy provenance once. Preserve the old profile RPC during deployment and expose a name-and-goal RPC that never overwrites birthday data.
- KTD2. Add token-checked Admin RPCs for the read and edit dialog. Pass the expected numeric Telegram account on save so a stale dialog cannot update a newly linked account. Limit date management to linked members.
- KTD3. Use Telegram's official optional private-chat birthdate. A successful missing field removes a previously imported date. Transport failures leave the saved value pending verification. The manual and legacy sources never require profile lookup for delivery. Use 29 February literally in leap years.
- KTD4. Under the existing bot scheduler and master switch, check birthdays from 09:00 local time. Read due candidates, verify membership and imported dates, and use a service-only transactional claim keyed by account and annual occurrence before sending. Record sent, rejected, or uncertain outcome. Retries before claim are safe. A missing migration leaves old bot flows available.

## Implementation Units

### U1. Birthday storage and RPC contracts

**Files** — Birthday migration, migration index, and focused SQL tests.

**Verification** — Migration replay, legacy data, date validation, privacy grants, manual override, stale account checks, opt-out, candidate filtering, and concurrent-safe claim.

### U2. Organizer birthday editor

**Dependencies** — U1.

**Files** — Member admin UI, its API bindings and focused tests.

**Verification** — Manual date save and clear, visible preference status, unavailable-schema state, and a desktop/mobile check.

### U3. Telegram birthday settings

**Dependencies** — U1.

**Files** — Private bot commands and member profile routing, Telegram profile adapter, focused tests.

**Verification** — Visible, hidden, changed and omitted Telegram dates, manual precedence, independent consent, privacy, graceful behavior before migration.

### U4. Scheduled group greeting

**Dependencies** — U1.

**Files** — Bot birthday job, worker scheduler, focused tests and operator documentation.

**Verification** — Local scheduling window, membership, consent recheck, source verification, duplicate prevention, and ambiguous Telegram delivery.

## Verification Contract

- Review the plan before implementation. Review data permissions and data retention, state transitions, the scheduler, and the organizer experience before pushing.
- Run migration tests, bot tests and build, and the project's required GitHub checks. Merge the reviewed, passing head via GitHub.

## Definition of Done

- Members can opt in without entering a date. Organizers can maintain the date privately.
- Eligible members receive one greeting in the intended group each year.
- The merge is verified. The release guide identifies the production migration and group behavior.
