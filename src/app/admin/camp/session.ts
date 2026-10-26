"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";

/** Signs a coordinator out of Commune (the shared Supabase session) and back to Commune's sign-in. */
export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/admin/camp/sign-in");
}
