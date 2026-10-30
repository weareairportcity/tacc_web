import { AttendeeSkeleton } from "@/components/camp/skeleton";

export default function Loading() {
  return <AttendeeSkeleton title="Checking your payment" kind="cards" back={false} />;
}
