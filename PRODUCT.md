# Product

<!-- impeccable:product-schema 1 -->

Scope: **Commune**, the camp app inside this site (`/camps/*` for attendees, `/admin/camp/*` for staff). Other parts of the site (soul winning, songs, bookings) aren't covered here.

## Platform

web

## Users

- **Attendees:** members of The Airport City Church registering for a church camp of about 700 people. They are mostly on **phones**, arriving from a link shared in WhatsApp or by text, often on the go and on mobile data. Their jobs are to sign up, pay in full or in instalments, form a roommate group with friends, and later see their room.
- **Coordinators:** two people who run the camp from laptops: rooms, assignment, money, people.
- **Leaders:** fellowship and PFCC leaders who check, read-only, who in their group has registered and paid.

## Product Purpose

Replace a spreadsheet-and-WhatsApp camp process with one place where attendees register, pay through Paystack (mobile money or card), choose roommates, and see their room; and where coordinators see every number and assign rooms. Success means people pay on time without chasing, and every cedi reconciles exactly with Paystack.

## Operating Context

- Ghana: amounts in GHS (cedis), phones in 0XX XXX XXXX format, mobile money is the main way to pay.
- Attendees sign in with an 8-character code sent by SMS, never a password. Group codes like `7K4-F2Q` are shared between friends.
- The attendee journey is a sequence of steps: register → pay (one or more instalments) → Fully Paid → roommates (optional, before the deadline) → room assigned by a coordinator.
- Paystack's own checkout page handles the actual payment; the site sends people there and back.

## Capabilities and Constraints

- Statuses: Registered, Partially paid, Fully paid, Cancelled. Group states: Open, Locked, Final.
- Rooms and groups are single-gender and tied to one room type.
- A Paystack fee is added on top of each payment and shown before paying.
- Built in Next.js 16 with Tailwind v4 and lucide-react icons, with no component library.

## Brand Commitments

- Name: **The Airport City Church** (TACC). Logo at `public/logo.png`: a black interlocking-loops wordmark with a teal chevron and "THE AIRPORT CITY CHURCH" beneath it.
- Product name: **Commune**, TACC's camp app (named 24 Oct 2026). It is shown as "commune" with its own minimal mark, and is "by The Airport City Church" where the church needs naming.
- Voice: warm, plain and direct. Short sentences; no church jargon in UI copy.

## Evidence on Hand

- The TACC logo (`public/logo.png`).
- No camp photography yet: leave labelled placeholders, never stock images.
- No testimonials, attendee counts or claims to show.

## Product Principles

1. **One next step at a time.** Every screen makes the attendee's next action obvious.
2. **Money is never ambiguous.** Price, paid, balance and fee are always visible and exact.
3. **Phones first.** Thumb-reachable, readable on a small screen and a slow connection.
4. **Nothing to remember.** Codes, balances and rooms are shown where they're needed.

## Accessibility & Inclusion

Readable on low-end Android phones in bright light: strong contrast (WCAG AA), touch targets of at least 44px, and real form labels. Some attendees are older church members.
