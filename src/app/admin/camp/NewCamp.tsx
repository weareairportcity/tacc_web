"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { CampForm } from "./CampForm";
import { Card, buttonClass } from "./ui";

export function NewCamp() {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button className={buttonClass} onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> New camp
      </button>
    );
  }
  return (
    <Card title="New camp">
      <CampForm />
    </Card>
  );
}
