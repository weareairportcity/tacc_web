"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import {
  addSmsRecipient,
  fetchSmsConfig,
  removeSmsRecipient,
  setSmsRecipientEnabled,
  updateCampaignSettings,
} from "@/lib/soulwinning/admin";
import type { SwCampaign, SwSmsConfig } from "@/lib/soulwinning/types";

/**
 * Recipients and the message template are both editable here rather than
 * hardcoded, so either can change on the day without a redeploy (plan §8).
 *
 * The form fields seed from the campaign once. Switching campaigns remounts the
 * panel (it is keyed by campaign id upstream) rather than syncing through an
 * effect, so a half-typed template is never overwritten mid-edit.
 */

const PLACEHOLDERS = ["{total}", "{last_hour}", "{time}", "{goal}", "{tongues}", "{church}"];

interface Props {
  campaign: SwCampaign;
  onCampaignChange: () => void;
}

export function SmsPanel({ campaign, onCampaignChange }: Props) {
  const [recipients, setRecipients] = useState<SwSmsConfig[]>([]);
  const [phone, setPhone] = useState("");
  const [label, setLabel] = useState("");
  const [template, setTemplate] = useState(campaign.sms_template);
  const [startHour, setStartHour] = useState(campaign.sms_start_hour);
  const [endHour, setEndHour] = useState(campaign.sms_end_hour);
  const [goal, setGoal] = useState(campaign.goal_total?.toString() ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = () => void fetchSmsConfig(campaign.id).then(setRecipients);

  useEffect(reload, [campaign.id]);

  const saveSettings = async () => {
    setSaving(true);
    setError(null);
    try {
      const parsedGoal = goal.trim() === "" ? null : Number.parseInt(goal, 10);
      if (parsedGoal !== null && (!Number.isFinite(parsedGoal) || parsedGoal <= 0)) {
        throw new Error("The goal must be a positive number, or left empty.");
      }
      await updateCampaignSettings(campaign.id, {
        sms_template: template,
        sms_start_hour: startHour,
        sms_end_hour: endHour,
        goal_total: parsedGoal,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      onCampaignChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };

  const add = async () => {
    if (!phone.trim()) return;
    setError(null);
    try {
      await addSmsRecipient(campaign.id, phone, label);
      setPhone("");
      setLabel("");
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add that number");
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="rounded-xl border border-[#e8e6e5] bg-white p-5">
        <h3 className="font-roobert text-base text-[#0c0a09]">Who gets the hourly SMS</h3>
        <p className="mb-4 text-xs text-[#a8a29e]">Ghana numbers in any format — 024…, +233…, 233….</p>

        <div className="space-y-2">
          {recipients.map((recipient) => (
            <div
              key={recipient.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-[#e8e6e5] px-3 py-2.5"
            >
              <div>
                <p className="text-sm text-[#0c0a09]">{recipient.phone_number}</p>
                {recipient.label && <p className="text-xs text-[#a8a29e]">{recipient.label}</p>}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void setSmsRecipientEnabled(recipient.id, !recipient.enabled).then(reload)}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                    recipient.enabled ? "bg-[#c1e1f7] text-[#3398e1]" : "bg-[#f2f2f2] text-[#a8a29e]"
                  }`}
                >
                  {recipient.enabled ? "On" : "Off"}
                </button>
                <button
                  type="button"
                  onClick={() => void removeSmsRecipient(recipient.id).then(reload)}
                  className="text-[#a8a29e] hover:text-[#f54911]"
                  aria-label={`Remove ${recipient.phone_number}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
          {recipients.length === 0 && (
            <p className="text-sm text-[#a8a29e]">No numbers yet — the hourly SMS will be skipped.</p>
          )}
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <input
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="0244000111"
            inputMode="tel"
            className="min-w-0 flex-1 rounded-lg border border-[#e8e6e5] px-3 py-2.5 text-sm outline-none focus:border-[#3ba6f1]"
          />
          <input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="Name (optional)"
            className="min-w-0 flex-1 rounded-lg border border-[#e8e6e5] px-3 py-2.5 text-sm outline-none focus:border-[#3ba6f1]"
          />
          <button
            type="button"
            onClick={add}
            className="flex items-center gap-1.5 rounded-lg bg-[#0c0a09] px-4 py-2.5 text-sm font-medium text-white"
          >
            <Plus className="h-4 w-4" />
            Add
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-[#e8e6e5] bg-white p-5">
        <h3 className="font-roobert text-base text-[#0c0a09]">Message & campaign settings</h3>
        <p className="mb-4 text-xs text-[#a8a29e]">
          Placeholders: {PLACEHOLDERS.join("  ")}
        </p>

        <textarea
          value={template}
          onChange={(event) => setTemplate(event.target.value)}
          rows={3}
          className="w-full rounded-lg border border-[#e8e6e5] px-3 py-2.5 text-sm outline-none focus:border-[#3ba6f1]"
        />

        <div className="mt-3 grid grid-cols-3 gap-3">
          <label className="block">
            <span className="mb-1 block text-xs text-[#a8a29e]">From hour</span>
            <input
              type="number"
              min={0}
              max={23}
              value={startHour}
              onChange={(event) => setStartHour(Number(event.target.value))}
              className="w-full rounded-lg border border-[#e8e6e5] px-3 py-2 text-sm outline-none focus:border-[#3ba6f1]"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-[#a8a29e]">To hour</span>
            <input
              type="number"
              min={0}
              max={23}
              value={endHour}
              onChange={(event) => setEndHour(Number(event.target.value))}
              className="w-full rounded-lg border border-[#e8e6e5] px-3 py-2 text-sm outline-none focus:border-[#3ba6f1]"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-[#a8a29e]">Goal</span>
            <input
              type="number"
              min={1}
              value={goal}
              placeholder="none"
              onChange={(event) => setGoal(event.target.value)}
              className="w-full rounded-lg border border-[#e8e6e5] px-3 py-2 text-sm outline-none focus:border-[#3ba6f1]"
            />
          </label>
        </div>

        {error && <p className="mt-3 text-sm text-[#f54911]">{error}</p>}

        <button
          type="button"
          onClick={saveSettings}
          disabled={saving}
          className="mt-4 flex items-center gap-2 rounded-lg bg-[#3ba6f1] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {saved ? "Saved" : "Save settings"}
        </button>
      </section>
    </div>
  );
}
