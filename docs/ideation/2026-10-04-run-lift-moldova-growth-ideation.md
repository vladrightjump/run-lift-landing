> **Markdown edition — 2026-10-04.** Includes the latest seven product and website ideas plus the complete earlier exploration and rejection history. See also the [digital-product evidence](2026-10-04-run-lift-digital-product-evidence.md) and [equipment and event concept](2026-10-04-run-lift-equipment-and-events.md).

Run + Lift · Refined product and website ideas

# Meet the team. Start training. See your progress.

Date: 2026-10-04 · Topic: run-lift-moldova-growth  
Focus: paid events, training products, digital assets and a possible gym in 2027  
Approach: refinement of the existing website and business ideation

Build one connected experience: events introduce people to Run + Lift, a beginner programme gives them a next step, and a clear club offer helps them continue. Reuse the programme as a digital product once it has been tested.

<a id="r26-context"></a>

## Codebase Context

### What we now know

- 12–20 people per session; around 90% pay, according to you.
- 8 wall balls, 6 sandbags and around 10 kettlebells already owned.
- Approximately €2,000 under consideration for equipment.
- Interest in larger events, online assets and potentially a gym in 2027.

### What remains unknown

- Unique paying customers, current prices and actual contribution.
- Coach hours, monthly growth budget and retention.
- Equipment weights, venue, transport and storage.
- Paid online demand and local demand for a specific indoor timetable.

The site has event registration and an ordered weekly training page. [App.tsx](../../src/App.tsx) ties the homepage to event phases; [Hero.tsx](../../src/components/landing/Hero.tsx) leads with an event. [Antrenament.tsx](../../src/components/Antrenament.tsx) gives the training programme a reusable starting point. The opportunity is to connect these surfaces to a clear ongoing paid offer.

Local competition already includes HYROX classes: [MARTS publishes them in its schedule](https://martsfitness.md/). The proposed difference is an approachable start, consistent teammates and visible personal progress. This positioning still needs customer validation.

### Topic Axes

Acquisition and experiences · Paid progression · Retention and recurring income · Reusable digital assets · Future facility demand.

Seven ideas below refine earlier work against the new facts. Confidence scores are editorial judgments about fit, not statistical estimates of commercial success. Earlier analyses and their rejected ideas are preserved in the history below.

<a id="r26-ideas"></a>

## Ranked Ideas

<a id="r26-idea-1"></a>

### 1. Run + Lift Challenge

Acquisition and experiences · Confidence 85% · Complexity Medium

**Description:** A repeatable, beginner-friendly team event: learn the movements, rotate through stations, finish together and receive a result. Rehearse one 20–24-person wave with the existing group before considering two waves. Actual capacity depends on weights, targets, space and staffing.

**Revenue model:** Paid individual or pair entry; an optional preparation bundle can include the beginner programme, with its inclusions and price made explicit.

**Website idea:** An event page showing date, venue, beginner options, wave availability, total price and registration. After the event, link results and photos to the next training programme.

**Basis:** direct: You report “8 wallballs 6 sandbags and around 10 katelbells.” The repository already has event registration, capacity and waitlist flows. This supports testing a larger format; it does not establish a safe maximum capacity.

**Why it matters:** Uses equipment and an operating format you already have. A recurring recognisable experience can introduce new people to the coaching.

**Tradeoff:** An event can attract only existing customers or consume more staff time than it earns. Additional machines can create queues.

**Proof to seek:** Measure new attendees, event contribution after delivery costs and coach time, and new programme purchases within 14 days. A proposed first-pilot learning target is 10 new attendees and 3 purchases, not a forecast or automatic investment threshold.

<a id="r26-idea-2"></a>

### 2. Run + Lift Start — six weeks

Paid progression · Confidence 85% · Complexity Medium

**Description:** A fixed-start beginner group that combines coached sessions, a simple weekly plan, essential demonstrations and a repeatable progress assessment. The promise is a clear next step for someone who enjoyed an event but does not know how to train consistently.

**Revenue model:** One programme fee, with a defined number of coached sessions and support boundaries. Existing members pay only for additional value beyond their current package.

**Website idea:** A programme page with the next real start date, coach, schedule, prerequisites, sample week, price and a direct purchase or booking action.

**Basis:** direct: You report 12–20 attendees per session and around 90% paying. src/components/Antrenament.tsx already presents a sequence of training weeks. Existing willingness to pay supports an adjacent coached offer, not proof of its price.

**Why it matters:** Gives event participants something specific to buy and reuses teaching materials across groups.

**Tradeoff:** Coaching capacity is unknown. The existing running curriculum needs qualified adaptation before it becomes a combined strength-and-running programme.

**Proof to seek:** Seek paid places at a price that covers delivery, then measure attendance, completion, coach hours and continuation into the club. Do not count transfers from an existing package as entirely new revenue.

<a id="r26-idea-3"></a>

### 3. Run + Lift Club

Retention and recurring income · Confidence 80% · Complexity Low–Medium

**Description:** A clearly defined monthly package for regular training, the current plan and periodic progress reviews. It is the continuation after Start and can also serve existing regular attendees.

**Revenue model:** Recurring training income with a stated visit allowance and booking rules. Review current prices before proposing a new price or including events.

**Website idea:** A compact membership comparison, live training schedule and easy renewal. Begin with the minimum purchase flow; a full member dashboard can wait.

**Basis:** direct: Paying regular attendance is user-reported, and the legacy schema contains monthly_due and payments. Neither establishes the current billing model or deployed payment functionality.

**Why it matters:** Makes the ongoing offer understandable and lets the business evaluate retention and capacity.

**Tradeoff:** A monthly plan can reduce revenue from frequent drop-in buyers if badly priced. Unlimited attendance may exceed capacity.

**Proof to seek:** Track unique paying members, paid visits, renewal rate, contribution per member and seat utilisation. Judge the new package against actual current revenue, not attendance multiplied by an assumed membership price.

<a id="r26-idea-4"></a>

### 4. Run + Lift Anywhere

Reusable digital assets · Confidence 60% · Complexity Medium

**Description:** Turn the tested six-week curriculum into a self-guided product: weekly calendar, short original exercise demonstrations, progress tracker, exercise substitutions and clearly stated equipment requirements. Keep a separate coached option with limited scheduled support.

**Revenue model:** One-time digital programme purchase. An illustrative self-guided test price is 399 MDL; 10 genuinely additional buyers would mean 3,990 MDL gross, before costs and tax.

**Website idea:** A sample week and demonstration video, a clear description of what is included, purchase and delivery access. Preserve the useful free weekly workout and sell added structure and original teaching material.

**Basis:** direct: You explicitly asked for online assets and training experiences; the site already publishes training weeks. reasoned: materials proven during coaching reduce speculative production work, although local coaching demand does not prove remote demand.

**Why it matters:** Creates something reusable from work already needed for the local programme, including for people who cannot attend your morning sessions.

**Tradeoff:** Paid online demand and acquisition costs are unproven. A generic PDF is easy to substitute; ongoing support can eliminate the intended time savings.

**Proof to seek:** Test five paid self-guided buyers, including at least two outside the existing park group. Record activation, completion, refunds and support time; evaluate coached buyers separately.

<a id="r26-idea-5"></a>

### 5. My Run + Lift progress

Retention and referrals · Confidence 70% · Complexity Medium

**Description:** A simple personal progress record connecting an initial assessment, later challenge results and the next training goal. Offer a voluntary share card and invitation link for a friend.

**Revenue model:** A benefit inside the programme or club, rather than a separate subscription. It supports renewals and introductions.

**Website idea:** Start with a lightweight result page showing date, workout format, load or adaptations and personal progress. Public sharing is optional; a large social network is unnecessary.

**Basis:** direct: Existing admin fields include attendance and finish times. reasoned: a comparable second result can make improvement tangible, but current timing fields alone do not establish comparability.

**Why it matters:** Makes the brand promise of visible progress concrete and gives members a reason to return or share.

**Tradeoff:** Results must record equivalent formats and adaptations. Some participants do not want public rankings. Retention impact remains a hypothesis.

**Proof to seek:** First provide simple individual summaries manually. Measure return bookings and attributable friend bookings before investing in accounts, achievements or automatic dashboards.

<a id="r26-idea-6"></a>

### 6. Run + Lift Teams

Acquisition and experiences · Confidence 55% · Complexity Medium

**Description:** A private, coached version of the proven team event for a local employer or existing group, adapted to mixed ability. Reuse the same kit, instructions and format.

**Revenue model:** A quoted group fee based on attendance, staffing, venue and transport, rather than an invented corporate price.

**Website idea:** A concise teams page showing the experience, group size range, real photos and an enquiry for date, headcount and location.

**Basis:** reasoned: The equipment can serve a second buyer without creating an unrelated service. Existing local company participation in sports is precedent, but no employer has committed to this offer.

**Why it matters:** Potentially sells a whole group through one buyer and uses the event format between public editions.

**Tradeoff:** Sales time and bespoke requests can absorb margin. It competes with delivery for the same small team.

**Proof to seek:** After the public format works, seek one paid group pilot with measured delivery margin. Enquiries alone do not validate willingness to pay.

<a id="r26-idea-7"></a>

### 7. Run + Lift Indoors — evidence for 2027

Future facility demand · Confidence 65% · Complexity Medium

**Description:** Trial paid sessions in an existing suitable facility before deciding on a dedicated gym. Match the neighbourhood, timetable and approximate price you would actually offer.

**Revenue model:** Paid indoor training using rented hours and the existing community. A future gym is a conditional expansion, not a promised launch.

**Website idea:** A small interest form for neighbourhood, preferred times and willingness to attend a paid pilot. Once sessions are secured, offer real bookings. Do not sell access to an unspecified future facility.

**Basis:** direct: You may open a gym in 2027 and have limited resources plus a proposed €2,000 equipment investment. reasoned: paid local renewal is stronger evidence for a lease than online followers or a generic waitlist.

**Why it matters:** Tests location-specific demand while creating a route to indoor continuity and a possible future gym.

**Tradeoff:** A profitable rented slot does not prove that a full facility covers rent, staffing, equipment and working capital. Venue, storage and transport remain unknown.

**Proof to seek:** Evaluate repeated paid attendance and contribution across several cycles. Obtain actual costs and calculate break-even members from contribution per member before considering a lease.

<a id="r26-website"></a>

## Website direction

Keep the lime, dark olive, bold typography and authentic training footage. Give the club a permanent home between events.

Illustrative Romanian homepage copy

### Aleargă. Ridică. Progresează împreună.

Antrenamente de alergare și forță în Chișinău, adaptate nivelului tău. Începe cu echipa și urmărește-ți progresul.

**Primary action:** Vino la un antrenament  
**Secondary action:** Vezi următorul eveniment

The homepage could show the next real training session and price, a brief explanation of who it suits, authentic member stories, then the three ways to participate: train locally, join a challenge, or follow a programme online when that product is ready.

Discover  
**Member story / friend**Experience  
**Training / event**Develop  
**Six-week Start**Continue  
**Club / next challenge**

| Website surface | Commercial purpose | Smallest useful version |
| --- | --- | --- |
| Home and training | Turn interest into a first visit | Real schedule, price, location, coach and direct booking |
| Events | Sell the next experience | Beginner options, wave booking, price and next training invitation |
| Programmes | Sell Start and later Anywhere | Outcome, sample week, inclusions, equipment needs and payment |
| Results and stories | Encourage return visits and sharing | Comparable results and voluntary member stories |
| Teams / indoor interest | Learn about later demand | Focused enquiry pages when those offers can be serviced |

Keep purchase simple. [maib advertises payment links and recurring-payment capabilities](https://www.maib.md/ro/solutii-de-plata/e-commerce); merchant eligibility and terms still need confirmation. Registration, confirmed payment and attendance should remain distinct when judging demand.

<a id="r26-priority"></a>

## Where to focus

### First

One repeatable Challenge, one clear next programme, and an evergreen homepage that sells both. Protect the regular paid sessions while testing the new offer.

### After evidence

Package reusable online assets, add progress sharing, and test a paid indoor slot. Explore company events once the public event runs reliably.

The €2,000 is a proposed investment ceiling, not evidence that all of it should be spent. Rehearse with the existing kit, identify missing weights or station capacity, and preserve cash for transport, delivery and the next test. An online customer elsewhere is not automatically a future gym member in Chișinău.

**Measure:** new people → paid purchase → actual attendance → repeat purchase, alongside contribution after delivery costs and coach time. Event attendance, digital sales and membership revenue should not double-count bundled purchases.

<a id="r26-cuts"></a>

## Rejection Summary

20 refinement candidates considered: 7 retained, 4 incorporated into retained ideas or the shared website foundation, and 9 deferred. All five axes are represented. The earlier rejection table remains in the historical report.

| Candidate | Decision and reason |
| --- | --- |
| Evergreen homepage | Retained as the shared website foundation below, not an eighth standalone product. |
| Bring-a-friend booking | Folded into Challenge and progress sharing; track actual paid referrals. |
| Event-to-programme bundle | Folded into Challenge and Start; do not double-count the same customer payment. |
| Exercise video library | Folded into Anywhere; produce essential demonstrations before a large catalogue. |
| Race preparation clinic | Defer until members request specialist help; competes for scarce coach time. |
| Gym founding deposits now | Defer until venue, price, dates and delivery commitments are concrete. |
| Large equipment purchase before rehearsal | Existing inventory can test the format; purchase against an observed bottleneck. |
| Native mobile app | High maintenance burden before repeat purchases justify it. |
| Merchandise stock | Ties up scarce cash; revisit limited preorders after demand is demonstrated. |
| Sponsor marketplace | Needs partner sales and audience evidence; a direct local partnership is simpler. |
| Regional event tour | Travel and staffing add complexity before the local format is repeatable. |
| Unlimited personal online feedback | Unbounded support load conflicts with limited resources. |
| Paid advertising at scale | Defer large spend until the offer converts and contribution supports acquisition costs. |

## Earlier exploration — preserved ideas, evidence and rejection history

Historical snapshot before attendance, equipment and budget were clarified. Statements of unknown attendance and the online-only framing below have been superseded by the refinement above.

Direction updated

The user has clarified that growth should focus on online training assets and digital experiences. See the [digital product evidence and demand test](2026-10-04-run-lift-digital-product-evidence.md). The analysis below records the earlier, broader local-business exploration.

Run + Lift · Growth opportunity review

# Build the club people join. Then build the brand they wear.

Date: 2026-10-04 · Topic: run-lift-moldova-growth  
Focus: design, functionality, revenue and a sports brand in Moldova  
Approach: current codebase, live public pages and local market evidence

The strongest direction is a coached beginner program that leads into a clearly defined recurring club. Your website can make that pathway visible every day; events, company packages and a first physical product can grow around it.

“Kodlova” is interpreted as Moldova. Existing sales and memberships are unknown, so these are opportunities to validate against your current business—not a claim that you start from zero.

<a id="context"></a>

## Codebase Context

### Assets already present

- Event registration, capacity, waitlist, email confirmations and reminders.
- Weekly training curriculum and reusable real training videos.
- Event attendance, bibs and finish times in the admin.
- Telegram polls, member history and inactivity signals.
- A coherent Run + Lift visual identity and a specific Chișinău park routine.

### Commercial gaps

- No visible price or paid package in the inspected public flows.
- Information capture takes the place of a dated first visit.
- The homepage becomes an announcement queue between events.
- No public result-history journey despite admin timing fields.
- No verified buyer conversion, renewal or contribution figures available for this review.

The legacy shared schema contains `monthly_due` and `payments`. That establishes existing data structures, not current paid membership or a functioning public checkout. The October 3 operator guide also says the bot migration is pending; code availability alone does not establish deployment. [`supabase/schema/sala.sql:62`](../../supabase/schema/sala.sql) · [`GHID-GRUPUL-DIN-PARC.md:11`](../../GHID-GRUPUL-DIN-PARC.md)

Public browser review covered 1440px desktop and 390px mobile, including the homepage, About page and the existing event preview. No forms were submitted. Sampled pages had no horizontal overflow. This was a visual and offer review, not a full performance or accessibility audit. An old preview’s registrations were not treated as paid customers or actual attendance.

Local market evidence

[Impuls Sport](https://impulssport.md/) advertises an eight-session monthly package at 520 MDL and unlimited access at 790 MDL; individual training is listed at 280 MDL per session. [Sporter’s free coached runs](https://sporter.md/en/events/sporter_events/16942/antrenament-pentru-om-half-marathon) demonstrates a free alternative. These are comparison points, not market averages: paid Run + Lift must justify its coaching, convenience and experience.

[Marathon corporate participation](https://marathon.md/en/Trainings) supports the existence of company participation, while [maib’s payment capabilities](https://www.maib.md/ro/solutii-de-plata/e-commerce) advertises payment links and recurring-payment capabilities. Employer coaching demand and the merchant terms suitable for your business still need confirmation.

<a id="design"></a>

## Design and functionality review

Keep the athletic visual identity. Make the offer easier to understand and buy.

Visual reference: the original HTML report contains the embedded website screenshot.

Live homepage, October 4. The displayed next-training date is already past.

1. **Fix the business’s front door.** The homepage showed “Următorul antrenament · 26 septembrie.” Both homepage and About page carried a September 19 race title. Replace expired campaign prominence with the next genuinely bookable activity and permanent club information.
2. **Make Run + Lift the master brand.** The event hero emphasizes “Hyrox Trial.” Build recognition around Run + Lift Start, Club and Challenge as possible offer names; describe the sport format underneath. Avoid a domain change until the brand proposition works.
3. **Keep lime, olive, cream and real footage.** The type and contrast are distinctive. Use that energy to foreground a concrete promise, price and primary action. On mobile, people should understand how to start before scrolling through the whole story.
4. **Trade vague proof for verifiable proof.** “A community” and “growing” add little buying confidence. Named coaches, accurate experience, participant quotes with permission and real outcome stories explain the service better. Do not invent member counts.
5. **Explain the first morning.** Show duration, meeting pin, beginner suitability, equipment, actual price, weather/cancellation arrangements and who welcomes you. “Vreau info” can become a specific first-session reservation.
6. **Measure the commercial journey.** Existing analytics preserve campaign parameters, but that is not purchase attribution. Establish booked visit → verified arrival → paid offer → renewal, including coach time and contribution per participant.

Evidence: [`src/components/landing/Hero.tsx:38`](../../src/components/landing/Hero.tsx) · [`src/components/DespreNoi.tsx:44`](../../src/components/DespreNoi.tsx) · [`src/components/DespreNoi.tsx:365`](../../src/components/DespreNoi.tsx) · [`src/content/meta.ts:25`](../../src/content/meta.ts) · [`src/lib/analytics.ts:31`](../../src/lib/analytics.ts). Conversion improvements are hypotheses until measured.

Example positioning to explore

„Alergare + forță. Începi de la nivelul tău. Crești cu noi.”

Pair it with a real date, place, package price and “Rezervă primul antrenament.” The 06:30 routine is distinctive for nearby morning exercisers; it should not be assumed suitable for everyone in Chișinău. Test other time slots only when demand and staffing support them.

<a id="axes"></a>

## Topic Axes

1. Brand, first visit, and conversion
2. Recurring coaching and retention
3. Events, company buyers, and physical products

Every axis has surviving ideas. This report examines a local brand growing from its current community; nationwide distribution is a later question once the local offer and delivery economics are repeatable.

<a id="ideas"></a>

## Ranked Ideas

Seven directions survived. Confidence is a judgment of fit for a small validation experiment—not a probability of sales or business success. Complexity includes operations as well as software. Scores weigh evidence 30%, expected value 25%, practicality 20%, brand/reuse value 15%, and low delivery burden 10%.

1. [Run + Lift Start: a six-week first-finish cohort](#idea-1)
2. [An always-open Run + Lift front door](#idea-2)
3. [Run + Lift Club: recurring coaching worth renewing](#idea-3)
4. [Run + Lift Teams: employer-funded sessions](#idea-4)
5. [An original Run + Lift benchmark season](#idea-5)
6. [One earned club product, sold by preorder](#idea-6)
7. [A partner clinic with a useful deliverable](#idea-7)

Illustrative commercial pathway, not a requirement to buy each step. People can enter at a challenge or through a company session; merchandise stays optional.

<a id="idea-1"></a>

01 · C04

### Run + Lift Start: a six-week first-finish cohort

Axis: Recurring coaching and retentionConfidence: 80%Complexity: MediumScore: 89/100

A dated beginner group: twelve coached running-and-strength sessions, a clear progression from week one, and an adapted club challenge at the end. Sell feedback, structure and belonging. Keep the public workout library useful as an introduction.

**Money mechanism · illustrative:** Test 1,490 MDL for six weeks, subject to delivery costs and buyer feedback. Twelve paid places would generate 17,880 MDL over the entire six-week block—not per month. That is 124 MDL per included session; it needs meaningful coaching value.

**Basis:** **direct:** [`src/components/Antrenament.tsx:8`](../../src/components/Antrenament.tsx) explains the beginner progression problem; [`src/content/edition.ts:108`](../../src/content/edition.ts) establishes the twice-weekly cadence. **external:** [Sporter’s free coached runs](https://sporter.md/en/events/sporter_events/16942/antrenament-pentru-om-half-marathon) and [Impuls Sport](https://impulssport.md/) show free and paid alternatives. **reasoned:** a finite coached experience is easier to evaluate than an undefined membership.

**Rationale:** This is the clearest entry product for a small brand. A finished cohort creates repeatable delivery knowledge, member stories and a natural invitation into the club.

**What the product could add:** A specific offer page with dates, coach, price, included sessions, beginner expectations and reservation/payment status. Use the existing curriculum and attendance operations; a native app is unnecessary for this experiment.

**Downsides:** Coach time, equipment and the final challenge must be costed. Outcomes must be adapted; finishing faster is not guaranteed. If the existing group is already paid, avoid charging again for the same service.

**Cheapest useful validation:** Choose one feasible cohort and seek a minimum number of paid reservations determined by its costs. Measure verified attendance, completion, staff hours and paid continuation. Interest forms and likes do not validate the price.

<a id="idea-2"></a>

02 · C02

### An always-open Run + Lift front door

Axis: Brand, first visit, and conversionConfidence: 90%Complexity: LowScore: 87/100

Let the homepage sell the club throughout the year. A visitor should immediately find a real first-session date, the starter offer and the next bookable challenge. Keep Run + Lift as the main identity; each event gets its own place underneath it.

**Money mechanism · illustrative:** This improves conversion into the paid offers; it is not a separate revenue stream. Its value is additional paid participants from existing traffic, which has not yet been measured.

**Basis:** **direct:** [`src/App.tsx:23`](../../src/App.tsx) replaces the landing page with Coming Soon; the live homepage on October 4 still named September 26 as the next training. [`src/components/DespreNoi.tsx:365`](../../src/components/DespreNoi.tsx) collects information requests, and [`src/components/landing/Hero.tsx:38`](../../src/components/landing/Hero.tsx) foregrounds Hyrox Trial.

**Rationale:** You already have a recognizable visual style. The biggest design opportunity is making the offer and next action concrete, especially between events.

**What the product could add:** Show the next real session, exact pin, duration, difficulty, named host, actual price and what is included. Suggested primary CTA: “Rezervă primul antrenament.” Put verified participant stories and coach information near it; give the club permanent share metadata.

**Downsides:** A booking promise requires an accurate schedule and someone responsible for welcoming newcomers. More pages alone will not create demand; a simpler top-level choice may outperform a large menu.

**Cheapest useful validation:** Ask five new visitors to identify when, where, with whom and for what price they can start. Then follow booked → attended → paid continuation for real visits. Preserve the brand palette and use real people in the visuals.

<a id="idea-3"></a>

03 · S02

### Run + Lift Club: recurring coaching worth renewing

Axis: Recurring coaching and retentionConfidence: 75%Complexity: MediumScore: 85/100

A clearly defined monthly package: eight coached sessions, a published calendar, bounded coach feedback and a practical return path after absence. If memberships already exist, improve their offer and renewal experience. Explore a winter venue partner only when member interest and a real quotation support it.

**Money mechanism · illustrative:** Test an eight-session package around 790 MDL/month. Sixteen paying members would generate 12,640 MDL/month before costs. That price is an experiment, not a Moldova market average; group capacity and support minutes determine whether it works.

**Basis:** **direct:** [`src/admin/sala/analiza.ts:22`](../../src/admin/sala/analiza.ts) has inactivity signals and [`supabase/schema/sala.sql:62`](../../supabase/schema/sala.sql) already contains dues and payment structures. [`GHID-GRUPUL-DIN-PARC.md:11`](../../GHID-GRUPUL-DIN-PARC.md) qualifies the bot rollout. **reasoned:** clear delivery and helpful re-entry give people reasons to renew.

**Rationale:** Recurring coaching can make revenue less dependent on the next event. Existing attendance and content tools lower the operational starting burden.

**What the product could add:** Visible package terms, session allowance, payment/renewal record, member booking and a human-led return check-in. Reconcile the legacy payment workflow before adding billing automation. Price winter sessions from actual venue and staffing costs.

**Downsides:** Telegram “yes” is not verified attendance. Renewals and member balances are not established by schema alone. Winter indoor sessions would change the current “100% outdoors” promise and need to be positioned as an explicit option. Coach feedback must have a limit.

**Cheapest useful validation:** Validate the current paid-member baseline first. Pilot a defined offer with verified check-ins; compare renewals and contribution after coaching costs. Use the calculator below to expose assumptions rather than promise monthly profit.

<a id="idea-4"></a>

04 · S03

### Run + Lift Teams: employer-funded sessions

Axis: Events, company buyers, and physical productsConfidence: 65%Complexity: MediumScore: 79/100

A company buys a bounded team experience: a beginner introduction, coached preparation or race rehearsal, and a small team challenge. One buyer, one scope, one invoice. Employees who enjoy it can choose individual continuation afterward.

**Money mechanism · illustrative:** A discussion anchor is 6,000 MDL for a pilot of two private sessions for up to fifteen people, only if the quoted costs support it. One sale is 6,000 MDL of gross revenue; repeat contracts and employee conversions are unproven.

**Basis:** **external:** [Marathon corporate participation](https://marathon.md/en/Trainings) documents company teams and invoice-based registration. **direct:** [`src/lib/adminApi.ts:31`](../../src/lib/adminApi.ts) and [`src/content/eventConfig.ts:109`](../../src/content/eventConfig.ts) support event operations. **reasoned:** handling coordination gives an employer something concrete to buy.

**Rationale:** A single purchasing decision can fund an entire group. The buyer value is a well-organized, inclusive team experience and less administration.

**What the product could add:** A concise companies page with sample agenda, participant cap, location options, what is included and an enquiry route. Start with a written quote and existing invoicing/payment process; a corporate portal can wait.

**Downsides:** Corporate race participation does not establish a coaching budget. Sales cycles, travel, suitable time slots and staff availability may dominate the economics. Employee-level fitness details should stay with the participant.

**Cheapest useful validation:** Founder conversations with three accessible team organizers can establish buyer, budget and occasion. Seek one paid pilot with fixed dates, then ask for a repeat booking. No companies were contacted for this report.

<a id="idea-5"></a>

05 · S01

### An original Run + Lift benchmark season

Axis: Events, company buyers, and physical productsConfidence: 70%Complexity: HighScore: 75/100

Turn the existing event operation into a recognizable series of small running-and-strength challenges. Use an original format, meaningful participant results and an invitation to prepare for the next edition. A pass could cover several dated editions once repeat demand is demonstrated; a relay is a later format variant.

**Money mechanism · illustrative:** A 250 MDL test entry with thirty paid places would generate 7,500 MDL per event before venue, coaches, equipment, timing, photos and fees. Capacity is not ticket demand. A season pass advances cash but also commits you to delivering all included editions.

**Basis:** **direct:** [`src/lib/adminApi.ts:38`](../../src/lib/adminApi.ts) already records event presence, bib and final time; [`src/main.tsx:41`](../../src/main.tsx) has no dedicated public results route. Capacity and repeat editions already exist. **reasoned:** an owned repeatable format can connect training, return visits and brand recognition.

**Rationale:** This gives Run + Lift a product people can name and repeat. Results and real stories also make the coaching offer easier to understand.

**What the product could add:** Edition archive, private result card, optional public sharing, next-event offer and straightforward ticket handling. Keep Run + Lift the master brand and describe any HYROX relationship accurately. Current timings alone are not a complete ranking system.

**Downsides:** Adaptive weights and changing courses make times non-comparable without recording the variant and conditions. Team booking/scoring would be new work. Event revenue can look attractive until founder and volunteer delivery time is costed.

**Cheapest useful validation:** Validate one costed paid edition and interest in returning before selling a multi-event pass. Track contribution per event, repeat purchasers and preparation-block sales; do not treat registration or Telegram intent as attendance.

<a id="idea-6"></a>

06 · C06

### One earned club product, sold by preorder

Axis: Events, company buyers, and physical productsConfidence: 60%Complexity: LowScore: 67/100

Start the physical brand with one good training shirt or patch linked to a completed cohort or season. Use your existing dark/lime identity and a distinctive Run + Lift mark. Sell an optional paid batch with a clear cutoff, sizing, delivery date and minimum order.

**Money mechanism · illustrative:** Illustrative shirt economics: 450 MDL selling price − 220 production − 40 fulfilment − 20 payment/defect allowance = 170 MDL contribution per unit before design, staff, marketing and tax. Twenty units would contribute 3,400 MDL on those assumptions. These are placeholders, not supplier quotes.

**Basis:** **direct:** [`src/index.css:5`](../../src/index.css) provides an established identity and existing events create a shared purchase occasion. **external:** [Marathon’s optional participant shirt](https://sporter.md/ro/events/run/16538/chisinau-marathon-2026) supports the optional add-on pattern. **reasoned:** participation can give a small brand’s garment meaning before broad recognition exists.

**Rationale:** A recognizable item makes the community visible in the city and tests product demand using paid orders. The best first customer already has a reason to identify with the club.

**What the product could add:** One product preorder with real photos/sample, size guide, pickup/delivery choice and explicit fulfilment terms. Connect it to event or cohort follow-up; keep results available without buying merchandise.

**Downsides:** Sizes, quality, returns and handling can consume the margin. A paid minimum batch must cover fixed setup costs as well as unit costs. A merchandise purchase is not evidence of demand for a full clothing line.

**Cheapest useful validation:** Get a physical sample and delivered-cost quote. Test one batch with existing participants. Expand only when orders and contribution justify it; avoid spending the training budget on speculative inventory.

<a id="idea-7"></a>

07 · C14

### A partner clinic with a useful deliverable

Axis: Events, company buyers, and physical productsConfidence: 45%Complexity: MediumScore: 59/100

Offer a relevant retailer or service partner a small coached demonstration: participants try an appropriate product during a useful session, with optional disclosed feedback. Sell defined work and access to a real occasion, with a tightly limited partner presence.

**Money mechanism · illustrative:** Quote coach time, preparation, equipment, reporting and margin. A cash fee is revenue; donated water or equipment is cost saving, not cash sales. No credible small-club sponsor price or accessible partner budget was established.

**Basis:** **external:** [Sporter’s partner announcements](https://sporter.md/ro/news/sportermd) shows differentiated local sponsor roles. **direct:** the project serves a small outdoor group. **reasoned:** a hands-on session can be useful with modest reach, unlike a promise of mass logo exposure.

**Rationale:** This can add revenue or reduce delivery costs without needing a huge audience. It also gives a partner a concrete reason to work with Run + Lift.

**What the product could add:** A one-page partner offer explaining the session, actual audience, inclusions, agreed deliverables and enquiry route. Audience claims must use verified counts; a public logo grid is secondary.

**Downsides:** Larger-event sponsors do not prove access for your club. An irrelevant promotion can erode trust, and an in-kind deal can add work while providing little usable value.

**Cheapest useful validation:** Test one relevant partner’s willingness to fund a specific session covering incremental costs. Count cash contribution separately from in-kind savings. Defer if delivery distracts from coaching or relies only on promised exposure.

<a id="economics"></a>

## Revenue and capacity calculator

Change the assumptions to test the recurring club. All starting values are illustrative. This is a contribution model, not a forecast or net-profit estimate; it excludes tax, equipment investment and any costs you have not included. Founder coaching time has a cost even when no salary is paid.

Static export of the illustrative calculator. These defaults are assumptions, not actual business figures. Use the HTML version for interactive calculations. Revenue = members × price. Included costs = sessions × coach cost + venue + other costs + payment fees. Contribution = revenue − included costs; taxes and omitted costs still need consideration.

| Illustrative calculator input | Default value |
| --- | --- |
| Paying members | 16 |
| Monthly price · MDL | 790 |
| Sessions included / member | 8 |
| Group sessions delivered / month | 8 |
| Coach-approved people / session | 16 |
| Coaching cost / session · MDL | 500 |
| Monthly venue cost · MDL | 1000 |
| Other monthly operating costs · MDL | 1500 |
| Blended payment fee · % | 3 |

Modeled monthGross revenue

<a id="revenue"></a>

12,640 MDLContribution before excluded costs

<a id="contribution"></a>

5,761 MDL

<a id="costs"></a>

Included costs: 6,879 MDL

<a id="breakeven"></a>

Break-even for included costs: 9 members

<a id="seatcount"></a>

128 promised visits / 128 available places

<a id="capacity-note"></a>

No spare capacity at full usage. Do not add trial places without more capacity.

Aggregate space is only a ceiling: preferred dates, coach availability, equipment and actual session caps still matter. A marketing target must fit what the team can deliver.

Revenue figures are not additive promises

A six-week cohort is a one-off block; membership is monthly; event and company pilots are per delivery. The same coach, session and participant may appear in several offers. Do not add all examples together as a forecast or count one payment twice. An in-kind sponsor reduces costs; it does not increase cash revenue.

At the default assumptions, gross revenue is 12,640 MDL. Coaching is 4,000, venue 1,000, other operating costs 1,500 and payment fees 379.20 MDL, leaving 5,760.80 MDL before excluded costs. The model reaches its full allowance capacity, so trials need separately available places.

<a id="choice"></a>

## The decision worth making first

Choose one paid beginner cohort and define its continuation into the club. Make that offer visible between events.

The decisive missing facts are your current paying-member count and prices, verified repeat attendance, coach capacity and hours, actual venue costs, and what participants already ask to buy. Those facts can change the ranking—especially if recurring membership is already working well.

A strong next discussion would define the buyer, six-week outcome, coach responsibilities, feasible dates and minimum paid cohort size. Merchandise and sponsorship remain bounded experiments. Wider geographic expansion becomes more credible after another coach can reproduce the local experience with acceptable contribution.

<a id="rejected"></a>

## Rejection Summary

Thirty-six raw candidates from six perspectives became sixteen distinct candidates after merging repeated concepts. Three combinations were added. Nineteen candidates were critiqued; seven survived and twelve were merged or deferred below. All three topic axes are represented.

The independent basis check found thirteen sound and six weak candidates, none factually refuted. The remote feedback subscription failed the relevance threshold. Merchandise and partner clinics remain in the shortlist as explicitly low-confidence tests; their weak demand evidence is not upgraded into a sales claim. The two-frame generation pass shared one verification budget, so ideas did not receive identical independent scrutiny.

| ID | Considered direction | Why it was cut or combined |
| --- | --- | --- |
| C01 | Hosted first morning / guest seat | Fold into the permanent front door and starter cohort. Valuable acquisition mechanism, too overlapping to become a separate product. |
| C03 | Standalone paid restart block | Fold re-entry support into membership first; charging a lapsed member separately may weaken the value of their original package. |
| C05 | Company captain package | Combined into the employer-funded entry offer, which connects the paid team experience to optional individual continuation. |
| C07 | Membership with return support | Combined with a conditional winter continuity option; the base membership remains the main product. |
| C08 | Personal benchmark as a standalone brand feature | Combined into the paid benchmark season; a result page alone has a less direct revenue path. |
| C09 | Remote feedback subscription | Defer. No remote audience or feedback workload is established. Learn the paid coaching service locally before scaling it online. |
| C10 | Waitlist-to-cohort conversion | Defer until real excess demand exists. Capacity settings and historical registrations do not establish a waiting audience. |
| C11 | Winter venue presales as a separate offer | Retain as a membership variant only after a real venue quote and member demand. Indoor training also changes the current outdoor-only promise. |
| C12 | Monthly technique clinic | Keep as a later coaching upsell. It competes for scarce coach attention and overlaps the starter/club feedback offer. |
| C13 | Team relay as a separate immediate product | Keep as a later benchmark format. Team registration, scoring and transitions add burden before the core paid event is validated. |
| C15 | Neighborhood host distribution | Promising later acquisition test, but no host access or sales attribution exists yet. Validate a direct first-visit offer before another channel. |
| C16 | Travelling regional Run + Lift format | Keep for geographic expansion after repeatable local contribution. Travel, staffing and partner acquisition could erase margins today. |

## All 36 raw ideas and how they were resolved

| Origin | Idea | Disposition / reason |
| --- | --- | --- |
| Pain 1 | Hosted first 06:30 | C01 → incorporated into #2 / #1 |
| Pain 2 | Evergreen next chapter | C02 → #2 |
| Pain 3 | Paid restart lane | C03 → cut as a separate product |
| Pain 4 | First combined-race finish | C04 → #1 |
| Pain 5 | Company first finish | C05 → combined into #4 |
| Pain 6 | Finish proof and keepsake | C06 → #6; result experience belongs with #5 |
| Inversion 1 | First finish before membership | C04 → merged with #1 |
| Inversion 2 | Homepage without an event | C02 → merged with #2 |
| Inversion 3 | Membership return route | C07 → combined into #3 |
| Inversion 4 | Finite progression block | C04 → merged with #1 |
| Inversion 5 | Employer-funded morning | C05 → combined into #4 |
| Inversion 6 | Achievement merchandise | C06 → merged with #6 |
| Leverage 1 | Own personal benchmark | C08 → combined into #5 |
| Leverage 2 | Member guest seat | C01 → incorporated into #2 |
| Leverage 3 | Curriculum plus feedback | C04 → merged with #1 |
| Leverage 4 | Return-to-training path | C07 → combined into #3 |
| Leverage 5 | Company captain kit | C05 → combined into #4 |
| Leverage 6 | Earned identity preorder | C06 → merged with #6 |
| Analogy 1 | First visit as fitting | C01 → incorporated into #2 / #1 |
| Analogy 2 | Club as permanent box office | C02 → merged with #2 |
| Analogy 3 | Beginner apprenticeship | C04 → merged with #1 |
| Analogy 4 | Customer-success membership | C07 → combined into #3 |
| Analogy 5 | Company dress rehearsal | C05 → variant of #4 |
| Analogy 6 | Season jersey/yearbook | C06 → merged with #6 |
| Reframe AR1 | Trusted neighborhood doorway | C15 → deferred: channel unproven |
| Reframe AR2 | Second-result storytelling | C08 → combined into #5 |
| Reframe AR3 | Right to restart | C07 → combined into #3 |
| Reframe AR4 | Remote coaching decision | C09 → deferred: buyer/problem unproven |
| Reframe AR5 | Company captain service | C05 → combined into #4 |
| Reframe AR6 | Travelling host format | C16 → deferred: delivery economics unproven |
| Constraint CF1 | 06:30 as the promise | C01 → incorporated into #2 |
| Constraint CF2 | Waitlist next chapter | C10 → deferred: no verified overflow |
| Constraint CF3 | Winter commitments buy room | C11 → conditional variant of #3 |
| Constraint CF4 | Capped monthly clinic | C12 → deferred: overlaps coaching offers |
| Constraint CF5 | Small tactical team relay | C13 → later variant of #5 |
| Constraint CF6 | Useful partner product trial | C14 → #7 |

<a id="sources"></a>

## Sources and limits

Local source references point to this repository. Public market pages were searched and opened on October 4, 2026. Published offers are evidence of alternatives and precedent, not confirmed availability, sales, market size or Run + Lift willingness to pay.

- [Impuls Sport](https://impulssport.md/) — advertised gym and coaching packages; one competitor, not a market average.
- [Sporter’s free coached runs](https://sporter.md/en/events/sporter_events/16942/antrenament-pentru-om-half-marathon) — free coached running alternative. The page’s preparation/date wording is historical and was not treated as an upcoming session.
- [Marathon corporate participation](https://marathon.md/en/Trainings) — company teams and invoice workflow. Its mixed event-year/date labels were not used to claim a current race date or discount.
- [Feteasca Run ticket page](https://iticket.md/en/event/feteasca-run-2026) — advertised 550 MDL experience race with 150 places; no sales or profitability claim.
- [Marathon’s optional participant shirt](https://sporter.md/ro/events/run/16538/chisinau-marathon-2026) — optional merchandise precedent; no margin inferred.
- [Sporter’s partner announcements](https://sporter.md/ro/news/sportermd) — examples of water, medal and equipment-brand partnerships around larger events; no small-club sponsorship valuation.
- [maib’s payment capabilities](https://www.maib.md/ro/solutii-de-plata/e-commerce) — payment links and recurring-payment capabilities; exact merchant eligibility and terms require confirmation.
- [Run + Lift public site](https://parktraining.fit/) and [About page](https://parktraining.fit/despre-noi) — direct browser observations and the embedded screenshot.

No revenue records, private member data or coach/venue quotations were accessed. Existing payments, audience size, contribution and actual deployment status remain unverified. The analysis produced this document; it did not modify the public application, publish offers, collect payments or contact prospects.

Composed 2026-10-04T09:43+03:00 by ce-ideate from the user’s request to analyze Run + Lift and grow a sports brand and product in Moldova.
Updated 2026-10-04 (Europe/Chisinau) with ce-ideate from the user’s product, website, attendance, equipment and budget context. This is an ideation refinement, not a published offer or implementation.
