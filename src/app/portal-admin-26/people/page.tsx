"use client";

import React, { useState, useEffect, useTransition, useRef } from "react";
import {
  Search, Plus, Upload, Trash2, Send, CheckCircle2, Loader2, X, RefreshCw, ChevronDown
} from "lucide-react";
import {
  getAdminAttendees, addAttendeeAction, deleteAttendeeAction,
  bulkUploadAttendeesAction, sendRoomAssignmentSMSAction,
  getFellowshipNames, AttendeeAdmin
} from "../../camp/actions";
import { useAdminCtx } from "../AdminShell";

// ─── Fellowship Combobox ──────────────────────────────────────────────────────
function FellowshipCombobox({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: string[] }) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState(value);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => { setFilter(value); }, [value]);
  useEffect(() => {
    function handleClick(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const filtered = options.filter(o => o.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <input
          type="text"
          value={filter}
          placeholder="e.g. Youth Ablaze"
          onFocus={() => setOpen(true)}
          onChange={e => { setFilter(e.target.value); onChange(e.target.value); setOpen(true); }}
          className="w-full px-3 py-2 pr-8 bg-white border border-[#d6d3d1] rounded-[6px] text-xs text-[#0c0a09] focus:ring-1 focus:ring-[#3ba6f1] focus:outline-none"
        />
        <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#a8a29e] pointer-events-none" />
      </div>
      {open && (
        <div className="absolute z-30 mt-1 w-full bg-white border border-[#e8e6e5] rounded-[8px] shadow-[rgba(0,0,0,0.05)_0px_4px_16px_0px] max-h-44 overflow-y-auto">
          {filtered.map(opt => (
            <button key={opt} type="button"
              onClick={() => { onChange(opt); setFilter(opt); setOpen(false); }}
              className="w-full text-left px-3 py-2 text-xs text-[#0c0a09] hover:bg-[#fafaf9] transition-colors">
              {opt}
            </button>
          ))}
          {filter && !options.find(o => o.toLowerCase() === filter.toLowerCase()) && (
            <button type="button"
              onClick={() => { onChange(filter); setOpen(false); }}
              className="w-full text-left px-3 py-2 text-xs text-[#3398e1] border-t border-[#e8e6e5] hover:bg-[#fafaf9]">
              + Create "{filter}"
            </button>
          )}
          {filtered.length === 0 && !filter && (
            <div className="px-3 py-3 text-xs text-[#a8a29e]">No fellowships yet — type to create one.</div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Add Person Modal ─────────────────────────────────────────────────────────
function AddPersonModal({ onClose, onAdded, campId, fellowships }: { onClose: () => void; onAdded: () => void; campId: string; fellowships: string[] }) {
  const [fullName, setFullName] = useState("");
  const [fellowship, setFellowship] = useState("");
  const [phone, setPhone] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !fellowship.trim()) { setError("Full name and fellowship are required."); return; }
    setError("");
    startTransition(async () => {
      const res = await addAttendeeAction({ campId, fullName: fullName.trim(), fellowship: fellowship.trim(), phoneNumber: phone });
      if (res.success) { onAdded(); onClose(); }
      else setError(res.error || "Failed to add person.");
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/25 backdrop-blur-xs">
      <div className="bg-white border border-[#e8e6e5] rounded-[10px] shadow-[rgba(17,12,46,0.12)_0px_12px_45px_0px] w-full max-w-[440px]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#e8e6e5] bg-[#fafaf9] rounded-t-[10px]">
          <h2 className="font-display font-medium text-base text-[#0c0a09]">Add Person</h2>
          <button onClick={onClose} className="text-[#a8a29e] hover:text-[#0c0a09] cursor-pointer"><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[#78716c] mb-1">Full Name *</label>
            <input type="text" required value={fullName} onChange={e => setFullName(e.target.value)} placeholder="e.g. Kwame Mensah"
              className="w-full px-3 py-2 bg-white border border-[#d6d3d1] rounded-[6px] text-xs text-[#0c0a09] focus:ring-1 focus:ring-[#3ba6f1] focus:outline-none" />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[#78716c] mb-1">Fellowship *</label>
            <FellowshipCombobox value={fellowship} onChange={setFellowship} options={fellowships} />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[#78716c] mb-1">Phone Number</label>
            <input type="text" value={phone} onChange={e => setPhone(e.target.value)} placeholder="e.g. 0550076503"
              className="w-full px-3 py-2 font-mono bg-white border border-[#d6d3d1] rounded-[6px] text-xs text-[#0c0a09] focus:ring-1 focus:ring-[#3ba6f1] focus:outline-none" />
            <p className="text-[10px] text-[#a8a29e] mt-1">Room assignment is done from the Rooms page.</p>
          </div>
          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-100 p-2 rounded">{error}</p>}
          <div className="flex justify-end gap-2 pt-2 border-t border-[#e8e6e5]">
            <button type="button" onClick={onClose} className="px-4 py-1.5 text-xs font-medium text-[#78716c] bg-[#fafaf9] border border-[#e8e6e5] rounded-full cursor-pointer">Cancel</button>
            <button type="submit" disabled={isPending} className="px-5 py-1.5 bg-[#3ba6f1] text-white text-xs font-medium rounded-full cursor-pointer disabled:opacity-50">
              {isPending ? "Saving..." : "Save Person"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── CSV Upload Modal ─────────────────────────────────────────────────────────
function CsvModal({ onClose, onUploaded, campId }: { onClose: () => void; onUploaded: () => void; campId: string }) {
  const [csvText, setCsvText] = useState("");
  const [preview, setPreview] = useState<any[]>([]);
  const [isPending, startTransition] = useTransition();

  const parse = (text: string) => {
    setCsvText(text);
    const lines = text.trim().split("\n");
    if (lines.length < 2) { setPreview([]); return; }
    const rows: any[] = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(",").map(c => c.trim());
      if (cols[0]) rows.push({ full_name: cols[0], fellowship: cols[1] || "General", room_type: cols[2], room_number: cols[3], phone_number: cols[4] });
    }
    setPreview(rows);
  };

  const handleUpload = () => {
    if (!preview.length) return;
    startTransition(async () => {
      await bulkUploadAttendeesAction(campId, preview);
      onUploaded(); onClose();
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/25 backdrop-blur-xs">
      <div className="bg-white border border-[#e8e6e5] rounded-[10px] shadow-[rgba(17,12,46,0.12)_0px_12px_45px_0px] w-full max-w-[560px]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#e8e6e5] bg-[#fafaf9] rounded-t-[10px]">
          <h2 className="font-display font-medium text-base text-[#0c0a09]">Upload CSV</h2>
          <button onClick={onClose} className="text-[#a8a29e] hover:text-[#0c0a09] cursor-pointer"><X size={16} /></button>
        </div>
        <div className="p-5 space-y-3 max-h-[70vh] overflow-y-auto">
          <div className="text-[11px] font-mono bg-[#fafaf9] border border-[#e8e6e5] p-2.5 rounded text-[#78716c]">
            full_name, fellowship, room_type, room_number, phone_number
          </div>
          <textarea rows={5} value={csvText} onChange={e => parse(e.target.value)}
            placeholder={"Kwame Mensah,Youth Ablaze,Villa,V-102,0550076503"}
            className="w-full px-3 py-2 font-mono bg-white border border-[#d6d3d1] rounded-[6px] text-xs text-[#0c0a09] focus:ring-1 focus:ring-[#3ba6f1] focus:outline-none" />
          {preview.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-[#0c0a09] mb-1">{preview.length} rows detected</div>
              <div className="max-h-36 overflow-y-auto border border-[#e8e6e5] rounded divide-y divide-[#fafaf9]">
                {preview.map((r, i) => (
                  <div key={i} className="px-3 py-1.5 flex justify-between text-[11px]">
                    <span className="font-medium text-[#0c0a09]">{r.full_name}</span>
                    <span className="text-[#78716c]">{r.fellowship} {r.room_number && `· ${r.room_number}`}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2 border-t border-[#e8e6e5]">
            <button type="button" onClick={onClose} className="px-4 py-1.5 text-xs font-medium text-[#78716c] bg-[#fafaf9] border border-[#e8e6e5] rounded-full cursor-pointer">Cancel</button>
            <button type="button" disabled={!preview.length || isPending} onClick={handleUpload}
              className="px-5 py-1.5 bg-[#3ba6f1] text-white text-xs font-medium rounded-full cursor-pointer disabled:opacity-50">
              {isPending ? "Uploading..." : `Upload ${preview.length} People`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── People Page ──────────────────────────────────────────────────────────────
export default function PeoplePage() {
  const { campId } = useAdminCtx();
  const [attendees, setAttendees] = useState<AttendeeAdmin[]>([]);
  const [fellowships, setFellowships] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "unassigned">("all");
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [showCsv, setShowCsv] = useState(false);
  const [smsMap, setSmsMap] = useState<Record<string, "sending" | "sent" | "error">>({});
  const [isPending, startTransition] = useTransition();

  const load = async () => {
    const [atts, fships] = await Promise.all([getAdminAttendees(campId), getFellowshipNames(campId)]);
    setAttendees(atts);
    setFellowships(fships);
    setLoading(false);
  };

  useEffect(() => { load(); }, [campId]);

  const handleDelete = (id: string, name: string) => {
    if (!confirm(`Remove ${name}?`)) return;
    startTransition(async () => { await deleteAttendeeAction(id); await load(); });
  };

  const handleSMS = (att: AttendeeAdmin) => {
    setSmsMap(m => ({ ...m, [att.id]: "sending" }));
    startTransition(async () => {
      const res = await sendRoomAssignmentSMSAction({ name: att.full_name, roomNumber: att.room_number || "TBD", roomType: att.room_type || "", keyBearer: att.key_bearer || "TBD", phoneNumber: att.phone_number || "0550076503" });
      setSmsMap(m => ({ ...m, [att.id]: res.success ? "sent" : "error" }));
    });
  };

  const filtered = attendees.filter(a => {
    const matchSearch = a.full_name.toLowerCase().includes(search.toLowerCase()) || a.fellowship.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === "all" || !a.room_number;
    return matchSearch && matchFilter;
  });

  return (
    <div className="p-5 sm:p-8 max-w-[960px]">
      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <div className="text-xs uppercase tracking-wider text-[#a8a29e] font-semibold mb-1">Directory</div>
          <h1 className="font-display font-normal text-[28px] text-[#0c0a09] tracking-tight">People</h1>
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          <button onClick={() => setShowCsv(true)} className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-transparent border border-[#d6d3d1] text-[#0c0a09] text-xs font-medium rounded-full hover:bg-white transition-colors cursor-pointer">
            <Upload size={13} /> CSV
          </button>
          <button onClick={() => setShowAdd(true)} className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#3ba6f1] hover:bg-[#3398e1] text-white text-xs font-medium rounded-full shadow-sm transition-all cursor-pointer">
            <Plus size={13} /> Add Person
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2.5 mb-5">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#a8a29e]" />
          <input type="text" placeholder="Search by name or fellowship..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-white border border-[#d6d3d1] rounded-[6px] text-xs text-[#0c0a09] focus:ring-1 focus:ring-[#3ba6f1] focus:outline-none" />
        </div>
        <div className="flex gap-1.5">
          {(["all", "unassigned"] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors cursor-pointer capitalize ${filter === f ? "bg-[#0c0a09] text-white border-[#0c0a09]" : "bg-white text-[#78716c] border-[#e8e6e5] hover:border-[#d6d3d1]"}`}>
              {f}
            </button>
          ))}
        </div>
        <button onClick={load} className="p-2 text-[#78716c] hover:text-[#0c0a09] hover:bg-white border border-transparent hover:border-[#e8e6e5] rounded-full transition-colors cursor-pointer" title="Refresh">
          <RefreshCw size={14} />
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 size={22} className="text-[#3ba6f1] animate-spin" /></div>
      ) : (
        <div className="bg-white border border-[#e8e6e5] rounded-[10px] shadow-[rgba(0,0,0,0.05)_0px_4px_16px_0px] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs whitespace-nowrap">
              <thead>
                <tr className="border-b border-[#e8e6e5] bg-[#fafaf9] text-[#78716c]">
                  <th className="p-3 pl-5 font-medium">Name</th>
                  <th className="p-3 font-medium">Fellowship</th>
                  <th className="p-3 font-medium">Room</th>
                  <th className="p-3 pr-5 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#fafaf9]">
                {filtered.length === 0 ? (
                  <tr><td colSpan={4} className="py-10 text-center text-xs text-[#a8a29e]">No people found.</td></tr>
                ) : filtered.map(att => {
                  const sms = smsMap[att.id];
                  return (
                    <tr key={att.id} className="hover:bg-[#fafaf9] transition-colors text-[#0c0a09]">
                      <td className="p-3 pl-5 font-medium text-sm">{att.full_name}</td>
                      <td className="p-3 text-[#78716c]">{att.fellowship}</td>
                      <td className="p-3">
                        {att.room_number
                          ? <span className="font-mono font-semibold">{att.room_number} <span className="font-normal text-[#a8a29e] ml-1">{att.room_type}</span></span>
                          : <span className="text-amber-600 text-[11px] font-medium bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">Unassigned</span>}
                      </td>
                      <td className="p-3 pr-5 text-right">
                        <div className="inline-flex items-center gap-2">
                          {att.room_number && (
                            <button onClick={() => handleSMS(att)} disabled={sms === "sending"}
                              className={`inline-flex items-center gap-1 px-3 py-1 text-[11px] font-medium rounded-full transition-colors cursor-pointer ${sms === "sent" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : sms === "error" ? "bg-red-50 text-red-600 border border-red-200" : "bg-[#3ba6f1] text-white hover:bg-[#3398e1]"}`}>
                              {sms === "sending" ? <Loader2 size={10} className="animate-spin" /> : sms === "sent" ? <CheckCircle2 size={10} /> : <Send size={10} />}
                              {sms === "sending" ? "..." : sms === "sent" ? "Sent" : "SMS"}
                            </button>
                          )}
                          <button onClick={() => handleDelete(att.id, att.full_name)}
                            className="p-1.5 text-[#a8a29e] hover:text-red-500 hover:bg-red-50 rounded transition-colors cursor-pointer">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-5 py-2.5 border-t border-[#e8e6e5] text-[11px] text-[#a8a29e]">
            {filtered.length} of {attendees.length} people shown
          </div>
        </div>
      )}

      {showAdd && <AddPersonModal onClose={() => setShowAdd(false)} onAdded={load} campId={campId} fellowships={fellowships} />}
      {showCsv && <CsvModal onClose={() => setShowCsv(false)} onUploaded={load} campId={campId} />}
    </div>
  );
}
