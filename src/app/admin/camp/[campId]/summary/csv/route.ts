import { serveSummary } from "../serve";

export async function GET(_request: Request, { params }: { params: Promise<{ campId: string }> }) {
  return serveSummary((await params).campId, "csv");
}
