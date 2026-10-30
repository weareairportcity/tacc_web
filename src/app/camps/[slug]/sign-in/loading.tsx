import { AttendeeSkeleton } from "@/components/camp/skeleton";

export default function Loading() {
  return <AttendeeSkeleton title="Sign in" kind="form" back={false} />;
}
