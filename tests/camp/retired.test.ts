import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { RETIRED_CAMP_REDIRECTS } from "../../next.config";

// Phase 6: the old camp feature is gone and its addresses land somewhere useful.

/** Next's ":path*" matches zero or more segments; the first matching rule wins. */
function redirectFor(pathname: string) {
  const rule = RETIRED_CAMP_REDIRECTS.find((r) =>
    new RegExp(`^${r.source.replace("/:path*", "(?:/.*)?")}$`).test(pathname),
  );
  return rule ? { to: rule.destination, permanent: rule.permanent } : null;
}

describe("retired camp addresses", () => {
  it("send attendees to the camp list and admins to the new camp admin", () => {
    expect(redirectFor("/camp")).toEqual({ to: "/camps", permanent: true });
    expect(redirectFor("/camp/myc-2026")).toEqual({ to: "/camps", permanent: true });
    expect(redirectFor("/camp/admin/create")).toEqual({ to: "/admin/camp", permanent: true });
    expect(redirectFor("/camp/admin/9f3c-token")).toEqual({ to: "/admin/camp", permanent: true });
    expect(redirectFor("/portal-admin-26")).toEqual({ to: "/admin/camp", permanent: true });
    expect(redirectFor("/portal-admin-26/groups/assign")).toEqual({ to: "/admin/camp", permanent: true });
  });

  it("leave the new camp addresses alone", () => {
    for (const path of ["/camps", "/camps/youth-camp-2026", "/camps/youth-camp-2026/me", "/admin/camp", "/campaign"]) {
      expect(redirectFor(path)).toBeNull();
    }
  });

  it("no longer have pages behind them", () => {
    expect(existsSync("src/app/camp")).toBe(false);
    expect(existsSync("src/app/portal-admin-26")).toBe(false);
  });
});
