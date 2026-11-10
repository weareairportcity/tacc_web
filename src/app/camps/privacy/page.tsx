import type { Metadata } from "next";
import Link from "next/link";
import { CountToggle } from "@/components/camp/CountToggle";
import { LegalPage } from "@/components/camp/LegalPage";
import { LEGAL, legalContact } from "@/lib/camp/legal";

export const metadata: Metadata = { title: "Privacy · Commune" };

/**
 * The privacy policy, in plain words, written for Ghana's Data Protection Act, 2012 (Act 843).
 * A draft for the church to have checked; the church's own details are in src/lib/camp/legal.ts.
 */
export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy" lead={`What Commune, the camp app of ${LEGAL.church}, keeps about you, why, who sees it, and what you can ask us to do with it.`}>
      <section>
        <h2>Who looks after your information</h2>
        <p>
          {LEGAL.church}
          {LEGAL.address ? `, ${LEGAL.address}` : ""} is responsible for the information in Commune (the &ldquo;data controller&rdquo; under the Data Protection Act, 2012).
          {LEGAL.dpcNumber ? ` We are registered with the Data Protection Commission, number ${LEGAL.dpcNumber}.` : ""} To ask anything about it, contact {legalContact()}.
        </p>
      </section>

      <section>
        <h2>What we keep</h2>
        <ul>
          <li><strong className="font-medium">When you register:</strong> your name, phone, email, gender, fellowship, church, where you&rsquo;ll sleep and T-shirt size.</li>
          <li><strong className="font-medium">If you&rsquo;re under 18:</strong> your parent or guardian&rsquo;s name and phone, and that they agreed to you coming.</li>
          <li><strong className="font-medium">If you add them:</strong> an emergency contact, and health notes (allergies, medicine or a health need). Health notes are &ldquo;special personal data&rdquo;, so we only keep them if you tick that you agree.</li>
          <li><strong className="font-medium">Payments:</strong> how much you paid, when, and expressPay&rsquo;s reference. Card details go to expressPay, never to us. If you pay by MoMo in Commune, we pass your MoMo number to expressPay to send the approval prompt, and don&rsquo;t keep it.</li>
          <li><strong className="font-medium">At camp:</strong> when you checked in, your room and your roommate group.</li>
          <li><strong className="font-medium">Signing in:</strong> when you signed in or out, the town and country your internet connection is in, and the kind of phone (&ldquo;Android 15 · Chrome&rdquo;). We keep this for 90 days, to keep accounts safe.</li>
          <li><strong className="font-medium">Visits:</strong> which screens were opened, which buttons were used, how long things took to load, and errors, counted without your name or sign-in. See &ldquo;Counting visits&rdquo; below.</li>
          <li><strong className="font-medium">Feedback after camp</strong> is saved without your name.</li>
        </ul>
      </section>

      <section>
        <h2>Why</h2>
        <ul>
          <li>To run the camp: your place, payments, rooms, check-in and the texts about it.</li>
          <li>To keep you safe at camp: emergency contacts, health notes and guardian details.</li>
          <li>To keep Commune secure and working: the sign-in log, and noticing errors and slow screens.</li>
          <li>To make Commune better: visit counts, as totals.</li>
        </ul>
        <p>We don&rsquo;t sell your information or use it for advertising.</p>
      </section>

      <section>
        <h2>Who sees it</h2>
        <ul>
          <li><strong className="font-medium">Camp coordinators</strong> see everything about the people in their camps, so they can run it.</li>
          <li><strong className="font-medium">Fellowship and PFCC leaders</strong> see their own people&rsquo;s names, phone numbers, payments and rooms. They don&rsquo;t see health notes, emergency contacts or guardian details.</li>
          <li><strong className="font-medium">The companies Commune runs on</strong>, only to do their part: expressPay (payments), mNotify (texts), Cloudflare (stores the camp&rsquo;s information), Vercel (runs the website) and Supabase (coordinators&rsquo; sign-in). Some of them store information outside Ghana, under their own security and privacy commitments.</li>
        </ul>
      </section>

      <section>
        <h2>How long we keep it</h2>
        <ul>
          <li>The sign-in log and each visit&rsquo;s counts: 90 days. After that only daily totals are kept, which name no one.</li>
          <li>Your registration: until you or a coordinator deletes your details. You can do it any time from Your details on your camp page.</li>
          <li>Payment records stay after your details are deleted, without your contact details, because the church must keep its accounts.</li>
        </ul>
      </section>

      <section>
        <h2>Counting visits</h2>
        <p>
          Commune counts visits to learn which screens people use, where they get stuck, and what&rsquo;s slow. A visit is sent in one go when you put the page away. It
          has the screens and buttons, your phone type, language and connection type, and the town and network your internet connection is in. It has no name, phone
          number, code or sign-in, and no cookie is used for it, so a visit can&rsquo;t be traced back to you. You can switch it off here:
        </p>
        <CountToggle />
      </section>

      <section>
        <h2>Under 18s</h2>
        <p>
          Anyone under 18 registers with a parent or guardian&rsquo;s agreement, and gives their name and phone. A parent or guardian can ask us to see, correct or
          delete their child&rsquo;s information.
        </p>
      </section>

      <section>
        <h2>Your rights</h2>
        <p>Under the Data Protection Act you can ask us to:</p>
        <ul>
          <li>show you what we keep about you;</li>
          <li>correct it (you can change most of it yourself in Your details);</li>
          <li>delete it, or stop using it for something;</li>
          <li>take back an agreement you gave, such as for health notes, by removing them.</li>
        </ul>
        <p>
          Contact {legalContact()}. If you&rsquo;re not happy with our answer, you can complain to the Data Protection Commission of Ghana (dataprotection.org.gh).
        </p>
      </section>

      <section>
        <h2>Keeping it safe</h2>
        <p>
          Commune only works over a secure connection. Sign-in codes are stored scrambled, so not even we can read them. Each person only sees what their role needs,
          and changes are recorded in a history coordinators can check.
        </p>
      </section>

      <section>
        <h2>Cookies and changes</h2>
        <p>
          The cookies Commune uses are listed on the <Link href="/camps/cookies" className="underline decoration-stone-muted underline-offset-[3px]">Cookies</Link> page.
          If this policy changes, the date at the top changes too.
        </p>
      </section>
    </LegalPage>
  );
}
