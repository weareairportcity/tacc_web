"use client";

import React, { useState, useEffect, useTransition, useRef } from "react";
import {
  Settings, Lock, Plus, Trash2, Loader2, X, ShieldCheck, Upload, ImageIcon
} from "lucide-react";
import {
  getCampByToken, updateCampAction, getCoordinatorsAction,
  addCoordinatorAction, removeCoordinatorAction, uploadCampLogoAction,
  Coordinator, CampDetails
} from "../../camp/actions";
import { useAdminCtx } from "../AdminShell";

// ─── Room Types Manager ───────────────────────────────────────────────────────
function RoomTypesManager({ types, onChange }: { types: string[]; onChange: (t: string[]) => void }) {
  const [newType, setNewType] = useState("");
  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-2">
        {types.map(t => (
          <span key={t} className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#fafaf9] border border-[#e8e6e5] rounded-full text-xs font-medium text-[#0c0a09]">
            {t}
            <button type="button" onClick={() => onChange(types.filter(x => x !== t))} className="text-[#a8a29e] hover:text-red-500 cursor-pointer">
              <X size={11} />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input type="text" value={newType} onChange={e => setNewType(e.target.value)} placeholder="Add room type..."
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); if (newType.trim() && !types.includes(newType.trim())) { onChange([...types, newType.trim()]); setNewType(""); } } }}
          className="flex-1 px-3 py-1.5 bg-white border border-[#d6d3d1] rounded-[6px] text-xs text-[#0c0a09] focus:ring-1 focus:ring-[#3ba6f1] focus:outline-none" />
        <button type="button" onClick={() => { if (newType.trim() && !types.includes(newType.trim())) { onChange([...types, newType.trim()]); setNewType(""); } }}
          className="px-3 py-1.5 bg-[#fafaf9] border border-[#e8e6e5] text-xs font-medium text-[#0c0a09] rounded-full hover:bg-white cursor-pointer">Add</button>
      </div>
    </div>
  );
}

// ─── Settings Page ────────────────────────────────────────────────────────────
export default function SettingsPage() {
  const { campId, isSuperAdmin } = useAdminCtx();
  const [camp, setCamp] = useState<CampDetails | null>(null);
  const [coords, setCoords] = useState<Coordinator[]>([]);
  const [loading, setLoading] = useState(true);

  // Camp edit form state
  const [campName, setCampName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoError, setLogoError] = useState("");
  const [roomTypes, setRoomTypes] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // Invite form
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteError, setInviteError] = useState("");

  const [isPending, startTransition] = useTransition();

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { setLogoError("Please select an image file."); return; }
    if (file.size > 5 * 1024 * 1024) { setLogoError("Image must be under 5MB."); return; }
    setLogoError("");
    setLogoUploading(true);
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const base64 = (ev.target?.result as string).split(",")[1];
      const res = await uploadCampLogoAction(campId, base64, file.name, file.type);
      setLogoUploading(false);
      if (res.success && res.url) {
        setLogoUrl(res.url);
      } else {
        // Show preview locally even if Supabase Storage isn't set up yet
        const localUrl = URL.createObjectURL(file);
        setLogoUrl(localUrl);
        if (res.error) setLogoError(`Uploaded locally (Storage not configured: ${res.error})`);
      }
    };
    reader.readAsDataURL(file);
  };

  const load = async () => {
    const [c, coordList] = await Promise.all([
      getCampByToken("portal-admin-26"),
      getCoordinatorsAction(campId),
    ]);
    if (c) { setCamp(c); setCampName(c.name); setLogoUrl(c.logo_url || ""); setRoomTypes(c.room_types); }
    setCoords(coordList);
    setLoading(false);
  };

  useEffect(() => { load(); }, [campId]);

  const handleSaveCamp = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      await updateCampAction(campId, { name: campName, logoUrl, roomTypes });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    });
  };

  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.includes("@")) { setInviteError("Enter a valid email address."); return; }
    setInviteError("");
    startTransition(async () => {
      const res = await addCoordinatorAction(campId, inviteEmail.trim());
      if (res.success) { setInviteEmail(""); await load(); }
      else setInviteError(res.error || "Failed to add coordinator.");
    });
  };

  const handleRemove = (id: string, email: string) => {
    if (!confirm(`Remove ${email} as coordinator?`)) return;
    startTransition(async () => { await removeCoordinatorAction(campId, id); await load(); });
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-64 p-8"><Loader2 size={22} className="text-[#3ba6f1] animate-spin" /></div>;
  }

  return (
    <div className="p-5 sm:p-8 max-w-[640px] space-y-8">
      {/* Header */}
      <div>
        <div className="text-xs uppercase tracking-wider text-[#a8a29e] font-semibold mb-1">Configuration</div>
        <h1 className="font-display font-normal text-[28px] text-[#0c0a09] tracking-tight">Settings</h1>
      </div>

      {/* ── Camp Details (Super Admin Only) ── */}
      <section className="bg-white border border-[#e8e6e5] rounded-[10px] shadow-[rgba(0,0,0,0.05)_0px_4px_16px_0px] overflow-hidden">
        <div className="px-5 py-4 border-b border-[#e8e6e5] flex items-center justify-between">
          <div className="text-sm font-medium text-[#0c0a09]">Camp Details</div>
          {!isSuperAdmin && (
            <span className="inline-flex items-center gap-1 text-[11px] text-[#a8a29e]"><Lock size={11} /> Super Admin only</span>
          )}
        </div>

        {!isSuperAdmin ? (
          <div className="p-5 flex items-center gap-3 text-xs text-[#78716c]">
            <Lock size={14} className="text-[#a8a29e]" />
            Only the camp creator can edit camp details and logo.
          </div>
        ) : (
          <form onSubmit={handleSaveCamp} className="p-5 space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[#78716c] mb-1">Camp Name</label>
              <input type="text" value={campName} onChange={e => setCampName(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-[#d6d3d1] rounded-[6px] text-xs text-[#0c0a09] focus:ring-1 focus:ring-[#3ba6f1] focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[#78716c] mb-2">Camp Logo</label>
              <div
                onClick={() => logoInputRef.current?.click()}
                className="flex items-center gap-3 p-3 bg-[#fafaf9] border border-dashed border-[#d6d3d1] rounded-[8px] cursor-pointer hover:border-[#3ba6f1] transition-colors group">
                {logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoUrl} alt="Camp logo" className="w-12 h-12 rounded object-cover border border-[#e8e6e5] shrink-0" />
                ) : (
                  <div className="w-12 h-12 rounded bg-white border border-[#e8e6e5] flex items-center justify-center shrink-0">
                    <ImageIcon size={18} className="text-[#a8a29e]" />
                  </div>
                )}
                <div className="min-w-0">
                  {logoUploading ? (
                    <div className="flex items-center gap-1.5 text-xs text-[#78716c]"><Loader2 size={13} className="animate-spin" /> Uploading...</div>
                  ) : (
                    <>
                      <div className="text-xs font-medium text-[#0c0a09]">{logoUrl ? "Change logo" : "Upload logo"}</div>
                      <div className="text-[10px] text-[#a8a29e]">PNG, JPG or SVG · Max 5MB</div>
                    </>
                  )}
                </div>
                <Upload size={14} className="ml-auto text-[#a8a29e] group-hover:text-[#3ba6f1] transition-colors shrink-0" />
              </div>
              <input
                ref={logoInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleLogoUpload}
              />
              {logoError && <p className="text-[10px] text-amber-600 mt-1">{logoError}</p>}
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[#78716c] mb-2">Room Categories</label>
              <RoomTypesManager types={roomTypes} onChange={setRoomTypes} />
            </div>
            <div className="flex items-center gap-3 pt-2">
              <button type="submit" disabled={isPending}
                className="px-5 py-2 bg-[#3ba6f1] hover:bg-[#3398e1] text-white text-xs font-medium rounded-full cursor-pointer disabled:opacity-50 transition-colors">
                {isPending ? "Saving..." : "Save Changes"}
              </button>
              {saved && <span className="text-xs text-emerald-600 font-medium">Saved ✓</span>}
            </div>
          </form>
        )}
      </section>

      {/* ── Coordinators ── */}
      <section className="bg-white border border-[#e8e6e5] rounded-[10px] shadow-[rgba(0,0,0,0.05)_0px_4px_16px_0px] overflow-hidden">
        <div className="px-5 py-4 border-b border-[#e8e6e5] flex items-center gap-2">
          <ShieldCheck size={14} className="text-[#3ba6f1]" />
          <div className="text-sm font-medium text-[#0c0a09]">Coordinators</div>
        </div>

        <div className="divide-y divide-[#fafaf9]">
          {coords.length === 0 ? (
            <div className="p-5 text-xs text-[#a8a29e]">No coordinators yet.</div>
          ) : coords.map(c => (
            <div key={c.id} className="px-5 py-3 flex items-center justify-between">
              <div>
                <div className="text-xs font-medium text-[#0c0a09]">{c.email}</div>
                <span className={`text-[10px] font-medium ${c.status === "accepted" ? "text-emerald-600" : "text-amber-600"}`}>
                  {c.status === "accepted" ? "Active" : "Pending invite"}
                </span>
              </div>
              {isSuperAdmin && (
                <button onClick={() => handleRemove(c.id, c.email)}
                  className="p-1.5 text-[#a8a29e] hover:text-red-500 hover:bg-red-50 rounded transition-colors cursor-pointer">
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          ))}
        </div>

        {isSuperAdmin && (
          <form onSubmit={handleInvite} className="p-5 border-t border-[#e8e6e5] flex gap-2">
            <input type="email" required value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="Invite by email..."
              className="flex-1 px-3 py-2 bg-white border border-[#d6d3d1] rounded-[6px] text-xs text-[#0c0a09] focus:ring-1 focus:ring-[#3ba6f1] focus:outline-none" />
            <button type="submit" disabled={isPending}
              className="px-4 py-2 bg-[#3ba6f1] text-white text-xs font-medium rounded-full cursor-pointer disabled:opacity-50 flex items-center gap-1.5">
              <Plus size={12} /> Add
            </button>
          </form>
        )}
        {inviteError && <p className="px-5 pb-3 text-xs text-red-600">{inviteError}</p>}
      </section>

      {/* ── Role Info ── */}
      <section className="bg-[#fafaf9] border border-[#e8e6e5] rounded-[10px] p-4 text-xs text-[#78716c] space-y-1">
        <div className="font-semibold text-[#0c0a09] mb-2 flex items-center gap-1.5"><ShieldCheck size={13} className="text-[#3ba6f1]" /> Role Permissions</div>
        <div className="flex justify-between border-b border-[#e8e6e5] pb-1.5 mb-1.5">
          <span className="font-medium text-[#0c0a09]">Super Admin (Camp Creator)</span>
          <span>Create/edit camp, manage coordinators</span>
        </div>
        <div className="flex justify-between">
          <span className="font-medium text-[#0c0a09]">Coordinator</span>
          <span>Add people, manage rooms, send SMS</span>
        </div>
      </section>
    </div>
  );
}
