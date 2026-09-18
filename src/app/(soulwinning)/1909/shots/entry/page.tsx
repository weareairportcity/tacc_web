import { FieldApp } from "../../entry/FieldApp";
import { SHOT_CAMPAIGN } from "../fixtures";
import { assertShotsEnabled } from "../guard";

export const dynamic = "force-dynamic";

export default function EntryShotPage() {
  assertShotsEnabled();
  return <FieldApp campaign={SHOT_CAMPAIGN} />;
}
