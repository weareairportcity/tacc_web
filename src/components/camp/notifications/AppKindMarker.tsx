"use client";

import { useEffect } from "react";
import { rememberAppKind } from "./push-client";

/** Notes which Home Screen app this window is (see appKind), from its start address. */
export function AppKindMarker() {
  useEffect(() => rememberAppKind(), []);
  return null;
}
