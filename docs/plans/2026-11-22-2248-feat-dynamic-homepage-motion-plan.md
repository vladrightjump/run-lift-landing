---
title: Give the Run + Lift homepage a more dynamic race-day feel
type: feat
date: 2026-11-22
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-plan-bootstrap
execution: code
---

# Give the Run + Lift homepage a more dynamic race-day feel

## Goal Capsule

Make the homepage feel like arriving at an outdoor race, with a clear path to registration and a more tangible sense of how the event works. Build on the existing race-poster identity and real on-site footage. Implement and verify the work locally as one change.

---

## Product Contract

### Problem Frame

Run + Lift already has motion across the homepage, including a moving banner, scroll reveals, a video backdrop and a three-stage format explorer. The video sits behind a heavy wash and the format panels are text-only. The strongest opportunity is to give the race footage its own space and connect it to the event explanation.

### Requirements

- R1. Give the hero a coordinated, readable entrance for its title, footage and actions. Preserve the existing event copy, primary action and brand palette.
- R2. Turn RUN / LIFT / REPEAT into an illustrated race sequence using stills from the existing track footage. Give the section a scroll-linked visual beat while leaving stage changes to the visitor.
- R3. Make motion work with keyboard and touch. Let visitors pause and resume the looping hero video. Provide a still and immediately visible content with reduced motion, and preserve the still when playback is unavailable.
- R4. Keep the homepage's configurable section order, race-day phase, overlay, route and metadata behavior. Make the compositions work on narrow phones through desktop.

### Acceptance Examples

- AE1. A visitor can read the title and use the primary action as the hero enters. Pausing the footage keeps it still until the visitor resumes it.
- AE2. Arrow Right on RUN selects LIFT and presents its copy and still in the same reserved layout. Scrolling past the section leaves the selection intact.
- AE3. With reduced motion, the visitor immediately sees the hero poster and can operate the explorer and registration as usual.

### Scope Boundaries

The motion pass covers the event homepage and shared effects only where the homepage opts in. Coming Soon, standalone routes, admin, and event data retain their own presentation and behavior.

### Sources

- The pasted creative brief defines the animation, responsive, accessibility, and performance goals.
- `docs/plans/2026-09-26-1417-feat-redesign-pagina-publica-plan.md` establishes the Anton and lime race-poster direction and the accessible format explorer.
- `src/features/landing/components/Landing.tsx` owns rendering modes and section order. `src/shared/ui/PublicLayout.module.css` provides existing scroll timelines.
- [Landbook fitness gallery](https://land-book.com/design/website/health-and-fitness) informed the focus on sport photography and typography. [GSAP](https://gsap.com/) and [Motion](https://motion.dev/) describe full animation runtimes. The existing CSS, media and React primitives cover this pass. [W3C scroll-driven animations](https://www.w3.org/TR/scroll-animations-1/) and [WCAG pause, stop, hide](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html) inform the progressive enhancement and playback controls.

---

## Planning Contract

### Key Technical Decisions

- KTD1. Use local CSS Modules for the hero choreography and one format scroll timeline. Use transform and opacity on small layers. Keep structural content visible and let unsupported browsers render the complete static composition.
- KTD2. Reuse the responsive video source and pick a more representative still from the actual footage. Use compact local WebP frames. Pause media offscreen and respect a manual pause when returning to the hero.
- KTD3. Keep the selected tab as the source of truth for the format panel and its still. Preserve reserved panel height and restrict scroll animation to decoration. Keyboard focus and native scrolling stay independent of the effect.

### High-Level Technical Design

- Hero lifecycle: poster available immediately → eligible video can play → user pause, viewport exit or reduced motion stops playback → viewport return can resume eligible playback unless manually paused.
- Explorer: visitor activates a tab → selected stage drives both panel content and still. Section visibility drives a separate CSS timeline with a static fallback.

### Assumptions

The homepage is the highest-impact surface for this brief. The existing dark palette and published event details are the creative baseline. Real footage and two defined motion sequences cover the requested direction without adding a motion dependency.

---

## Implementation Units

### U1. Recompose the hero around real footage

**Requirements** R1, R3, R4.

**Files** `src/features/landing/components/Hero.tsx`, `src/features/landing/components/Hero.module.css`, `public/landing/hero.webp`.

**Approach** Pair the existing typography with a framed video on desktop. Stack the title, image and actions on mobile. Stagger the existing title masks with the media and supporting elements. Keep parallax on the image layer. Use a native button for playback and gate the media source by motion preference.

**Test scenarios** In `tests/e2e/miscare.spec.ts`, check visible first-frame typography, media-only movement, manual pause and resume, and a visible poster with no video under reduced motion. Exercise the primary action in `tests/e2e/landing.spec.ts` and race-day CTA visibility in `tests/e2e/faze.spec.ts`.

### U2. Add an illustrated format sequence

**Requirements** R2, R3, R4. Depends on U1 for the visual rhythm.

**Files** `src/features/landing/components/FormatSection.tsx`, `src/features/landing/components/FormatSection.module.css`, `public/landing/{run,lift,repeat}.webp`.

**Approach** Pair the existing stage copy with one still per stage in a fixed-aspect frame. Draw a track-like accent as the section enters view. Keep selection deliberate and preserve the current tab semantics and text.

**Test scenarios** Use `src/features/landing/components/FormatSection.test.tsx` for selection and focus. In `tests/e2e/miscare.spec.ts`, check that selecting LIFT and REPEAT updates the still and panel, including under reduced motion. Use `tests/e2e/ordine-homepage.spec.ts` for reordered and hidden sections and `tests/e2e/mobil.spec.ts` for narrow layouts.

---

## Verification Contract

Run repository linting, production and test type checks, unit tests and the production build. Run focused Playwright coverage for homepage motion, layout, and navigation. Inspect the hero and Format section in a real browser at desktop, tablet, and narrow mobile sizes, including reduced-motion mode. Check that imagery loads, the actions fit, and the viewport has no horizontal overflow.

---

## Definition of Done

- The hero and Format section are visually distinct parts of one race-poster composition with local, optimized footage.
- Playback and stage controls respond to keyboard and touch, and reduced-motion visitors get immediate static content.
- The homepage's event phase, section ordering, sign-up and navigation still pass verification.
