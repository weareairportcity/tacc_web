# Camp pilot runbook (Phase 7)

The spec's last acceptance criterion: "Pilot registrations and payments reconcile exactly." This is the order to do it in. Every step uses the real site; only the Paystack key changes between the test and live pilots.

**Reconciles exactly** means the camp's **Check against Paystack** page (dashboard → Money → "Check against Paystack") shows the green "Reconciles exactly" with no rows to look at.

## 0. Before either pilot

- [ ] Phase 7 is deployed (migration 0008, Worker, site).
- [ ] `CAMP_PUBLIC_URL` is set in Vercel Production and the site redeployed (see SECURITY_REVIEW.md).
- [ ] The Paystack test key has been rolled, and the new one set: `cd workers/soulwinning && npx wrangler secret put PAYSTACK_SECRET_KEY`.
- [ ] Paystack dashboard, **test** mode → Settings → API Keys & Webhooks: webhook URL is `https://soulwinning-api.jak-anyen.workers.dev/v1/camp/paystack/webhook`.
- [ ] Paystack → Settings → Preferences: "pass charges to customers" is **off**. The app adds the fee itself.
- [ ] Coordinators and leaders are added under Camp admin → Staff, and each can sign in.

## 1. Test-mode pilot (no real money)

1. In Camp admin, create **"Pilot (test)"** with registration open today, one room type (for example GHS 600, 4 beds), and a few rooms of each gender. Set the status to Open.
2. Send the link (`/camps/pilot-test`) to 5–10 volunteers. Ask them to:
   - register (they get a sign-in code by text)
   - pay in two parts, using the test mobile money number Paystack shows on its checkout page
   - sign out and back in with the code
   - once fully paid, start or join a roommate group; one person locks theirs.
3. As a coordinator:
   - watch the dashboard
   - on Assign rooms, place every group and person
   - press **Text everyone their room** (this sends real texts to the volunteers)
   - cancel one registration, refund it in the Paystack dashboard (test mode), then **Record refund** on their page
   - move one person to another room type.
4. Ask a leader to open their read-only list and export it.
5. **Check against Paystack** must show "Reconciles exactly". If anything is listed, fix it before going live: each row says what's wrong.
6. Set the pilot camp's status to **Archived**. It disappears from `/camps`; its data stays.

## 2. Switch to live

You do this part, because it uses your live key.

1. Paystack dashboard → switch to **Live** mode → Settings → API Keys & Webhooks:
   - copy the **live secret key**
   - set the live webhook URL to the same address as above.
2. `cd workers/soulwinning && npx wrangler secret put PAYSTACK_SECRET_KEY`, and paste the live key.
3. The archived test pilot now won't reconcile, because its payments were made in test mode. That's expected, so don't use its check page again.

To undo: put the test key back the same way.

## 3. Live pilot (small, real money)

1. Create **"Pilot (live)"** with one room type at **GHS 1.00**, and a couple of rooms.
2. Three to five staff register and pay with real mobile money or cards. The fee is about 2 pesewas on GHS 1.
3. Check that the money arrived in the Paystack dashboard (live), that the payment page shows "Payment received", and that the dashboard totals are right.
4. Refund one person in Paystack, then **Record refund** in the app.
5. **Check against Paystack** must show "Reconciles exactly". That's the acceptance criterion.
6. Archive the live pilot camp.

## 4. Open the real camp

1. Create the camp with its real dates, room types, prices, rooms (CSV import), payment due date and roommate deadline. Set it to Open.
2. Share `/camps` or the camp's own link.
3. During registration, check **Check against Paystack** weekly, and **Payments to look at** on People whenever the alert phone gets a text.

## If something goes wrong

| Symptom | Where to look |
| --- | --- |
| Paid but still showing "Checking your payment" | The Worker's 10-minute job settles it. Check against Paystack lists it until then. |
| "Payments to look at" on People | Amount mismatch: refund in Paystack. Paid after the balance was covered: refund the extra in Paystack. Record each refund in the app. |
| Attendee lost their code | "Forgot your code?" on the camp page texts a new one. |
| Payments failing to start | The Worker's `PAYSTACK_SECRET_KEY` (test or live, matching the dashboard mode), and Paystack's status page. |
