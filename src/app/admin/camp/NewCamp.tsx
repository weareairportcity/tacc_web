"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { CampForm } from "./CampForm";
import { Card, buttonClass } from "@/components/camp/ui";

export function NewCamp() {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button className={`${buttonClass} self-start`} onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" aria-hidden="true" /> New camp
      </button>
    );
  }
  return (
    <Card lifted title="New camp" action={<button type="button" onClick={() => setOpen(false)} className="min-h-10 text-sm text-warm-gray hover:text-ink-black">Cancel</button>}>
      <CampForm />
    </Card>
  );
}
