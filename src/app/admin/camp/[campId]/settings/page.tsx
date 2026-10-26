import { notFound } from "next/navigation";
import { getCamp, ID } from "@/lib/camp/camps";
import { getStaffPhone } from "@/lib/camp/staff";
import { headlineClass, titleClass } from "@/components/camp/ui";
import { NoAccess, pageStaff } from "../../access";
import { CampForm } from "../../CampForm";
import { CampPhotos } from "./CampPhotos";
import { SummaryPhone } from "./SummaryPhone";

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

/** Camp details, photos and your evening text. Room types live on Rooms. */
export default async function CampSettingsPage({ params }: { params: Promise<{ campId: string }> }) {
  const staff = await pageStaff("coordinator");
  if (!staff) return <NoAccess />;
  const { campId } = await params;
  if (!ID.test(campId)) notFound();

  const [camp, phone] = await Promise.all([getCamp(campId), getStaffPhone(staff.email)]);
  if (!camp) notFound();

  return (
    <div className="flex flex-col">
      <header className="pb-6">
        <h1 className={`${headlineClass} text-[34px]`}>Settings</h1>
      </header>
      <Section title="The camp" text="Name, dates and whether it's live.">
        <CampForm camp={camp} />
      </Section>
      <Section
        title="Logo and photos"
        text="JPG, PNG or WebP up to 8 MB."
      >
        <CampPhotos camp={camp} />
      </Section>
      <Section title="Evening text" text="A short summary at 7 pm, to you.">
        <SummaryPhone phone={phone} />
      </Section>
    </div>
  );
}
