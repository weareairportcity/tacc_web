import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { headlineClass } from "@/components/camp/ui";
import { NoAccess, pageStaff } from "../access";
import { PrintButton } from "./PrintButton";

/**
 * A one-page guide per role, five steps each, to read on a phone or print on A4. Leaders reach
 * it at /leaders/guide (the proxy maps it here), coordinators from More.
 */

type Step = [title: string, text: string];

const COORDINATOR: Step[] = [
  ["Set the camp up", "Settings: the camp's dates and the help number attendees can call or WhatsApp. Rooms: the room types and prices, then import the venue's list of rooms."],
  ["Open registration and share the link", "Copy the camp's link (People shows it while nobody has registered) and share it. Today opens with what needs you: requests waiting, payments to check, people to place."],
  ["Watch the money", "People shows who still has to pay. Tick people and Pay for them when a fellowship fund pays. Requests holds refunds and room changes to say yes or no to."],
  ["Place everyone in rooms", "After the roommate deadline: Rooms, then Fill rooms for me. Check the draft, Place everyone, move anyone by hand, then Text everyone their room."],
  ["Check people in at camp", "Check-in: the camera stays open, so scan pass after pass. A green tick means they're in. T-shirts work the same way. Arrived and Not here yet show who's still to come."],
];

const LEADER: Step[] = [
  ["Sign in with your leader code", "The camp admin gives you a code for your fellowship or PFCC. Open the leaders' page, type it once, and this phone stays signed in."],
  ["See where your people are", "People opens on how many of your people are paid in full. Tap Not paid, Part paid or Paid in full to see just them. Tap a name for their phone and details."],
  ["Remind the ones still to pay", "Remind the people still to pay: each message opens in WhatsApp with that person's own pay link, written for you. Nothing sends until you press send there."],
  ["Pay from a fellowship fund", "Tick the people the fund is paying for, then Pay for them. One Paystack payment clears every balance you picked."],
  ["Scan at camp", "From the day before camp your page opens with Scan a pass. A green tick means they're checked in; if not, a sentence says why."],
];

export default async function GuidePage() {
  const staff = await pageStaff("coordinator", "leader");
  if (!staff) return <NoAccess />;
  const leader = staff.role === "leader";
  const steps = leader ? LEADER : COORDINATOR;
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-5 py-8 print:max-w-none print:p-0">
      <div className="flex items-center justify-between gap-3 print:hidden">
        <Link href={leader ? "/leaders" : "/admin/camp"} className="cm-press -ml-1 inline-flex min-h-11 items-center gap-2 text-[15px]">
          <ArrowLeft className="h-[18px] w-[18px]" strokeWidth={1.7} aria-hidden="true" /> Back
        </Link>
        <PrintButton />
      </div>
      <header className="flex flex-col gap-2">
        <p className="text-sm text-warm-gray">Commune · one-page guide</p>
        <h1 className={`${headlineClass} text-[34px]`}>
          Commune for <span className="text-cyan-edge">{leader ? "leaders" : "coordinators"}</span>
        </h1>
        <p className="text-[15px] leading-relaxed text-warm-gray">Five steps, in the order a camp needs them.</p>
      </header>
      <ol className="flex flex-col">
        {steps.map(([title, text], i) => (
          <li key={title} className="relative flex gap-4 pb-6 last:pb-0">
            {i < steps.length - 1 && <span aria-hidden="true" className="absolute top-9 bottom-1 left-[17px] w-0.5 bg-stone-border" />}
            <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-soot text-[15px] font-semibold text-white">{i + 1}</span>
            <span className="flex flex-col gap-1 pt-1">
              <span className="text-[17px] font-medium">{title}</span>
              <span className="text-[15px] leading-relaxed text-[#57534e]">{text}</span>
            </span>
          </li>
        ))}
      </ol>
      <p className="border-t border-stone-border pt-4 text-[13px] text-warm-gray">Stuck? Ask the camp admin. Every screen also says what to do next.</p>
    </main>
  );
}
