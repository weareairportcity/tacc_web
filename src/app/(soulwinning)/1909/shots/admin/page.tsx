import { ShotsAdmin } from "./ShotsAdmin";
import { assertShotsEnabled } from "../guard";

export const dynamic = "force-dynamic";

type View = "overview" | "wall" | "entries" | "duplicates" | "map";

export default async function AdminShotPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  assertShotsEnabled();
  const params = await searchParams;
  const view: View =
    params.view === "duplicates" ||
    params.view === "map" ||
    params.view === "entries" ||
    params.view === "wall"
      ? params.view
      : "overview";
  return <ShotsAdmin view={view} />;
}
