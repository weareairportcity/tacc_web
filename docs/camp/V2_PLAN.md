# Commune v2: plan

26 Oct 2026. Built on branch `camp/commune`. Decisions are in the table at the end.

## Steps

1. **Canvas first.** Add a "Commune v2" section to the Commune canvas (https://claude.ai/artifact/1mgbWMBESpB7VEjp5YadVU). It covers:
   - the separate Commune coordinator app: its own sign-in, shell, phone bottom bar, side panels and undo toasts
   - the dashboard with coloured bars
   - People, with saved views, bulk select and bulk pay
   - Rooms, with an all-rooms view, a side panel for editing a room and a new way to set places left
   - Assign, with drag and drop
   - Check-in scanner, Refunds, Requests and Activity log
   - attendee screens: the regrouped register form, My registration (QR, countdown, pay link, cancel), Profile, roommates by link with a random-room option, refund and room-change requests, and the refund policy

   Skills, Laws of UX and design rules go in sticky notes on the canvas.
2. **Migration 0011** (reversible), adding:
   - profile fields: emergency contact, health notes, T-shirt size
   - check-in, a random-room preference and deleted (anonymised) registrations
   - refund requests, room-change requests, bulk payments, saved views, and a phone number for staff
3. **Libraries and Worker:**
   - profile and check-in
   - refund requests, plus refunds sent through the Paystack refund API
   - room-change requests, with price differences settled through payment or a refund request
   - bulk coordinator payments, with one Paystack checkout covering many registrations
   - signed pay links for paying on someone else's behalf
   - group join links
   - an evening SMS summary from the hourly cron
   - cancel or delete your own registration
   - saved views and the activity log query
4. **Attendee side:**
   - the Register button moves to the top corner
   - the form is regrouped (gender under About you, T-shirt size) and the copy is fixed
   - a duplicate phone number goes to sign-in
   - My registration gets a QR code, a countdown and a share-a-pay-link button
   - a Profile page where people can edit their details
   - joining a group by link instead of typing a code, plus an "I want a random room" option
   - refund and room-change requests, cancel and delete, and the refund policy page
   - "Pay in parts" is removed and "owing" becomes "outstanding"
5. **Commune coordinator app:**
   - its own Commune sign-in, with no church-portal links
   - one shared side panel (Sheet) for every edit
   - a toast with Undo after every assign or remove
   - a confirmation after every change, so nothing succeeds silently
   - the phone bottom bar (Dashboard, People, Check-in)
6. **Coordinator pages:**
   - the dashboard gets coloured bars
   - People gets saved views, bulk select and Pay for selected
   - the person detail opens in a side panel
   - Rooms gets an all-rooms-and-people view, room editing in the side panel, and places left as inline steppers on each room-type card, opened in a side panel
   - Assign gets drag and drop, keeps the dropdown, and adds undo
   - new pages: Check-in (QR scan and live count), Refunds, Requests, Activity log, Pay for people (bulk), and leader fellowship progress
7. **Installable app (PWA):** a manifest and the Commune icon. The service worker loads from the network first, so a refresh shows updates whenever there's signal; My registration is cached for when the signal is weak.
8. **Quality:**
   - a copy pass on every screen
   - an automated accessibility check (axe) on every screen, with fixes (focus order on the register form)
   - tests for the new rules, then lint, typecheck and the full test suite
9. **Commit** to `camp/commune`. No remote migrations, deploy or push to main until asked.

## Decisions (26 Oct 2026)

| Topic | Decision |
| --- | --- |
| Refund policy | Case by case: a coordinator reviews every request. Paystack's fee isn't refunded. |
| Sending refunds | Paystack refund API, after a confirm step |
| Downgrade with an overpayment | Approving the move opens a refund request for the difference |
| Upgrade | Approving raises the price, and the attendee pays the difference |
| Buses | Not tracked |
| Daily summary | SMS via mNotify, around 7 pm, to coordinators who have a phone number saved |
| Bulk pay fee | Paystack's fee is added to the total |
| Cancel or delete when paid | Cancelling frees the place and opens a refund request. Deleting removes personal details and keeps payment records. |
| Camp cover photo | Already built as the camp banner (migration 0010); kept |
| Forgot code | Already built; kept and made easier to find |
| Colours on charts | The dashboard gets a small chart palette for status. It's the one exception to "stone + one cyan", at the user's request. |

## Revision after review (26 Oct)

The coordinator app is redesigned, not restyled, for web and phone (canvas section "Commune v2", version 56).

- **Pages:** Today, People, Rooms (tabs: Assign · All rooms · Room types), Check-in, Requests, Money, History, Settings.
  - Desktop: a slim rail on the left plus a top bar with a camp switcher and "Find a person".
  - Phones: a bottom bar with Today, People, Check-in, Rooms and More.
- **No duplicates:**
  - Activity lives only in History, and Paystack checks only in Money.
  - Fellowship counts are the counts in People's filters.
  - Bed numbers live in Rooms.
  - The leader view is People, scoped to their group, with a progress card on top.
- **People filters:**
  - Results update as you pick a filter.
  - Picking a fellowship also picks its PFCC.
  - The last filters you used are remembered, and you can save filters as a view.
  - Sort starts with the latest payment first; A–Z and most outstanding are the other options.
- **Phones:** filters open in a bottom sheet. On Assign you tap a card and then a room (no dragging).
- **Pass:** "Save as image", rendered as a server PNG.
- **T-shirt sizes:** S, M, L, XL, 2XL, 3XL, 4XL.
- **Copy:** less text everywhere. Helper sentences stay only for money, privacy, or a step that can't be undone.
- **Phone number:** attendees can't edit their own phone (a coordinator changes it), because it's their sign-in.
