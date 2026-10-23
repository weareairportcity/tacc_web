# Camp Registration & Room Allocation: Spec

Oct 23, 2026 · @Kweku-Abeiku Attah Anyen

## Overview

This spec replaces the obsolete camp feature with a system that handles registration, Paystack payments, roommate groups and room allocation for camps of about 700 attendees.

An attendee registers, picks a room type, and pays in full or in instalments. Once fully paid, they form or join a roommate group. They are not given a room at that point: a camp coordinator assigns rooms later, to groups and individuals. Coordinators also create camps, load the venue's room list, and watch everything on a dashboard.

**Roles**

| Role | Who | Access |
| --- | --- | --- |
| Attendee | Church members | Own registration, payments, roommate group, room assignment |
| Coordinator | Two people | Full camp management, rooms, assignment, dashboard, exports |
| Leader | Fellowship and PFCC leaders | Read-only, own fellowship or PFCC members only |
| Admin | System owner | Everything, plus user and role management |

**Out of scope**

- Getting the room list from the venue managers. Coordinators enter it by hand or upload it as CSV.
- Executing refunds. They happen in the Paystack dashboard and are recorded in the app.
- The old camp feature's logic. It is retired in the last build phase, not extended.

## Locked rules and decisions

These are settled and the build must enforce them in code, not only in the UI.

| Area | Decision |
| --- | --- |
| Gender | Required at registration. Rooms and roommate groups are single-gender. Assignment across genders is blocked. |
| Group size | A group cannot exceed the capacity of the room type its members picked. All members share the same camp and room type. |
| Smaller groups | Allowed. The coordinator fills spare beds from the unmatched pool, same gender and room type. |
| Roommate access | Opens only when the attendee is Fully Paid. |
| Scale | About 700 attendees per camp. No special infrastructure needed. |
| Leader scope | Read-only, own fellowship or PFCC only, enforced on the server. |
| Payment provider | Paystack, test mode first. The ledger stays provider-agnostic. |
| Money | Stored as integer pesewas (GHS × 100), never floats. |
| Refunds, room-type changes | Manual by a coordinator, with an audit entry. |

**Defaults, configurable per camp**

- Minimum first payment: 30% of the room price.
- Full payment due by a per-camp date.
- Roommate lock deadline: a per-camp date.

**Still open**

- [ ] Roommate lock deadline: how many days before camp?
- [ ] Under-18s: any minors, or special handling?
- [ ] Paystack fees: absorbed by the church or passed to the attendee?
- [ ] Is 30% the right minimum first payment?

## Attendee flow

An attendee moves through five steps, and the app gates each step on the status of the one before.

1. **Register** with full name, phone, gender, fellowship, PFCC and church, then pick a room type. The camp, room type and price are recorded on the registration.
2. **Pay** in full or in instalments. Each instalment is at least the camp minimum (except a final smaller balance) and at most the remaining balance. The attendee sees balance and payment history.
3. **Become Fully Paid.** Status moves Registered, then Partially Paid, then Fully Paid, driven only by verified Paystack payments.
4. **Choose roommates.** Fully Paid unlocks creating or joining a roommate group (see Roommate groups).
5. **Wait for a room.** The attendee sees "Awaiting room assignment" until a coordinator assigns one, then sees the room.

**Status values**

| Status | Meaning | Moves to |
| --- | --- | --- |
| Registered | Account and registration exist, nothing paid | Partially Paid, Cancelled |
| Partially Paid | Some payment verified, balance remains | Fully Paid, Cancelled |
| Fully Paid | Balance is zero, roommate selection open | Cancelled |
| Cancelled | Set by a coordinator, with an audit entry | none |

Roommate status (Unmatched, In group, Locked) and room status (Unassigned, Assigned) are tracked separately from payment status.

## Roommate groups

Roommates are chosen through groups with an invite code, not by swapping individual reference numbers. One code per group is simpler and the capacity limit is easy to enforce.

**Creating and joining**

- A Fully Paid attendee creates a group. It gets a short unique code such as `CAMP-7K4F`, and the creator is the owner.
- Others join with the code, or the owner invites them by name search. A search request must be accepted by the invitee.
- Only Fully Paid attendees of the same camp, same room type and same gender are eligible, and the group cannot exceed the room type's capacity.
- Joining runs in a database transaction that locks the group row, so two people cannot take the last slot at once.

**Changing and locking**

- Members can leave until the group is locked. The owner can remove a member and can lock the group.
- Every group auto-locks at the camp's roommate deadline.
- If the owner leaves, ownership passes to the longest-standing member. An empty group is deleted.

**Unmatched pool**

Fully Paid attendees without a group stay Unmatched. The coordinator sees them filtered by gender and room type and pairs them manually, including topping up smaller groups.

**Rules summary**

| Rule | Enforced where |
| --- | --- |
| Same camp, room type and gender | Join and invite handlers, plus a database check |
| Size at most room type capacity | Join handler inside the transaction |
| One group per attendee per camp | Unique constraint |
| No changes after lock | Every group mutation |

## Coordinator flow

Coordinators run the camp from creation to room allocation. Every change below writes an audit log entry.

**Camp setup**

- Create and edit a camp: name, dates, venue, registration open and close, payment due date, roommate lock deadline, minimum first payment percentage.
- Define room types, each with a name, price in pesewas and capacity (for example 2-bed, 4-bed).
- Archive or close a camp. Registration closes automatically at the close date.

**Rooms**

- Add rooms one by one or import the venue's list from CSV (columns: room name or number, room type, gender, capacity). The import validates first and shows errors before saving anything.
- Edit a room's capacity, type or gender. Reducing capacity below current occupancy is blocked until people are removed.
- Delete a room. Occupants return to Unassigned and the action is logged.

**Assignment**

- Assign a whole roommate group to a room in one action, or assign individuals one at a time.
- Validation: same gender as the room, same room type, enough free beds, person Fully Paid, person not already assigned.
- Partial fills produce a warning, not an error, so the coordinator can top up from the unmatched pool.
- Remove a person from a room at any time. Removing a group member does not break the roommate group.

**Concurrency**

Two coordinators will work at once. Assignment runs in a transaction that locks the room row and rechecks capacity, so a room can never be overfilled.

## Dashboard and leader views

The coordinator dashboard answers three questions: who has registered and paid, how much money is in, and who still needs a room.

| Panel | Content |
| --- | --- |
| Registration | Registered, Partially Paid, Fully Paid, Cancelled counts |
| Money | Collected vs expected, in GHS, with outstanding balance |
| Room supply and demand | Per room type: attendees vs beds available, by gender |
| Allocation | Assigned, Unassigned, Unmatched counts; groups locked vs open |
| Breakdowns | Counts by fellowship, PFCC and church |
| People table | Search, filter by status, fellowship, PFCC, church, gender, room type, then export to CSV |
| Activity | Recent audit log entries: assignments, removals, payment changes |

**Leader view**

- Read-only and scoped to the leader's own fellowship or PFCC. Each leader account links to exactly one.
- Shows name, payment status, roommate status and whether a room is assigned. It shows no payment amounts, no payment controls and no other group's people.
- Scoping is applied in the server query, so editing a URL or request cannot widen it. A leader's CSV export is scoped the same way.

## Data model

This is a conceptual model. Names and types must be adapted to the existing project's database, ORM and naming conventions after codebase discovery.

| Entity | Key fields | Constraints and notes |
| --- | --- | --- |
| Camp | name, dates, venue, registration open/close, payment due, roommate deadline, min first payment %, status | One row per camp |
| RoomType | camp, name, price (pesewas), capacity | Unique name per camp |
| Room | camp, room type, label, gender, capacity | Unique label per camp. Capacity must be at least current occupancy. |
| Registration | camp, user, name, phone, gender, fellowship, PFCC, church, room type, price snapshot, payment status | One per user per camp. Price copied at registration time. |
| Payment | registration, amount (pesewas), provider, reference, status, paid at, raw provider payload | Unique reference. Status: pending, success, failed. |
| RoommateGroup | camp, room type, gender, code, owner, locked | Unique code. Size at most room type capacity. |
| GroupMember | group, registration | Unique registration per camp, so one group at a time |
| GroupInvite | group, invitee registration, status | Used for name-search requests |
| RoomAssignment | room, registration, assigned by, assigned at | Unique registration. Count per room at most capacity. |
| AuditLog | actor, action, entity, before, after, time | Append only |
| Leader scope | user, fellowship or PFCC | Links a leader account to one scope |

**Derived values, not stored**

- Amount paid is the sum of successful payments. Balance is price minus amount paid.
- Payment status is derived from balance, then cached on the registration and updated inside the same transaction as the payment.

**Indexes**

- Registration by camp and payment status, by camp and fellowship, and by camp and PFCC.
- Payment by reference and by registration.
- RoomAssignment by room.

## Paystack integration

Paystack supports cards and mobile money in Ghana. Instalments need no special Paystack feature: each instalment is its own transaction against the same registration. The webhook is the source of truth, never the browser redirect.

**Flow**

1. The attendee chooses an amount, at least the minimum and at most the remaining balance.
2. The server creates a `pending` Payment with a unique reference, then calls Paystack's initialize endpoint.
3. The attendee pays on Paystack's page or popup.
4. The browser returns to a "processing" screen. It never marks anything paid.
5. Paystack calls the webhook. The handler verifies the signature (HMAC-SHA512 of the raw body with the secret key, compared with the `x-paystack-signature` header).
6. The handler calls Paystack's verify endpoint and marks the payment `success` only if amount and currency match.
7. In the same transaction it recomputes the balance and updates the registration status.

**Rules**

| Rule | Detail |
| --- | --- |
| Idempotency | Unique reference. A repeated webhook for a payment already `success` does nothing. Paystack retries. |
| Amounts | Integer pesewas. Compare exactly. |
| Overpayment | Reject any amount above the remaining balance. |
| Reconciliation | A scheduled job verifies `pending` payments older than a few minutes, to catch missed webhooks. |
| Secrets | Secret key server-side only. Test and live keys are separate environment variables. |
| Raw body | Signature check uses the raw request body, before any JSON parsing. |
| Provider-agnostic | Payment table has a `provider` column so another provider can be added later. |
| Test mode | Build and test fully against Paystack test keys before going live. |

**Open decision**

Who pays Paystack's transaction fees: the church or the attendee? Passing them on is a setting on the transaction. Decide before go-live.

## Permissions and security

Authorization is enforced on the server for every read and write. The UI hides controls for convenience, but it is never the control.

| Capability | Attendee | Leader | Coordinator | Admin |
| --- | --- | --- | --- | --- |
| View own registration, payments, group, room | Yes | No | Yes | Yes |
| Register, pay, create or join group | Yes | No | No | Yes |
| View registrations | Own only | Own fellowship or PFCC, read-only | All | All |
| Create and edit camps, room types, rooms | No | No | Yes | Yes |
| Assign and remove room occupants | No | No | Yes | Yes |
| Cancel registration, record manual refund | No | No | Yes | Yes |
| Export CSV | No | Scoped | Yes | Yes |
| Manage users and roles | No | No | No | Yes |

**Security requirements**

- Webhook endpoint verifies the Paystack signature and rejects anything else. It is the only unauthenticated write route.
- Attendees can only act on their own registration. Check ownership on every request, not just login.
- Leader queries always include the scope filter in the database query.
- Invite codes are random, not sequential, and are rate-limited on the join endpoint.
- Phone numbers and payment records are personal data. Exports and logs must not leak them to leaders or other attendees.
- Every coordinator action that changes registrations, payments, groups or assignments writes an audit entry with actor, before and after.

**Transactional guarantees**

- Payment success, balance update and status change commit together.
- Group join locks the group row and rechecks capacity.
- Room assignment locks the room row and rechecks capacity, gender and type.

## Edge cases and open questions

The build should handle each case below deliberately. Where the right behaviour is not yet decided, build the safe default and flag it.

| Case | Default behaviour |
| --- | --- |
| Duplicate or retried Paystack webhook | Ignored if the payment is already `success` |
| Webhook never arrives | Reconciliation job verifies and fixes the payment |
| Payment amount or currency mismatch | Payment marked failed, coordinator alerted |
| Underpaid at the due date | Stays Partially Paid, is flagged on the dashboard, no roommate access. Coordinator decides. |
| Room type change after payment | Manual by a coordinator, with an audit entry |
| Refund or cancellation | Done in Paystack, then recorded in the app. Registration set to Cancelled, person removed from room and group. |
| Group member cancels or is removed | Group shrinks. If locked, the coordinator is warned. |
| Group larger than any available room of its type | Dashboard warns that supply is short for that type and gender |
| Room deleted with occupants | Occupants return to Unassigned, logged |
| Capacity reduced below occupancy | Blocked until people are removed |
| Paid attendee with no group at the deadline | Stays in the unmatched pool for manual pairing |
| Two coordinators assign the same person | Second attempt fails on the unique assignment constraint |
| Attendee registers twice | Blocked by one registration per user per camp |

**Open questions**

- [ ] Roommate lock deadline: how many days before camp?
- [ ] Under-18s: any minors, or need for separate handling?
- [ ] Paystack fees: absorbed or passed on?
- [ ] Minimum first payment: is 30% right?
- [ ] Underpayment at the due date: what is the church's policy?

## Phased build plan

The build runs in eight phases. Each phase ends with its acceptance criteria met and a stop for review before the next begins.

| Phase | Scope | Acceptance criteria |
| --- | --- | --- |
| 0. Discovery | Read the existing codebase and the obsolete camp feature. Write a findings report and a mapping plan. No code changes. | Report covers stack, conventions, auth and roles, database and migrations, payments, tests, and the old camp feature's footprint. |
| 1. Foundation | Camps, room types, rooms, roles and permissions, CSV room import, audit log base | Coordinator can create a camp, define room types, add rooms singly and by CSV, and edit or delete them. Non-coordinators are refused. |
| 2. Registration and payments | Registration form, payment ledger, Paystack initialize, webhook, verify, reconciliation job, status transitions | Test-mode instalments move status to Fully Paid. Duplicate webhooks change nothing. Overpayment is rejected. |
| 3. Roommate groups | Create, join by code, name-search invites, lock, leave, deadline auto-lock | Eligibility rules hold. Two people cannot take the last slot concurrently (tested). |
| 4. Assignment | Assign groups and individuals, validation, removal, room deletion, audit entries | Gender, type and capacity rules enforced. Concurrent assignment cannot overfill a room (tested). |
| 5. Dashboard and leader views | Coordinator dashboard, filters, CSV export, scoped leader read-only views | Numbers match the database. A leader cannot see another group's people by any request. |
| 6. Retire old camp feature | Archive old data, redirect old routes, remove dead code | Old camp routes and code are gone, old data is archived, nothing else breaks. |
| 7. Hardening and pilot | Edge-case tests, security review, load check at 700 users, pilot with a small group on Paystack test then live | All edge cases in this spec pass. Pilot registrations and payments reconcile exactly. |

## Claude Code prompt

To use it: export this doc as Markdown and save it in the project as `docs/camp-spec.md`, open Claude Code in the project root, and paste the kickoff prompt. It makes the agent study the existing codebase and stop for your review before writing any code. Then send the phase prompt below it, one phase at a time.

**Kickoff prompt (Phase 0)**

```text
You are joining an existing web project. We are replacing its obsolete camp feature with a new camp registration, payment, roommate-matching and room-allocation system.

The full spec is in docs/camp-spec.md. Read all of it first. It is the source of truth for rules, flows, data model and phases.

PHASE 0 - DISCOVERY ONLY. Do not write or change any application code in this phase.

1. Explore the codebase thoroughly before forming any plan. Find and report:
   - Stack: language, framework, package manager, runtime versions, how to run, build, lint and test.
   - Project structure and the conventions in use (folder layout, naming, error handling, validation, API style, state management, styling and UI component library).
   - Authentication and authorization: how users, sessions and roles work today, and where role checks live.
   - Database: engine, ORM or query layer, migration tool and how migrations are run, existing schema relevant to users, churches, fellowships and PFCCs.
   - Payments: any existing payment or Paystack code, webhook handling, and how secrets and environment variables are managed.
   - Background jobs or schedulers, if any.
   - Tests: framework, coverage, how tests are written and run.
   - The existing obsolete camp feature: every route, page, component, API handler, model, table, job and test that belongs to it, plus anything else that depends on it.
2. Compare what you found with docs/camp-spec.md and produce a mapping plan: which existing pieces to reuse, which new tables, modules, routes and pages are needed, and where each belongs in the existing structure. Adapt the spec's conceptual data model to the project's real naming and ORM conventions.
3. List anything in the spec that conflicts with the codebase, is ambiguous, or needs a decision from me. Do not guess. Ask.
4. Write everything to docs/camp/DISCOVERY.md with sections: Stack, Conventions, Auth and roles, Database, Payments, Old camp feature inventory, Mapping plan, Conflicts and questions, Proposed order of work.

Rules for the whole project:
- Follow the existing conventions and reuse existing libraries, components and patterns. Do not introduce a new framework or library unless there is no reasonable alternative, and explain why before adding it.
- Work one phase at a time. At the end of each phase, summarize what changed, how you verified it, and what remains, then STOP and wait for my go-ahead.
- Do not touch or delete the old camp feature until Phase 6.
- Migrations must be reversible and must not drop existing data. Never run migrations against production.
- Paystack: test keys only, read from environment variables. Never hard-code or commit secrets. Update the example env file with new variable names.
- Authorization is enforced on the server for every route. Leader scoping is applied in the database query.
- Money is stored as integer pesewas.
- Write tests alongside each phase, including the concurrency and idempotency cases named in the spec.
- If the spec and the codebase disagree, or something is unclear, ask me before proceeding.

When Phase 0 is done, stop and show me the discovery report.
```

**Phase prompt (reuse for Phases 1 to 7)**

```text
Phase 0 is approved. Proceed with Phase N from docs/camp-spec.md: <phase name>.

Before coding: re-read the Phase N scope and acceptance criteria in the spec, re-read docs/camp/DISCOVERY.md, and give me a short implementation plan (files to create or change, migrations, routes, tests). Wait for my approval of the plan.

Then implement it, following the project conventions and the rules from the kickoff prompt. Run the linter, type checks and the full test suite. When done, report: what was built, how each acceptance criterion was verified, any deviations from the spec, and open questions. Then stop.
```

**Tips for running it**

- Work on a new git branch per phase and review each diff before merging.
- Resolve the open questions in this spec before Phase 2 (payments) and Phase 3 (roommate deadline).
- If a session gets long, start a fresh one and point it at `docs/camp-spec.md` and `docs/camp/DISCOVERY.md` so it reloads the context.
