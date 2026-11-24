---
title: Telegram member feedback and profiles
type: feat
date: 2026-11-24
topic: telegram-member-feedback
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-brainstorm
execution: code
---

# Telegram member feedback and profiles

## Goal Capsule

- **Objective** — Organizers learn how park-group members feel, what they want from training, and what goals they want to work toward.
- **Product authority** — The feedback-first brainstorm. Ship the survey, command menu, invitation, profile collection, and organizer review first.
- **Execution** — One PR. The production schema change follows the project's manual migration process.
- **Open blockers** — None for implementation and merge. Applying the migration is required before live collection.

## Product Contract

### Summary

An organizer posts one group invitation with two buttons. Members answer the feedback survey privately or fill in their named profile. Organizers use the feedback to decide what to change and the profile responses to discuss individual goals.

### Requirements

- R1. Put `/feedback` and `/profil` in the bot's private command menu. Keep organizer commands available. Both commands open their own flow and do not require the other form.
- R2. Let an organizer preview and publish one group invitation with **Dă feedback** and **Completează profilul**. Each button opens the corresponding private form.
- R3. Ask how a member feels in the group, what they would like more often, and what would make it easier or more enjoyable to attend. Use one choice, multiple choices, and optional free text, respectively.
- R4. Explain before submission that replies are saved without a name or profile link. Let organizers see exact choice counts and comments privately, including older comments.
- R5. Ask for the member's preferred name, optional birthday day and month, and optional goal in their own words. Keep birthday greeting consent independent. Show a preview before saving. Let members revisit and edit their profile.
- R6. Prefill the saved or known name. Match an account by its numeric Telegram identity and show unmatched profiles to organizers for review. Reuse the existing member-linking screen for matching. An accepted profile does not activate a training goal.
- R7. Check current membership in the configured park group before opening or saving either form. Only authorized organizers can publish the invitation or see organizer lists.

### Key Flows

- F1. The organizer previews the invitation, then confirms in private. A member taps a button or picks a command. The feedback flow shows its privacy notice before collecting answers. Covers R1–R4, R7.
- F2. A member opens their profile, reviews the fields, and saves. The organizer sees the goal text and can distinguish linked and unmatched members. Covers R5–R7.

### Scope Boundaries

- This increment collects feedback and profiles. The later attendance and performance goals retain coach confirmation. Profile collection precedes annual greetings, check-ins, milestones, recurring after-training questions, and weekly statistics.

## Planning Contract

### Key Technical Decisions

- KTD1. **Use Telegram messages and inline buttons.** The existing bot is the entry point for both forms. Register member commands for private chats and explicitly merge them into the organizer-specific menu because Telegram picks the most specific scope. Use existing start links and verify that form-specific startup leaves the trial and DM preference paths alone. Governs R1, R2.
- KTD2. **Keep feedback and profiles in distinct service-only tables.** A survey row has a random submission ID, answer fields, and a submission date. It has no Telegram or member identifier. Named profiles are addressed by Telegram ID, and the organizer listing resolves the membership link using the current roster. An unmatched submission stays separate from the roster and appears in organizer review. Governs R4–R7.
- KTD3. **Keep guided forms short-lived.** Use the existing single-replica pattern for Telegram drafts with expiry and stale-button checks. Keep one form per private chat. Start links and form commands replace it. Handle retries of the same save without duplicating a response. An expired draft asks the member to reopen the form. Governs R1, R3–R6.
- KTD4. **Keep invitations deliberate.** Use the organizer preview and confirmation pattern with the configured group and a bot username verified via Telegram. Validate schema availability before creating the invitation. A refused or uncertain publication reports back privately. Governs R2, R7.

### High-Level Technical Design

The webhook dispatches member form commands, form-specific start links and callbacks before the generic private onboarding route. Authorized organizer review commands stay in the same bot chat. Use service-only database access for commands and never put names on feedback responses. Count survey options at the database and fetch bounded pages for comments and profiles. Store the provided name in the form profile while preserving the roster identity used to resolve the match. A recognized form entry point should return a neutral unavailable message until the migration is present.

## Implementation Units

### U1. Persist feedback and profiles

**Goal** — Store validated forms and support organizer review while keeping named and unnamed records separate.

**Requirements** — R3–R7.

**Files** — `supabase/sql/supabase-migration-sala-feedback.sql`, bot data adapter, SQL test and migration documentation.

**Verification** — Apply the migration twice in the SQL harness. Assert invalid values and roles are rejected. Assert survey totals and profile matching use their own sources.

### U2. Guide members through both forms

**Goal** — Provide short private Telegram flows with optional answers, profile preview and edits, and clear expired-state handling.

**Requirements** — R1, R3–R7.

**Dependencies** — U1.

**Files** — Bot form controller and focused flow tests.

**Verification** — Cover survey submission and stale or repeated save, profile defaults and optional data, birthday validation, organizer review eligibility, retry behavior, and private-group boundaries.

### U3. Connect commands, invitation, and organizer review

**Goal** — Make the forms findable and give organizers a private way to launch and read them.

**Requirements** — R1, R2, R4, R6, R7.

**Dependencies** — U1, U2.

**Files** — Bot webhook, startup command registration, organizer form commands and deployment guide.

**Verification** — Exercise the webhook entry points against Telegram and persistence doubles. Confirm both organizer menu scopes retain existing behavior and all publication happens after confirmation.

## Verification Contract

- Run the bot test suite and build on the repository's Node version, plus the focused database migration tests and the root CI checks.
- Review privacy boundaries, retries, unrelated webhook commands, permissions, and behavior before migration. Apply any actionable findings before opening the PR.
- Wait for required GitHub checks on the mergeable head. Use the repository's PR merge path.

## Definition of Done

- A member can enter either form from the group invitation or the bot menu. Both forms save the intended data and show understandable success or failure.
- Organizers can publish the reviewed invitation and see response counts, unattributed comments, and named profile submissions privately.
- The migration and CI checks pass. The production group invitation stays a separate organizer action.
