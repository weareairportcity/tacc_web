import { notFound } from "next/navigation";
import { getCamp, ID } from "@/lib/camp/camps";
import { listRoomTypes } from "@/lib/camp/rooms";
import { headlineClass, titleClass } from "@/components/camp/ui";
import { NoAccess, pageStaff } from "../../access";
import { CampForm } from "../../CampForm";
import { CampPhotos } from "./CampPhotos";
import { RoomTypes } from "./RoomTypes";

function Section({ title, text, children }: { title: string; text: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-wrap gap-x-10 gap-y-4 border-t border-stone-border py-7">
      <div className="flex max-w-[280px] flex-[1_1_220px] flex-col gap-1.5">
        <h2 className={titleClass}>{title}</h2>
        <p className="text-[13px] leading-relaxed text-warm-gray">{text}</p>
      </div>
      <div className="flex min-w-0 flex-[999_1_420px] flex-col gap-4 rounded-[10px] border border-stone-border bg-white p-6 shadow-seline-card">
        {children}
      </div>
    </section>
  );
}

/** Room types and camp details, label on the left and the form on the right. */
export default async function CampSettingsPage({ params }: { params: Promise<{ campId: string }> }) {
  const staff = await pageStaff("coordinator");
  if (!staff) return <NoAccess />;
  const { campId } = await params;
  if (!ID.test(campId)) notFound();

  const [camp, roomTypes] = await Promise.all([getCamp(campId), listRoomTypes(campId)]);
  if (!camp) notFound();

  return (
    <div className="flex flex-col">
      <header className="pb-6">
        <h1 className={headlineClass}>
          Camp <span className="text-cyan-edge">settings</span>
        </h1>
      </header>
      <Section title="The camp" text="What attendees see on the camp page, the dates that drive every reminder, and whether it's live.">
        <CampForm camp={camp} />
      </Section>
      <Section
        title="Logo and photos"
        text="Give each camp its own look. JPG, PNG or WebP up to 8 MB. Add a credit when the photo isn't yours."
      >
        <CampPhotos camp={camp} />
      </Section>
      <Section
        title="Room types"
        text="Each has a price and beds per room. People pick one when they register. Places left for each one is on Rooms."
      >
        <RoomTypes campId={camp.id} roomTypes={roomTypes} />
      </Section>
    </div>
  );
}
