# Camp load check (Phase 7)

The spec asks for a load check at 700 attendees. `tests/load/camp-load.test.ts` runs a whole 700-person camp end to end and checks every total exactly. Run it on its own (it uses the fake Paystack's port):

```sh
CAMP_LOAD=1 npx vitest run tests/load
```

It skips itself in the normal `npm test`.

## What it does

| Step | Work | Checked |
| --- | --- | --- |
| Setup | One camp, two room types, 195 rooms (710 beds) | |
| Register | 700 registrations, 50 at a time | 700 distinct registrations |
| Pay | 1,050 payments through the fake Paystack: half the people pay in two instalments. Every webhook is signed; 1 in 5 is sent twice at once. | All 700 Fully Paid; total paid equals total expected exactly; exactly 1,050 successful payments (no duplicates credited) |
| Groups | 80 groups of four: all 240 joins fired at once; then 20 people race for one group's last place | Exactly one racer gets the place; that group has exactly 4 |
| Rooms | Every group and every remaining person assigned, 20 at a time per pool | All 700 placed; no room over its beds |
| Reports | Dashboard, full people table, full CSV, a filtered table | Dashboard shows 700 Fully Paid, 700 placed, nothing outstanding; CSV has 701 lines |

## Results, 24 Oct 2026 (local Worker and D1 on a MacBook)

| Step | Time |
| --- | --- |
| Setup: camp, 2 room types, 195 rooms | 0.9 s |
| Register 700 (50 in parallel) | 2.4 s |
| 1,050 payments and webhooks (25 people in parallel) | 5.2 s |
| 80 groups: create, then 240 joins in parallel | 1.4 s |
| 20 people race for one last group place | 0.2 s |
| Assign all 700 | 1.8 s |
| Dashboard | 15 ms |
| People table, everyone | 9 ms |
| People CSV, everyone | 11 ms |
| People table, filtered | 7 ms |

All six steps passed.

## What this does and doesn't show

- **Shows:** the logic and SQL hold at camp size. Totals reconcile exactly under parallel load, nothing is double-credited, the last-place and no-overfill guarantees hold, and the reporting queries are fast at 700 rows.
- **Doesn't show:** Cloudflare's production latency. Each request from the website to the Worker adds a network round trip (tens of milliseconds) that the local run doesn't have. At 700 attendees spread over weeks, that isn't a concern; a registration or payment is a handful of requests.
- **Limits that matter at this size:** D1 allows 100 bound parameters per statement (bulk statements here pass rows as JSON), and the Worker's reconciliation job settles at most 50 pending payments per 10-minute run (about 7,000 a day).
