# Camp Registration & Room Allocation: Phase 0 Discovery

23 Oct 2026. Companion to `docs/camp-spec.md`. No application code was changed in this phase.

## Urgent, outside the phase plan

Two findings expose attendee personal data today. The spec says not to touch the old feature until Phase 6, so neither has been fixed. Both need a decision now.

1. **Real attendee data is committed to a public repo.** `TACC MYC '26 ROOM SHEETS - HOSTEL 4 IN A ROOM (GHC600).csv` (about 170 rows of full name, phone, fellowship, gender) is tracked in `weareairportcity/tacc_web`, which is **public** on GitHub. Deleting the file does not remove it from history. A history rewrite (`git filter-repo`) plus a force-push would, but copies may already exist.
2. **The old camp server actions have no authorization.** `src/app/camp/actions.ts` is `"use server"` and every export uses the Supabase service-role client with no session or role check. Exported server actions can be called by direct POST (see `node_modules/next/dist/docs/01-app/02-guides/data-security.md`), so anyone can call `getAdminAttendees` (returns phone numbers), `deleteAttendeeAction`, `clearCampAttendeesAndRoomsAction` and the rest. The `/portal-admin-26` login is client-side only, and `isSuperAdmin` is hard-coded `true`. The file also seeds in-memory data with real-looking names and phone numbers.

Suggested interim fix (small, reversible): add a `requireSongsAdmin()`-style check at the top of each old action, or take `/camp/admin/*` and `/portal-admin-26/*` offline until Phase 6.

**Status, 23 Oct:**

1. The CSV is untracked and `*.csv` is gitignored, but it remains in git history until that is rewritten.
2. Every old admin action now calls `requireCampAdmin()` (signed-in Supabase user). The four public search actions stay open and no longer return `admin_token`.

The plaintext `phone_number` column on Supabase `attendees` is still unchecked, because the live project isn't reachable from this session.

## Decisions (23 Oct 2026)

| # | Question | Decision |
| --- | --- | --- |
| 1 | Attendee sign-in | Reusable login code like soul winning's, no password. The code must be long enough and rate-limited, since it is the only credential. |
| 2 | Paystack email | Add an email field to registration and require it. No placeholder emails. |
| 3 | Church field | Fixed list, currently just "TACC". Kept as a list so branches can be added later. |
| 4 | Staff roles | D1 `camp_staff` keyed by Supabase login email. Supabase handles authentication only. |
| 5 | Reversible migrations | Paired down file per migration in `migrations-tacc/down/`. |
| 6 | Tests | Vitest, run against a local D1. |
| 7 | Urgent items | Fix now. Done and pushed in `e90fc3d`. The git history keeps the CSV by choice: no rewrite. |
| 8 | Paystack fees | Passed on to the attendee. The app adds the fee itself (per-camp rate, default 1.95%); Paystack's "pass charges to customers" stays off. |
| 9 | Minimum first payment | None. Any instalment from GHS 1 up to the balance. The old column stays unused. |
| 10 | Underpayment at the due date | Stays Partially Paid, flagged "Past due"; a coordinator decides. |
| 11 | Attendee URL | `/camps/<slug>` (default, not yet confirmed). |
| 12 | Roommate lock deadline | No default number of days. Each camp's required "Roommate deadline" date, set by the coordinator; groups become final after the end of that day (Ghana time). |
| 13 | Owner lock | The owner can lock and unlock their group until the deadline. |
| 14 | Group codes | 6 characters from the sign-in code alphabet, shown as `7K4-F2Q`. Joining is rate-limited. |
| 15 | Invite name search | Shows name and fellowship only, and only people who could join (same camp, room type and gender, Fully Paid, in no group). |

## Stack

| Item | Finding |
| --- | --- |
| Framework | Next.js 16.2.4 (App Router, `src/app`), React 19.2.4, TypeScript 5 strict. Routing middleware is `src/proxy.ts` (Next 16 "proxy", not `middleware.ts`). |
| Package manager | npm (`package-lock.json`). Node 22.14 locally. |
| Styling | Tailwind CSS v4 (`@tailwindcss/postcss`), `lucide-react` icons, `clsx` + `tailwind-merge` (`src/lib/utils.ts`). No component library or shadcn. |
| Hosting | Vercel Hobby (project `tacc-web`). |
| Data | Cloudflare Worker `soulwinning-api` (`workers/soulwinning`), with D1 databases `soulwinning` (binding `DB`) and `tacc` (binding `APP_DB`), and R2 buckets. Supabase still holds bookings, voting, the old camp tables and admin login (see the Cloudflare migration memory). |
| Other libraries | `jspdf` + `jspdf-autotable` (PDF export), `jszip`, `date-fns(-tz)`, `axios`, `resend` (email), mNotify (SMS, `src/lib/mnotify.ts`). |
| Commands | `npm run dev`, `npm run build`, `npm run lint` (`eslint`), `npx tsc --noEmit`. Worker: `npm run dev` / `deploy` in `workers/soulwinning`. |
| Baseline | `tsc` passes. `eslint src` reports 115 errors and 76 warnings. 68 of the errors are in the old camp code (`src/app/camp`, `src/app/portal-admin-26`), the rest are spread across other areas. New code should add no lint errors. |

## Conventions

- **Feature layout:** pages under `src/app/<feature>`, data and logic modules under `src/lib/<feature>` (`src/lib/soulwinning/*`, `src/lib/songs-db.ts`, `src/lib/services-db.ts`), mutations as server actions in an `actions.ts` next to the admin page.
- **Data access on Cloudflare:** server-only `src/lib/cf.ts` exposes `query(db, sql, params)` and `batch(db, statements)`. They POST raw SQL to the Worker's `/v1/admin/query` and `/v1/admin/batch` with `SW_API_ADMIN_SECRET`. The Next server writes the SQL; the Worker only executes it. `batch` is atomic: D1 runs a batch as one transaction.
- **SQL style:** hand-written SQL, no ORM. IDs are `TEXT` UUIDs from `crypto.randomUUID()`. Timestamps are ISO `TEXT` defaulting to `strftime('%Y-%m-%dT%H:%M:%fZ','now')`. Booleans are `INTEGER` 0/1, mapped in a `toX(row)` helper. Tables are prefixed by feature (`sotw_*`).
- **Validation:** inline checks in each server action (regexes such as `ID = /^[0-9a-f-]{36}$/i`, required-field checks that throw `Error` with a user-facing message). No zod.
- **Caching:** public reads go through `query(..., { revalidate, tags })`, and admin writes call `revalidateTag` and `revalidatePath`. The project goal is to keep Vercel function use low.
- **Comments:** short doc comments at the top of a module explaining why, sparse inline comments.
- **Worker style:** a router in `src/index.ts`, handlers per area, `HttpError` and `json()` from `util.ts`, `timingSafeEqual` for secrets, a scheduled handler for crons.

## Auth and roles

| Area | How it works today |
| --- | --- |
| `/admin/*` (bookings, songs) | Supabase Auth email and password. `src/proxy.ts` refreshes the session and redirects signed-out users to `/admin/login`. The login page reads `admin_roles.role` (`bookings`, `songs`, `both`, `soulwinning`) **in the browser** only to pick where to redirect. |
| Server-side checks | `requireSongsAdmin()` in `src/lib/code-session.ts` checks only that a Supabase user is signed in, not their role. |
| Code-protected areas | `codeSession()` and `src/lib/soulwinning/admin-auth.ts`: one shared code in an env var plus an HMAC-signed httpOnly cookie (`SW_COOKIE_SECRET`). Used for soul winning and Grace in Continuity. |
| Member identity | Soul winning has no accounts. A member gets a random 4-character login code (`src/lib/soulwinning/login-code.ts`) to reopen their profile on another phone. |
| Old camp | No working authorization (see Urgent). |

No mechanism exists for attendee accounts, per-user roles enforced on the server, or leader scoping. All of these are new work.

## Database

- **Target:** D1 database `tacc` (binding `APP_DB`, `db: "app"` in `cf.ts`), following the project's rule that new data features go on Cloudflare.
- **Migrations:** plain SQL files in `workers/soulwinning/migrations-tacc/` (`0001_sotw.sql` … `0003_service_sections.sql`), applied with `wrangler d1 migrations apply tacc [--local|--remote]`. The worker's `package.json` scripts cover only the `soulwinning` database. Migrations are **forward-only**: no down files exist, and D1 has no rollback mechanism.
- **Reference data:** fellowships and PFCCs are a hard-coded canonical list in `src/lib/soulwinning/fellowships.ts` (28 fellowships across PFCC 1, PFCC 2 and Children's Church). There is no table for fellowships, PFCCs or churches anywhere.
- **Concurrency in D1:** D1 (SQLite) has no `SELECT … FOR UPDATE` and no interactive transactions across round trips. It does serialize all writes, every statement is atomic, and a batch commits as one transaction. Triggers with `RAISE(ABORT, …)` are supported.

## Payments

- No payment code of any kind exists (no Paystack, Hubtel or MoMo).
- **Secrets:** Next.js reads `process.env` (Vercel env vars, `.env.local`). The Worker uses `wrangler secret put` plus `.dev.vars` locally, and both are gitignored.
- `.env.example` is stale: it lacks the `SW_*`, `GRACE_*` and Google Drive variables already in use.
- **Background jobs:**
  - The Worker runs an hourly cron (`0 * * * *`) for SMS and usage alerts.
  - Vercel has `/api/cron/reminder`, protected by `CRON_SECRET`. No `vercel.json` exists, so its schedule is set in the Vercel dashboard. Vercel Hobby crons run at most once a day.
- **Network:** the Worker's custom domains sit behind zone bot protection, which already 403s Vercel IPs. Paystack's webhook calls would likely be blocked the same way, so the webhook must use the `workers.dev` URL or get a WAF skip rule.

## Tests

- Playwright only (`e2e/`, `playwright.config.ts`). The existing specs produce screenshots and tutorial videos for soul winning; none assert behaviour.
- No unit or integration test runner exists, and no tests exist for any data logic.
- The spec requires concurrency and idempotency tests, so a test setup has to be added (see question 6).

## Old camp feature inventory

All of it is self-contained: nothing outside these paths imports it. Matches for "camp" elsewhere are soul winning "campaign".

| Kind | Items |
| --- | --- |
| Public pages | `src/app/camp/page.tsx` (default camp search), `src/app/camp/[slug]/page.tsx`, `src/app/camp/CampSearchPortal.tsx`, `src/app/camp/layout.tsx` |
| Token admin | `src/app/camp/admin/create/page.tsx`, `src/app/camp/admin/[token]/page.tsx` |
| Portal admin | `src/app/portal-admin-26/` with `layout.tsx`, `AdminShell.tsx` (client-side Supabase login, camp switcher) and pages `page.tsx`, `people`, `groups`, `groups/assign`, `rooms`, `fellowships`, `fellowships/[name]`, `camps`, `settings` |
| Server actions | `src/app/camp/actions.ts` (978 lines, about 35 actions): search, camps, attendees, CSV import, rooms, key bearer, groups, coordinators, SMS, logo upload |
| Data (Supabase) | Tables `camps`, `camp_admins`, `attendees` (phone encrypted with pgcrypto), `rooms`, `groups`. Storage bucket `camp-logos`. RPCs `add_attendee_encrypted`, `get_attendees_decrypted`. Schema in `camp_schema.sql`. RLS lets anyone read every attendee row. |
| Local fallback | In-memory seed data and a file store at `.data/camp_store.json`, written from server actions. It doesn't persist on Vercel. |
| Docs and data files | `CAMP_GUIDE.md`, `camp_schema.sql`, the committed room-sheet CSV |
| Size | About 5,700 lines across 18 files. Recent git history is a run of `fix(camp)` patches for the fallbacks. |

Worth keeping from it, as ideas rather than code:

- The room-sheet CSV columns (NO., NAME, CONTACT, FELLOWSHIP, GENDER, DAY OF ARRIVAL, PFCC, ROOM NUMBER) and the "pairings" blocks.
- The key-holder concept, which the spec doesn't mention (see question 10).
- Room-assignment SMS through mNotify.

## Mapping plan

### Reuse

- `src/lib/cf.ts` `query` and `batch` for all reads and writes from Next.
- The `/admin` Supabase session in `src/proxy.ts` for coordinators, leaders and admins.
- `FELLOWSHIPS` and `PFCC_GROUPS`, moved from `src/lib/soulwinning/fellowships.ts` to a shared `src/lib/fellowships.ts` so camp and soul winning share one list.
- `src/lib/mnotify.ts` for SMS (sender ID `TACCBooking`, or a new approved ID).
- `jspdf` if a PDF export is wanted. CSV export is plain string building.
- The Worker's router, `HttpError`, `timingSafeEqual` and scheduled handler.

### New: data (D1 `tacc`, migration `0004_camp.sql`)

| Spec entity | Table | Notes |
| --- | --- | --- |
| Camp | `camps` | No clash: the old `camps` table is in Supabase. Status `draft`, `open`, `closed` or `archived`. `min_first_payment_pct` INTEGER. Dates as ISO TEXT. |
| RoomType | `camp_room_types` | `price_pesewas` INTEGER, `capacity` INTEGER. Unique (`camp_id`, `name`). |
| Room | `camp_rooms` | `label`, `gender` (`male` or `female`), `capacity`. Unique (`camp_id`, `label`). |
| (account) | `camp_attendees` | Needed only if attendees get their own login (question 1). Phone is the identity. |
| Registration | `camp_registrations` | Price snapshot. `payment_status` cached. `amount_paid_pesewas` cached for the dashboard. Unique (`camp_id`, `attendee_id`). |
| Payment | `camp_payments` | `provider`, unique `reference`, status `pending`, `success` or `failed`, `raw_payload` TEXT. Indexes on reference and registration. |
| RoommateGroup | `camp_groups` | Unique `code`. `room_type_id`, `gender`, `owner_registration_id`, `locked_at`. |
| GroupMember | `camp_group_members` | `camp_id` copied onto the row so one group per attendee per camp is a unique constraint. `joined_at` drives ownership handover. |
| GroupInvite | `camp_group_invites` | Status `pending`, `accepted`, `declined` or `cancelled`. |
| RoomAssignment | `camp_assignments` | Unique `registration_id`. Index on `room_id`. |
| AuditLog | `camp_audit_log` | Append-only. A trigger blocks UPDATE and DELETE. |
| Leader scope, roles | `camp_staff` | Keyed by Supabase user email. Role `coordinator`, `leader` or `admin`. `scope_kind` and `scope_value` for leaders. |

**Concurrency without row locks:**

- The spec's "lock the group row" and "lock the room row" become guarded writes that D1 serializes. Example: `INSERT INTO camp_group_members … SELECT … WHERE (SELECT count(*) FROM camp_group_members WHERE group_id = ?) < capacity AND group not locked`, after which the code checks `meta.changes`.
- A `BEFORE INSERT` trigger on both tables re-checks capacity, gender and room type, and aborts on a breach. The rule then holds even for SQL sent from elsewhere.
- Payment success, the balance update and the status change go in one `batch`.

The webhook's idempotency guard is `UPDATE camp_payments SET status = 'success' … WHERE reference = ? AND status = 'pending'`. Only the first webhook for a reference changes a row.

### New: Worker (`workers/soulwinning/src/camp.ts`)

- `POST /v1/camp/paystack/webhook`: raw body, HMAC-SHA512 via `crypto.subtle`, then Paystack verify, then a D1 batch. It's public and reached through `workers.dev`.
- `POST /v1/admin/camp/pay-init` (behind `ADMIN_SECRET`): called by a Next server action after it checks the attendee owns the registration. It creates the pending payment, calls Paystack initialize and returns the checkout URL.
- A new reconciliation cron, `*/10 * * * *`, verifies `pending` payments older than 10 minutes. Workers Free allows 5 cron triggers and one is in use.
- Secrets, set with `wrangler secret put`:
  - `PAYSTACK_SECRET_KEY` holds the test key now and the live key at go-live. Wrangler environments could keep both as separate secrets if wanted.
- `.env.example` adds `PAYSTACK_PUBLIC_KEY` only if the inline popup is used.

The Paystack secret lives only in the Worker, which keeps it in one place and avoids a Vercel function for each webhook.

### New: Next.js

| Area | Location |
| --- | --- |
| Domain logic and SQL | `src/lib/camp/` (`db.ts`, `auth.ts`, `money.ts`, `groups.ts`, `assign.ts`, `csv.ts`, `audit.ts`), mirroring `src/lib/soulwinning/` |
| Attendee pages | `src/app/camps/[slug]/` with register, pay, processing, group and room screens. The old `/camp` stays live until Phase 6, then redirects. |
| Attendee actions | `src/app/camps/[slug]/actions.ts`. Each action re-checks the attendee session and ownership. |
| Coordinator area | `src/app/admin/camp/`: camps list, camp settings, room types, rooms with CSV import, assignment board, unmatched pool, dashboard, people table, activity. It sits inside the existing `/admin` proxy gate. |
| Leader view | `src/app/admin/camp/leader/`. Every query applies `WHERE fellowship = ?` or `WHERE pfcc = ?` from `camp_staff`, never from the request. |
| Auth helpers | `requireCampRole(role)` in `src/lib/camp/auth.ts` reads the Supabase user server-side, then looks up `camp_staff`. It's called at the top of every action and page. |
| Login routing | Add a "Camp" destination to `/admin/login` for camp roles. |

## Conflicts and questions

These need your answer before or during Phase 1, numbered for easy reference.

1. **How do attendees sign in?** The spec says each attendee has an "account", but nothing like that exists. Options:
   - **(a) Phone number + SMS one-time code through mNotify, with a signed cookie.** This is my recommendation: no Supabase dependency, and phone is already the identity everywhere. Cost is about one SMS per sign-in.
   - (b) Supabase Auth email and password, like the admins. This adds attendee load to Supabase, which you are moving off.
   - (c) A registration code like soul winning's, with no password. Cheapest, but weak: anyone who sees the code can act as that person.
2. **Paystack needs an email for every transaction.** The registration form in the spec has no email field. Should email be required, optional with a placeholder like `<phone>@camp.theairportcitychurch.com`, or skipped?
3. **What is the "church" field?** Branch names (a fixed list) or free text? Fellowship and PFCC have a canonical list, church has none.
4. **Where do staff roles live?** I propose a D1 `camp_staff` table keyed by the Supabase login email, so only authentication stays on Supabase. The alternative is widening the Supabase `admin_roles` CHECK constraint, which keeps data on Supabase. Today `requireSongsAdmin()` lets any signed-in Supabase user into songs. Should "admin" here mean a new explicit role?
5. **Migrations must be reversible, but D1 has no down migrations.** I propose writing a paired `migrations-tacc/down/0004_camp.down.sql` for each migration, tested locally, with only additive changes to existing tables. OK?
6. **Test runner:** there is none, and the spec requires tests. I propose adding **Vitest**, with domain tests running against a local D1 through `@cloudflare/vitest-pool-workers` or Wrangler's local mode. Concurrency tests fire parallel joins and assignments at the same local database. That's two new dev dependencies. The alternative is Node's built-in `node:test`, which has less tooling for Workers. Which do you prefer?
7. **Paystack fees:** the spec calls passing fees on "a setting on the transaction". In Paystack it is an account-level dashboard setting ("pass charges to customers"), or the app adds the fee to the amount itself. If fees are passed on, the ledger has to separate fee from principal so balances still reach exactly zero.
8. **Mobile money and partial instalments:** a MoMo charge can stay pending for a while. The processing screen and reconciliation handle this, but expect "pending" to be common, not rare. No decision needed, just a heads-up.
9. **URL for the new attendee app:** `/camps/<slug>` (proposed), a subdomain like `camp.theairportcitychurch.com` (the proxy already does host rewrites for soul winning), or taking over `/camp` in Phase 6?
10. **Key holder and day of arrival:** the old feature tracks a key holder per room and a day of arrival per person, but the spec has neither. Drop them or keep them?
11. **Old Supabase camp data:** what should "archive" mean in Phase 6? I suggest a one-time export of the Supabase tables to a private R2 object or a local file, not into the repo. The Supabase project's current status also needs confirming before that export.
12. **The two urgent items above:** do you want them fixed now, ahead of Phase 6?
13. **Existing spec open questions** still stand: roommate lock deadline, under-18s, fee bearer, the 30% minimum, and underpayment policy. The fee question and the minimum are needed before Phase 2, the deadline before Phase 3.

## Proposed order of work

Same phases as the spec, with the platform choices above folded in.

| Phase | Work |
| --- | --- |
| 1. Foundation | Migration `0004_camp.sql` and its down file. `camp_staff` and `requireCampRole`. Shared fellowships module. Camp and room-type CRUD, rooms CRUD and CSV import (validate, then save in one batch). Audit-log helper. Test runner and the first tests (permission refusal, capacity-below-occupancy block). |
| 2. Registration and payments | Attendee sign-in (per question 1), registration form, Worker Paystack endpoints and webhook, reconciliation cron, status derivation. Tests: instalments reach Fully Paid, a duplicate webhook is a no-op, overpayment is rejected, an amount mismatch fails. |
| 3. Roommate groups | Codes, join, invites, leave, owner handover, lock, deadline auto-lock in the Worker cron. Concurrency test for the last slot. |
| 4. Assignment | Group and individual assignment with guarded writes and a trigger, removal, room deletion. Concurrency test for overfill. |
| 5. Dashboard and leader views | Aggregate queries, people table, CSV export, scoped leader views. Test that a leader can't widen scope. |
| 6. Retire old feature | Export the Supabase data, add redirects from `/camp` and `/portal-admin-26`, delete the old code and root files. |
| 7. Hardening and pilot | Edge-case tests, security review, 700-user load check against local and staging D1, test-mode pilot, then live. |
