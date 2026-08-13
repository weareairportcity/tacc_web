"use client";

import React, { useState, useEffect, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Map, Plus, Users, Calendar, ArrowRight, Loader2, X, ChevronRight, Upload, ExternalLink, Check, Copy } from "lucide-react";
import { getCampsList, createCampAction, CampDetails } from "../../camp/actions";
import { useAdminCtx } from "../AdminShell";

// Helper: Compress uploaded images to small webp data URL
function compressImageFile(file: File, maxWidth = 512, maxHeight = 512): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;
        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL("image/webp", 0.85));
        } else {
          resolve(e.target?.result as string);
        }
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
}

// ─── Create Camp Modal ────────────────────────────────────────────────────────
function CreateCampModal({ onClose, onCreated }: { onClose: () => void; onCreated: (camp: CampDetails) => void }) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [isSlugEdited, setIsSlugEdited] = useState(false);
  const [logoUrl, setLogoUrl] = useState("");
  const [logoFileName, setLogoFileName] = useState("");
  const [roomTypes, setRoomTypes] = useState(["Villa", "Hostel", "Dormitory"]);
  const [newType, setNewType] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const handleLogoFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoFileName(file.name);

    const compressed = await compressImageFile(file);
    setLogoUrl(compressed);
  };

  const handleNameChange = (val: string) => {
    setName(val);
    if (!isSlugEdited) {
      const generated = val.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
      setSlug(generated);
    }
  };

  const handleSlugChange = (val: string) => {
    setIsSlugEdited(true);
    setSlug(val.toLowerCase().replace(/[^a-z0-9-]/g, ""));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError("Camp name is required."); return; }
    const finalSlug = slug.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    if (!finalSlug || finalSlug.length < 2) {
      setError("Please provide a valid URL slug (at least 2 characters).");
      return;
    }
    setError("");
    startTransition(async () => {
      const res = await createCampAction({ name: name.trim(), slug: finalSlug, logoUrl, roomTypes });
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
              onChange={e => handleNameChange(e.target.value)}
              placeholder="e.g. TACC Youth Camp 2027"
              className="w-full px-3 py-2 bg-white border border-[#d6d3d1] rounded-[6px] text-xs text-[#0c0a09] focus:ring-1 focus:ring-[#3ba6f1] focus:outline-none" />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[#78716c] mb-1">Public URL Slug *</label>
            <div className="flex items-center gap-1.5 px-3 py-2 bg-[#fafaf9] border border-[#d6d3d1] rounded-[6px]">
              <span className="text-xs text-[#a8a29e] shrink-0 font-medium">/camp/</span>
              <input
                type="text"
                required
                value={slug}
                onChange={e => handleSlugChange(e.target.value)}
                placeholder="tacc-youth-camp-2027"
                className="w-full bg-transparent text-xs text-[#0c0a09] font-medium focus:outline-none"
              />
            </div>
            <p className="text-[10px] text-[#a8a29e] mt-1">Public search portal link: <span className="text-[#3398e1] font-medium">/camp/{slug || "your-camp-slug"}</span></p>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[#78716c] mb-1.5">Camp Logo (Optional)</label>
            {logoUrl ? (
              <div className="flex items-center gap-3 p-3 bg-[#fafaf9] border border-[#e8e6e5] rounded-[8px]">
                <img src={logoUrl} alt="Camp logo preview" className="w-10 h-10 object-contain rounded border border-[#e8e6e5] bg-white" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-[#0c0a09] truncate">{logoFileName || "Uploaded Logo"}</div>
                  <div className="text-[10px] text-emerald-600 font-medium">✓ Logo ready</div>
                </div>
                <button
                  type="button"
                  onClick={() => { setLogoUrl(""); setLogoFileName(""); }}
                  className="p-1 text-[#a8a29e] hover:text-red-500 rounded cursor-pointer"
                  title="Remove Logo"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <label className="flex items-center gap-3 p-3.5 bg-[#fafaf9] border border-dashed border-[#d6d3d1] rounded-[8px] cursor-pointer hover:border-[#3ba6f1] transition-colors group">
                <div className="w-9 h-9 rounded bg-white border border-[#e8e6e5] flex items-center justify-center shrink-0">
                  <Upload size={15} className="text-[#a8a29e] group-hover:text-[#3ba6f1] transition-colors" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-medium text-[#0c0a09]">Click to upload logo image</div>
                  <div className="text-[10px] text-[#a8a29e]">PNG, JPG, SVG, WebP up to 5MB</div>
                </div>
                <input type="file" accept="image/*" className="hidden" onChange={handleLogoFile} />
              </label>
            )}
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

// ─── Interactive Public URL Component ─────────────────────────────────────────
function PublicUrlBadge({ slug }: { slug: string }) {
  const [copied, setCopied] = useState(false);
  const publicHref = `/camp/${slug}`;

  const handleCopy = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const fullUrl = `${window.location.origin}${publicHref}`;
    navigator.clipboard.writeText(fullUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="mb-3.5 p-3 bg-[#fafaf9] border border-[#e8e6e5] rounded-[8px] space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider font-semibold text-[#a8a29e]">Public Portal URL</span>
        <button
          onClick={handleCopy}
          className="text-[10px] text-[#78716c] hover:text-[#3ba6f1] cursor-pointer px-2.5 py-0.5 rounded-full bg-white border border-[#e8e6e5] hover:border-[#3ba6f1] transition-colors flex items-center gap-1 font-medium"
          title="Copy link"
        >
          {copied ? <Check size={10} className="text-emerald-600" /> : <Copy size={10} />}
          {copied ? "Copied ✓" : "Copy Link"}
        </button>
      </div>
      <a
        href={publicHref}
        target="_blank"
        rel="noopener noreferrer"
        className="block text-xs font-medium text-[#3398e1] hover:underline break-all group/link leading-relaxed"
        title="Open public camp portal in new tab"
      >
        <span className="inline-flex items-center gap-1.5 flex-wrap">
          <span>{publicHref}</span>
          <ExternalLink size={12} className="shrink-0 text-[#3398e1] inline" />
        </span>
      </a>
    </div>
  );
}

// ─── Camps Page ───────────────────────────────────────────────────────────────
export default function CampsPage() {
  const { isSuperAdmin, campId, switchCamp } = useAdminCtx();
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

  const handleCreated = async (camp: CampDetails) => {
    setShowCreate(false);
    await load();
    // Automatically switch active camp to newly created camp
    switchCamp(camp.id);
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
                className={`bg-white border rounded-[10px] p-5 shadow-[rgba(0,0,0,0.05)_0px_4px_16px_0px] transition-colors flex flex-col justify-between ${isCurrent ? "border-[#3ba6f1] ring-1 ring-[#3ba6f1]" : "border-[#e8e6e5] hover:border-[#d6d3d1]"}`}>

                <div>
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
                      {isCurrent ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#3ba6f1] uppercase tracking-wider">
                          Active Camp ●
                        </span>
                      ) : (
                        <span className="text-[10px] text-[#a8a29e]">Camp Meeting</span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {(camp.room_types || []).slice(0, 3).map(t => (
                      <span key={t} className="text-[10px] px-2 py-0.5 bg-[#fafaf9] border border-[#e8e6e5] rounded-full text-[#78716c]">{t}</span>
                    ))}
                    {(camp.room_types || []).length > 3 && (
                      <span className="text-[10px] px-2 py-0.5 text-[#a8a29e]">+{camp.room_types.length - 3} more</span>
                    )}
                  </div>

                  {/* Unique public URL */}
                  <PublicUrlBadge slug={camp.slug} />
                </div>

                <div className="pt-2">
                  {isCurrent ? (
                    <div className="flex items-center justify-center gap-1.5 w-full py-2 text-xs font-medium rounded-full bg-[#c1e1f7]/30 border border-[#3ba6f1]/30 text-[#3398e1]">
                      <Check size={13} /> Active Camp
                    </div>
                  ) : (
                    <button
                      onClick={() => switchCamp(camp.id)}
                      className="flex items-center justify-center gap-1.5 w-full py-2 text-xs font-medium rounded-full bg-[#3ba6f1] hover:bg-[#3398e1] text-white transition-colors cursor-pointer"
                    >
                      Switch to this Camp
                    </button>
                  )}
                </div>
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
