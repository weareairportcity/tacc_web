import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/camp/LegalPage";
import { LEGAL, legalContact } from "@/lib/camp/legal";

export const metadata: Metadata = { title: "Terms · Commune" };

/** The terms of registering for a camp through Commune. A draft for the church to have checked. */
export default function TermsPage() {
  return (
    <LegalPage title="Terms" lead={`What you agree to when you register for a ${LEGAL.church} camp on Commune.`}>
      <section>
        <h2>Registering</h2>
        <ul>
          <li>Register yourself with your own details. Someone else can pay for you with your pay link.</li>
          <li>If you&rsquo;re under 18, a parent or guardian must agree to you coming, and you give their name and phone when you register.</li>
          <li>Your place is held once you&rsquo;ve registered. Places in each kind of room are limited.</li>
        </ul>
      </section>

      <section>
        <h2>Your sign-in code</h2>
        <p>
          Your code is how you sign in, so keep it to yourself. If you lose it, ask for a new one on the sign-in page; the old one then stops working.
        </p>
      </section>

      <section>
        <h2>Paying</h2>
        <ul>
          <li>Payments go through Paystack. Paystack&rsquo;s fee is added to what you pay, and shown before you pay.</li>
          <li>You can pay all at once or in parts, by the payment date your camp shows.</li>
        </ul>
      </section>

      <section>
        <h2>Cancelling and refunds</h2>
        <ul>
          <li>You can cancel your registration from your camp page. That frees your place.</li>
          <li>If you&rsquo;ve paid, cancelling asks the coordinators for a refund. Each refund is looked at on its own, and Paystack&rsquo;s fee can&rsquo;t be refunded.</li>
          <li>Changing to a cheaper room works the same way for the difference.</li>
        </ul>
      </section>

      <section>
        <h2>Rooms</h2>
        <p>
          You choose the kind of room; coordinators place people in rooms, keeping roommate groups together where they can. Coordinators may need to move people.
        </p>
      </section>

      <section>
        <h2>Texts</h2>
        <p>We text you about your camp: your code, payments, your room and reminders. We don&rsquo;t send advertising.</p>
      </section>

      <section>
        <h2>At camp</h2>
        <p>Follow the coordinators&rsquo; and leaders&rsquo; directions and the camp&rsquo;s rules, which they will share with you.</p>
      </section>

      <section>
        <h2>Changes and questions</h2>
        <p>
          The church may change a camp&rsquo;s details; we&rsquo;ll tell registered people by text. Questions: {legalContact()}. How we look after your information
          is on the <Link href="/camps/privacy" className="underline decoration-stone-muted underline-offset-[3px]">Privacy</Link> page.
        </p>
      </section>
    </LegalPage>
  );
}
