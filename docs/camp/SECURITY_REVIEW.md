# Camp security review (Phase 7, 24 Oct 2026)

A review of the new camp system against the spec's "Permissions and security" section, plus the usual web risks. Scope: `src/lib/camp/`, `src/app/camps/`, `src/app/admin/camp/`, `src/components/camp/`, the Worker's camp endpoints (`workers/soulwinning/src/camp.ts`, `admin.ts`) and migrations 0004–0008.

**Result:** no high-severity findings. Three small issues were fixed in this phase. Four items are accepted as they are, with reasons. Three need you.

## Checked and holding

| Area | How it's enforced | Evidence |
| --- | --- | --- |
| Every server action checks its caller | Each of the 15 admin actions calls `requireCampRole` itself (staff changes need `admin`). Each attendee action resolves the signed-in attendee from the session cookie and acts only on that registration. | Checked action by action; role tests in `roles.test.ts` |
| Every admin page and export | `pageStaff` / `requireCampRole` on each page and both CSV routes. The only page without a check is the public `/camps` list. | Checked file by file; browser checks in Phases 4–5 |
| Leader scoping in the query | `scopeFor` turns the leader's own staff record into a `WHERE` clause. Filters can only narrow it. Leader rows don't select phone, email, amounts, group codes or room labels. | `reports.db.test.ts` "leaders" |
| Worker admin API | Bearer `ADMIN_SECRET`, compared in constant time; only the Next server knows it. | `admin.ts` |
| Paystack webhook | HMAC-SHA512 of the raw body (before parsing), constant-time compare, 256 KB cap. It never trusts the event: it calls Paystack's verify endpoint and credits only an exact GHS amount. | `payments.db.test.ts` "webhook" |
| Idempotency and money rules | Guarded single-statement updates, plus database triggers: no overpayment (net of refunds), a success is final, refunds can't exceed what was paid, refunds can't be edited. | Payment, edge-case and load tests |
| Concurrency | Group joins and room assignments are one guarded statement each, backed by triggers. | Last-place and no-overfill tests, and the load check |
| Attendee sign-in | 8-character code from a 32-symbol alphabet (about 10^12), stored only as an HMAC with `CAMP_SECRET`. Sign-in is limited to 10 tries per IP per 15 minutes. "Forgot code" is limited per IP and per phone and always answers the same way. | `registrations.db.test.ts` |
| Session cookie | httpOnly, `Secure` in production, SameSite=Lax, path `/camps`, signed with `CAMP_SECRET` over the code's hash, so a new code signs out old sessions. 30 days. | `session.ts` |
| Group codes | 6 characters (about 10^9). Joining is limited to 10 tries per attendee and 20 per IP per 15 minutes. | `groups.db.test.ts` "rate-limited" |
| Cross-site requests | Server actions are POST-only, and Next rejects ones whose Origin doesn't match the host. CSV exports are GET but need an admin session, and the cookie is SameSite. | Next 16 server-action docs |
| SQL injection | Every value is a bound parameter. The few SQL fragments built in code use fixed column names from allow-lists (`filterSql`, `scopeSql`, `setLocked`). | Code review |
| XSS and CSV injection | React escapes all output; no `dangerouslySetInnerHTML` in camp code. CSV cells starting with `= + - @` are prefixed with `'`. | `reports.db.test.ts` "CSV" |
| Personal data in the audit log | Registration entries leave out phone and email. | `registrations.db.test.ts` |
| Secrets | Paystack key only in the Worker (`wrangler secret`, `.dev.vars` gitignored). No keys in tracked files. `CAMP_SECRET` only on the server. | `git grep` for `sk_` keys |

## Fixed in this phase

1. **Links in texts and Paystack's return address used the request's Host header.** On Vercel that header can only be one of the project's own domains, so the risk was small: a "forgot code" text could carry a preview-deployment link. Now an optional `CAMP_PUBLIC_URL` pins the address (`src/lib/camp/origin.ts`). **You need to set it in Vercel** (see below).
2. **The shared SMS helper wrote full phone numbers to the server logs.** It now logs only the last three digits, or a recipient count.
3. **Old rate-limit rows were never deleted.** The Worker's 10-minute job now removes ones older than a day.

## Accepted, with reasons

1. **Registering with a phone that's already registered says so.** That tells someone the number is registered for this camp. It's limited to 10 attempts per IP per hour, and the message is what a real attendee needs to see.
2. **Group owners can search Fully Paid people of their room type and gender by name.** This was decided in Phase 3: name and fellowship only, never contact details.
3. **A small race when changing someone's room type.** If two coordinators change the same person's room type at the same instant, the slower one's group removal can still run even though its main update is refused. The person ends up out of their group, which is also the intended end state, and the slower coordinator sees an error. Not worth a more complex fix.
4. **No site-wide security headers (Content-Security-Policy and so on).** This is the whole site's configuration, not the camp feature's. Worth doing separately.

## Needs you

1. **Set `CAMP_PUBLIC_URL`** in Vercel → Settings → Environment Variables → Production, to the site's address (for example `https://theairportcitychurch.com`, with no trailing slash), then redeploy.
2. **Roll the Paystack test secret key** before the pilot. It was pasted into a chat on 23 Oct. After rolling, set the new one with `npx wrangler secret put PAYSTACK_SECRET_KEY` in `workers/soulwinning`.
3. **Run `docs/camp/archive/lock-old-camp-tables.sql`** in the Supabase SQL editor (Phase 6).

## Good to know

- **Rotating `CAMP_SECRET` invalidates every attendee's sign-in code and session.** Codes are stored as HMACs keyed with it. If it ever has to change, attendees use "Forgot your code?" to get a new one by SMS.
- **The coordinator alert** on a flagged payment goes to the Worker's `ALERT_PHONE` secret, which is set.
