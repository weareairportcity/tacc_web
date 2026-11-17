import { NextResponse } from "next/server";
import { getCampBySlug } from "@/lib/camp/camps";
import { signInWithAppPass } from "@/lib/camp/session";

/**
 * Where the Home Screen app starts. With a valid pass (see appPass) the app
 * signs in as the person who added it and carries on at their page; without
 * one, their page asks for the code as usual.
 */
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const camp = await getCampBySlug(slug);
  const url = new URL(request.url);
  if (!camp) return NextResponse.redirect(new URL("/camps", url));
  const pass = url.searchParams.get("t");
  if (pass) await signInWithAppPass(camp, pass).catch(() => false);
  return NextResponse.redirect(new URL(`/camps/${camp.slug}/me?app=attendee`, url), { headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}
