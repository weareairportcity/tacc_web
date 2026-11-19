import { notFound } from "next/navigation";
import { getCamp, ID } from "@/lib/camp/camps";
import { headlineClass } from "@/components/camp/ui";
import { NoAccess, pageStaff } from "../../access";
import { MedicalSearch } from "./MedicalSearch";

/** Find: the medical team looks anyone up for their health notes, emergency contact and room. */
export default async function MedicalPage({ params }: { params: Promise<{ campId: string }> }) {
  const staff = await pageStaff("medical", "coordinator");
  if (!staff) return <NoAccess />;
  const { campId } = await params;
  if (!ID.test(campId)) notFound();
  const camp = await getCamp(campId);
  if (!camp || (staff.role === "medical" && camp.status === "draft")) notFound();
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
      <header className="flex flex-col gap-1.5">
        <h1 className={`${headlineClass} text-[34px]`}>Find someone</h1>
        <p className="text-[15px] leading-relaxed text-warm-gray">
          Search by name or phone to see their health notes, who to call in an emergency, their room and their roommates.
        </p>
      </header>
      <MedicalSearch campId={camp.id} />
    </div>
  );
}
