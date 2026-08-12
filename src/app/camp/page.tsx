import { getDefaultCamp } from "./actions";
import { CampSearchPortal } from "./CampSearchPortal";

export default async function CampPage() {
  const camp = await getDefaultCamp();
  return <CampSearchPortal camp={camp} />;
}
