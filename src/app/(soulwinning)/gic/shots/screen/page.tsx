import { CounterView } from "../../CounterView";
import { SHOT_CAMPAIGN, SHOT_COUNTS } from "../fixtures";
import { assertShotsEnabled } from "../guard";

export const dynamic = "force-dynamic";

export default function ScreenShotPage() {
  assertShotsEnabled();
  return <CounterView campaign={SHOT_CAMPAIGN} initialCounts={SHOT_COUNTS} variant="projector" />;
}
