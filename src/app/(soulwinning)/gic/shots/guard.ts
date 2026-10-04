import { notFound } from "next/navigation";

/** Shot pages exist so Playwright can drive real UI with fixture data. */
export function assertShotsEnabled() {
  if (process.env.NODE_ENV === "production") notFound();
}
