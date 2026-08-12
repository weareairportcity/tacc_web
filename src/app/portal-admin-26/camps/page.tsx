"use client";

import React, { useState, useEffect, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Map, Plus, Users, Calendar, ArrowRight, Loader2, X, ChevronRight } from "lucide-react";
import { getCampsList, createCampAction, CampDetails } from "../../camp/actions";
import { useAdminCtx } from "../AdminShell";

// ─── Create Camp Modal ────────────────────────────────────────────────────────
function CreateCampModal({ onClose, onCreated }: { onClose: () => void; onCreated: (camp: CampDetails) => void }) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [roomTypes, setRoomTypes] = useState(["Villa", "Hostel", "Dormitory"]);
  const [newType, setNewType] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError("Camp name is required."); return; }
    setError("");
    startTransition(async () => {
      const res = await createCampAction({ name: name.trim(), slug: slug.trim() || name.trim().toLowerCase().replace(/[^a-z0-9]/g, "-"), logoUrl, roomTypes });
      if (res.success && res.camp) onCreated(res.camp);
      else setError(res.error || "Failed to create camp.");
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/25 backdrop-blur-xs">
      <div className="bg-white border border-[#e8e6e5] rounded-[10px] shadow-[rgba(17,12,46,0.12)_0px_12px_45px_0px] w-full max-w-[480px]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#e8e6e5] bg-[#fafaf9] rounded-t-[10px]">
          <h2 className="font-display font-medium text-base text-[#0c0a09]">Create New Camp</h2>
          <button onClick={onClose} className="text-[#a8a29e] hover:text-[#0c0a09] cursor-pointer"><X size={16} /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[#78716c] mb-1">Camp Name *</label>
            <input type="text" required value={name}
              onChange={e => { setName(e.target.value); if (!slug) setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, "-")); }}
              placeholder="e.g. TACC Youth Camp 2027"
              className="w-full px-3 py-2 bg-white border border-[#d6d3d1] rounded-[6px] text-xs text-[#0c0a09] focus:ring-1 focus:ring-[#3ba6f1] focus:outline-none" />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[#78716c] mb-1">Logo URL (optional)</label>
            <input type="url" value={logoUrl} onChange={e => setLogoUrl(e.target.value)} placeholder="https://..."
              className="w-full px-3 py-2 bg-white border border-[#d6d3d1] rounded-[6px] text-xs text-[#0c0a09] focus:ring-1 focus:ring-[#3ba6f1] focus:outline-none" />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[#78716c] mb-2">Room Categories</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {roomTypes.map(t => (
                <span key={t} className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#fafaf9] border border-[#e8e6e5] rounded-full text-xs text-[#0c0a09]">
                  {t}
                  <button type="button" onClick={() => setRoomTypes(roomTypes.filter(x => x !== t))} className="text-[#a8a29e] hover:text-red-500 cursor-pointer"><X size={10} /></button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input type="text" value={newType} onChange={e => setNewType(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); if (newType.trim()) { setRoomTypes([...roomTypes, newType.trim()]); setNewType(""); } } }}
                placeholder="Add room type..."
                className="flex-1 px-3 py-1.5 bg-white border border-[#d6d3d1] rounded-[6px] text-xs text-[#0c0a09] focus:ring-1 focus:ring-[#3ba6f1] focus:outline-none" />
              <button type="button" onClick={() => { if (newType.trim()) { setRoomTypes([...roomTypes, newType.trim()]); setNewType(""); } }}
                className="px-3 py-1.5 text-xs bg-[#fafaf9] border border-[#e8e6e5] rounded-full font-medium text-[#0c0a09] hover:bg-white cursor-pointer">Add</button>
            </div>
          </div>

          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-100 p-2 rounded">{error}</p>}

          <div className="flex justify-end gap-2 pt-2 border-t border-[#e8e6e5]">
            <button type="button" onClick={onClose} className="px-4 py-1.5 text-xs font-medium text-[#78716c] bg-[#fafaf9] border border-[#e8e6e5] rounded-full cursor-pointer">Cancel</button>
            <button type="submit" disabled={isPending}
              className="px-5 py-1.5 bg-[#3ba6f1] text-white text-xs font-medium rounded-full cursor-pointer disabled:opacity-50 hover:bg-[#3398e1] transition-colors">
              {isPending ? "Creating..." : "Create Camp"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Camps Page ───────────────────────────────────────────────────────────────
export default function CampsPage() {
  const { isSuperAdmin, campId } = useAdminCtx();
  const [camps, setCamps] = useState<CampDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const router = useRouter();

  const load = async () => {
    const list = await getCampsList();
    setCamps(list);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleCreated = (camp: CampDetails) => {
    setShowCreate(false);
    load();
    // Navigate to the new camp's admin portal
    if (camp.admin_token) {
      router.push(`/camp/admin/${camp.admin_token}`);
    }
  };

  return (
    <div className="p-5 sm:p-8 max-w-[960px]">
      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <div className="text-xs uppercase tracking-wider text-[#a8a29e] font-semibold mb-1">Workspace</div>
          <h1 className="font-display font-normal text-[28px] text-[#0c0a09] tracking-tight">My Camps</h1>
          <p className="text-xs text-[#78716c] mt-1">Camps you created or were invited to coordinate.</p>
        </div>
        {isSuperAdmin && (
          <button onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#3ba6f1] hover:bg-[#3398e1] text-white text-xs font-medium rounded-full shadow-sm cursor-pointer transition-all shrink-0">
            <Plus size={13} /> New Camp
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 size={22} className="text-[#3ba6f1] animate-spin" /></div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {camps.map(camp => {
            const isCurrent = camp.id === campId;
            return (
              <div key={camp.id}
                className={`bg-white border rounded-[10px] p-5 shadow-[rgba(0,0,0,0.05)_0px_4px_16px_0px] transition-colors ${isCurrent ? "border-[#3ba6f1]" : "border-[#e8e6e5] hover:border-[#d6d3d1]"}`}>

                {/* Camp Logo or icon */}
                <div className="flex items-center gap-3 mb-4">
                  {camp.logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={camp.logo_url} alt="Camp logo" className="w-10 h-10 rounded object-cover border border-[#e8e6e5]" onError={e => (e.currentTarget.style.display = "none")} />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-[#fafaf9] border border-[#e8e6e5] flex items-center justify-center text-[#3ba6f1]">
                      <Map size={16} />
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-[#0c0a09] truncate">{camp.name}</div>
                    {isCurrent && (
                      <span className="text-[10px] font-semibold text-[#3ba6f1] uppercase tracking-wider">Current</span>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5 mb-4">
                  {(camp.room_types || []).slice(0, 3).map(t => (
                    <span key={t} className="text-[10px] px-2 py-0.5 bg-[#fafaf9] border border-[#e8e6e5] rounded-full text-[#78716c]">{t}</span>
                  ))}
                  {(camp.room_types || []).length > 3 && (
                    <span className="text-[10px] px-2 py-0.5 text-[#a8a29e]">+{camp.room_types.length - 3} more</span>
                  )}
                </div>

                <Link
                  href={`/camp/admin/${camp.admin_token}`}
                  className="flex items-center justify-center gap-1.5 w-full py-2 text-xs font-medium rounded-full border transition-colors cursor-pointer
                    border-[#e8e6e5] text-[#78716c] hover:text-[#0c0a09] hover:border-[#d6d3d1] hover:bg-[#fafaf9]"
                >
                  Manage Camp <ChevronRight size={12} />
                </Link>
              </div>
            );
          })}

          {!isSuperAdmin && camps.length === 0 && (
            <div className="col-span-full bg-white border border-[#e8e6e5] rounded-[10px] p-10 text-center">
              <p className="text-sm text-[#78716c]">You haven't been invited to any camps yet.</p>
            </div>
          )}
        </div>
      )}

      {showCreate && <CreateCampModal onClose={() => setShowCreate(false)} onCreated={handleCreated} />}
    </div>
  );
}
