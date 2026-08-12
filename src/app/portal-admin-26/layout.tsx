import React from "react";
import { AdminShell } from "./AdminShell";

export default function PortalAdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
