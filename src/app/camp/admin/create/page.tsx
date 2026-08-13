"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ShieldCheck, Plus, Sparkles, Building2, Upload, ArrowLeft, Loader2, Key } from "lucide-react";
import { createCampAction } from "../../actions";

export default function CreateCampPage() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [roomTypes, setRoomTypes] = useState<string[]>([
    "Wise as Serpents",
    "Villa",
    "Hostel",
    "Dormitory",
  ]);
  const [newRoomType, setNewRoomType] = useState("");
  const [error, setError] = useState("");

  const handleAddRoomType = () => {
    if (newRoomType.trim() && !roomTypes.includes(newRoomType.trim())) {
      setRoomTypes([...roomTypes, newRoomType.trim()]);
      setNewRoomType("");
    }
  };

  const handleRemoveRoomType = (typeToRemove: string) => {
    setRoomTypes(roomTypes.filter((t) => t !== typeToRemove));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !slug) {
      setError("Please provide both Camp Name and URL Slug");
      return;
    }

    setError("");
    startTransition(async () => {
      const res = await createCampAction({
        name,
        slug: slug.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
        logoUrl,
        roomTypes,
      });

      if (res.success && res.camp) {
        // Redirect to secret admin portal URL
        router.push(`/camp/admin/${res.camp.admin_token}`);
      } else if (res.error) {
        setError(res.error);
      } else {
        // Fallback demo redirect
        router.push(`/camp/admin/portal-admin-26`);
      }
    });
  };

  return (
    <div className="min-h-screen bg-[#fafaf9] text-[#78716c] font-sans antialiased p-4 sm:p-6 md:p-8 flex flex-col items-center justify-center">
      <div className="w-full max-w-[600px] bg-white border border-[#e8e6e5] rounded-[10px] p-6 sm:p-10 shadow-[rgba(0,0,0,0.05)_0px_4px_16px_0px]">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#e8e6e5] pb-6 mb-6">
          <div className="flex items-center gap-3">
            <Link
              href="/camp"
              className="p-2 rounded-full border border-[#e8e6e5] bg-[#fafaf9] hover:bg-white text-[#78716c] hover:text-[#0c0a09] transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div>
              <div className="text-xs uppercase tracking-wider text-[#a8a29e] font-semibold flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-[#3ba6f1]" />
                Camp Admin Setup
              </div>
              <h1 className="font-display font-normal text-2xl text-[#0c0a09] tracking-tight mt-0.5">
                Create New Camp Meeting
              </h1>
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-md">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Camp Name */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[#78716c] mb-1.5">
              Camp Meeting Name *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. TACC Youth Camp 2026"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!slug) {
                  setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, "-"));
                }
              }}
              className="w-full px-3.5 py-2.5 bg-white border border-[#d6d3d1] rounded-[6px] text-sm text-[#0c0a09] focus:outline-none focus:ring-2 focus:ring-[#3ba6f1]"
            />
          </div>

          {/* URL Slug */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[#78716c] mb-1.5">
              URL Slug *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. tacc-youth-2026"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-white border border-[#d6d3d1] rounded-[6px] text-sm font-mono text-[#0c0a09] focus:outline-none focus:ring-2 focus:ring-[#3ba6f1]"
            />
          </div>

          {/* Camp Logo File Upload */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[#78716c] mb-1.5">
              Camp Logo (Optional)
            </label>
            {logoUrl ? (
              <div className="flex items-center gap-3 p-3 bg-[#fafaf9] border border-[#e8e6e5] rounded-[8px]">
                <img src={logoUrl} alt="Camp logo preview" className="w-10 h-10 object-contain rounded border border-[#e8e6e5] bg-white" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-[#0c0a09] truncate">Camp Logo Loaded</div>
                  <div className="text-[10px] text-emerald-600 font-medium">✓ Image ready</div>
                </div>
                <button
                  type="button"
                  onClick={() => setLogoUrl("")}
                  className="p-1 text-[#a8a29e] hover:text-red-500 rounded cursor-pointer"
                  title="Remove Logo"
                >
                  <Upload size={14} />
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
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                      if (ev.target?.result) setLogoUrl(ev.target.result as string);
                    };
                    reader.readAsDataURL(file);
                  }}
                />
              </label>
            )}
          </div>

          {/* Room Types Customization */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[#78716c] mb-1.5">
              Room Categories / Types
            </label>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                placeholder="Add new room type (e.g. Executive Suite)"
                value={newRoomType}
                onChange={(e) => setNewRoomType(e.target.value)}
                className="flex-1 px-3.5 py-2 bg-white border border-[#d6d3d1] rounded-[6px] text-sm text-[#0c0a09] focus:outline-none focus:ring-2 focus:ring-[#3ba6f1]"
              />
              <button
                type="button"
                onClick={handleAddRoomType}
                className="px-4 py-2 bg-[#fafaf9] border border-[#e8e6e5] text-[#0c0a09] hover:bg-[#e8e6e5] text-xs font-medium rounded-full transition-colors"
              >
                Add
              </button>
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              {roomTypes.map((type) => (
                <span
                  key={type}
                  className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#fafaf9] border border-[#e8e6e5] text-xs font-medium text-[#0c0a09] rounded-full"
                >
                  {type}
                  <button
                    type="button"
                    onClick={() => handleRemoveRoomType(type)}
                    className="text-[#a8a29e] hover:text-red-500 font-bold ml-1"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>

          {/* Submit CTA */}
          <div className="pt-4 flex justify-end gap-3 border-t border-[#e8e6e5]">
            <Link
              href="/camp"
              className="px-5 py-2.5 text-xs font-medium text-[#78716c] bg-[#fafaf9] border border-[#e8e6e5] rounded-full hover:text-[#0c0a09] transition-colors"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={isPending}
              className="px-6 py-2.5 bg-[#3ba6f1] hover:bg-[#3398e1] text-white text-xs font-medium rounded-full shadow-[rgba(0,0,0,0.05)_0px_4px_16px_0px] transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isPending ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Creating Camp...
                </>
              ) : (
                <>
                  <Plus className="w-3.5 h-3.5" /> Create Camp & Secret Portal
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
