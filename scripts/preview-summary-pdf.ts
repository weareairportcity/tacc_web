import { writeFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { buildSummaryPdf } from "../src/lib/soulwinning/summary-pdf";
import {
  SHOT_CAMPAIGN,
  SHOT_FELLOWSHIPS,
  SHOT_HOURLY,
  SHOT_MEMBERS,
  SHOT_OVERVIEW,
  SHOT_PFCCS,
} from "../src/app/(soulwinning)/1909/shots/fixtures";

const logoPath = path.join(process.cwd(), "public/logo.png");
const logo = `data:image/png;base64,${readFileSync(logoPath).toString("base64")}`;

const blob = buildSummaryPdf({
  campaign: SHOT_CAMPAIGN,
  overview: SHOT_OVERVIEW,
  fellowships: SHOT_FELLOWSHIPS,
  pfccs: SHOT_PFCCS,
  members: SHOT_MEMBERS,
  hourly: SHOT_HOURLY,
  logo,
  printedAt: new Date("2026-09-20T08:30:00.000Z"),
});

const out = path.join(process.cwd(), "docs/soulwinning/summary-preview.pdf");
void blob.arrayBuffer().then((buffer) => {
  writeFileSync(out, Buffer.from(buffer));
  console.log(out);
});
