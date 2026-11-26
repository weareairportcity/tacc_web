"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { PersonPanel } from "@/app/admin/camp/[campId]/people/PersonPanel";

/**
 * A person's panel opens on the page you're already on, not on People. The
 * page's address carries ?person=<id> (so Back closes it and a refresh keeps
 * it open). People and Health show their own panel, so this stays out of the way there.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OWN_PANEL = /\/(people|health)(\/|$)/;

/** The current page's address with ?person= set (or removed), keeping the rest of it (tabs, filters). */
function hrefWith(pathname: string, search: URLSearchParams, person: string | null) {
  const next = new URLSearchParams(search);
  if (person) next.set("person", person);
  else next.delete("person");
  const q = next.toString();
  return q ? `${pathname}?${q}` : pathname;
}

function Panel({ campId }: { campId: string }) {
  const pathname = usePathname();
  const search = useSearchParams();
  const router = useRouter();
  const id = search.get("person");
  if (!id || !UUID.test(id) || OWN_PANEL.test(pathname)) return null;
  return (
    <PersonPanel
      key={id}
      campId={campId}
      id={id}
      onClose={() => router.replace(hrefWith(pathname, search, null), { scroll: false })}
      onChanged={() => router.refresh()}
    />
  );
}

/** Put once in the coordinators' layout. */
export function PersonOnThisPage({ campId }: { campId: string }) {
  return (
    <Suspense fallback={null}>
      <Panel campId={campId} />
    </Suspense>
  );
}

function Link_({ id, className, children }: { id: string; className?: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const search = useSearchParams();
  return (
    <Link href={hrefWith(pathname, search, id)} scroll={false} className={className}>
      {children}
    </Link>
  );
}

/** A link that opens this person's panel right here. */
export function PersonLink(props: { id: string; className?: string; children: React.ReactNode }) {
  return (
    <Suspense fallback={<span className={props.className}>{props.children}</span>}>
      <Link_ {...props} />
    </Suspense>
  );
}

/** Where to go to open a person from wherever you are (the search box): here, or People/Health which have their own panel. */
export function openPersonHref(pathname: string, search: URLSearchParams, base: string, id: string) {
  return OWN_PANEL.test(pathname) ? `${base}/people?person=${id}` : hrefWith(pathname, search, id);
}
