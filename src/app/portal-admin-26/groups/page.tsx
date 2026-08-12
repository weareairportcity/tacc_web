"use client";

import React, { useState, useEffect, useTransition } from "react";
import Link from "next/link";
import { Layers, Upload, Trash2, Loader2, X, Users, ArrowRight, CheckCircle2 } from "lucide-react";
import { getGroupsAction, importGroupsFromCSVAction, deleteGroupAction, Group } from "../../camp/actions";
import { useAdminCtx } from "../AdminShell";

// ─── Room type detection from filename ────────────────────────────────────────
const KNOWN_ROOM_TYPES = ["Villa", "Hostel", "Dormitory", "Wise as Serpents"];

function detectRoomTypeFromFilename(name: string): string {
  const lower = name.toLowerCase().replace(/[_\-\.]/g, " ");
  for (const rt of KNOWN_ROOM_TYPES) {
    if (lower.includes(rt.toLowerCase())) return rt;
  }
  return "";
}

// ─── CSV Import Modal ─────────────────────────────────────────────────────────
function CsvImportModal({ onClose, onImported, campId }: {
  onClose: () => void; onImported: () => void; campId: string;
}) {
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<any[]>([]);
  const [roomType, setRoomType] = useState("");
  const [detectedType, setDetectedType] = useState("");
  const [parseError, setParseError] = useState("");
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ groupsCreated: number; peopleCreated: number } | null>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const detected = detectRoomTypeFromFilename(file.name);
    setDetectedType(detected);
    setRoomType(detected);
    setParseError("");
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const lines = text.trim().split("\n");
      if (lines.length < 2) { setParseError("CSV must have a header row and at least one data row."); return; }
      const header = lines[0].split(",").map(h => h.trim().toLowerCase());
      const nameIdx = header.findIndex(h => h.includes("name"));
      const fellowshipIdx = header.findIndex(h => h.includes("fellowship") || h.includes("group_name") || h.includes("church"));
      const groupIdx = header.findIndex(h => h.includes("group_id") || h.includes("group id") || h.includes("pair") || h.includes("group"));
      const phoneIdx = header.findIndex(h => h.includes("phone") || h.includes("tel") || h.includes("mobile"));

      if (nameIdx === -1) { setParseError("Could not find a 'name' column."); return; }
      if (groupIdx === -1) { setParseError("Could not find a 'group_id' column."); return; }

      const parsed: any[] = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(",").map(c => c.trim());
        if (!cols[nameIdx]) continue;
        parsed.push({
          full_name: cols[nameIdx],
          fellowship: fellowshipIdx >= 0 ? cols[fellowshipIdx] : "General",
          group_id: cols[groupIdx] || String(i),
          phone_number: phoneIdx >= 0 ? cols[phoneIdx] : "",
        });
      }
      setRows(parsed);
    };
    reader.readAsText(file);
  };

  const handleImport = () => {
    if (!rows.length) return;
    if (!roomType) { setParseError("Please select a room type."); return; }
    startTransition(async () => {
      const res = await importGroupsFromCSVAction(campId, rows, roomType);
      if (res.success) {
        setResult({ groupsCreated: res.groupsCreated, peopleCreated: res.peopleCreated });
        onImported();
      }
    });
  };

  // Count groups
  const uniqueGroups = [...new Set(rows.map(r => r.group_id))];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/25 backdrop-blur-xs">
      <div className="bg-white border border-[#e8e6e5] rounded-[10px] shadow-[rgba(17,12,46,0.12)_0px_12px_45px_0px] w-full max-w-[520px]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#e8e6e5] bg-[#fafaf9] rounded-t-[10px]">
          <h2 className="font-display font-medium text-base text-[#0c0a09]">Import Groups from CSV</h2>
          <button onClick={onClose} className="text-[#a8a29e] hover:text-[#0c0a09] cursor-pointer"><X size={16} /></button>
        </div>

        <div className="p-5 space-y-4">
          {result ? (
            <div className="py-6 flex flex-col items-center text-center gap-3">
              <CheckCircle2 size={32} className="text-emerald-500" />
              <div>
                <div className="text-sm font-medium text-[#0c0a09]">Import Complete</div>
                <div className="text-xs text-[#78716c] mt-1">
                  {result.groupsCreated} groups · {result.peopleCreated} people added
                </div>
              </div>
              <button onClick={onClose} className="px-5 py-2 bg-[#3ba6f1] text-white text-xs font-medium rounded-full cursor-pointer mt-2 hover:bg-[#3398e1] transition-colors">
                Done
              </button>
            </div>
          ) : (
            <>
              {/* File picker */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[#78716c] mb-2">CSV File</label>
                <div className="text-[10px] font-mono bg-[#fafaf9] border border-[#e8e6e5] p-2 rounded mb-2 text-[#78716c]">
                  full_name, fellowship, group_id, phone_number
                </div>
                <label className="flex items-center gap-3 p-3 bg-[#fafaf9] border border-dashed border-[#d6d3d1] rounded-[8px] cursor-pointer hover:border-[#3ba6f1] transition-colors group">
                  <div className="w-9 h-9 rounded bg-white border border-[#e8e6e5] flex items-center justify-center shrink-0">
                    <Upload size={15} className="text-[#a8a29e] group-hover:text-[#3ba6f1] transition-colors" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-[#0c0a09]">{fileName || "Click to choose a CSV file"}</div>
                    {!fileName && <div className="text-[10px] text-[#a8a29e]">The filename can contain the room type (e.g. "Villa_groups.csv")</div>}
                  </div>
                  <input type="file" accept=".csv,text/csv" className="hidden" onChange={handleFile} />
                </label>
              </div>

              {/* Room type selector */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[#78716c] mb-1.5">Room Type for this Group</label>
                {detectedType && (
                  <p className="text-[10px] text-[#3398e1] mb-1.5">
                    ✓ Detected <strong>{detectedType}</strong> from filename
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  {KNOWN_ROOM_TYPES.map(t => (
                    <button key={t} type="button" onClick={() => setRoomType(t)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors cursor-pointer ${roomType === t ? "bg-[#0c0a09] text-white border-[#0c0a09]" : "bg-white text-[#78716c] border-[#e8e6e5] hover:border-[#d6d3d1]"}`}>
                      {t}
                    </button>
                  ))}
                </div>
                <input type="text" value={roomType} onChange={e => setRoomType(e.target.value)}
                  placeholder="Or type a custom room type..."
                  className="w-full mt-2 px-3 py-1.5 bg-white border border-[#d6d3d1] rounded-[6px] text-xs text-[#0c0a09] focus:ring-1 focus:ring-[#3ba6f1] focus:outline-none" />
              </div>

              {/* Preview */}
              {rows.length > 0 && (
                <div className="bg-[#fafaf9] border border-[#e8e6e5] rounded-[8px] p-3">
                  <div className="text-xs font-medium text-[#0c0a09] mb-2">
                    {uniqueGroups.length} groups · {rows.length} people
                  </div>
                  <div className="max-h-36 overflow-y-auto divide-y divide-[#e8e6e5]">
                    {uniqueGroups.slice(0, 8).map(gid => {
                      const members = rows.filter(r => r.group_id === gid);
                      return (
                        <div key={gid} className="py-1.5 flex items-center justify-between">
                          <div className="text-[11px] font-mono text-[#a8a29e]">Group {gid}</div>
                          <div className="text-[11px] text-[#0c0a09]">{members.map((m: any) => m.full_name).join(", ")}</div>
                        </div>
                      );
                    })}
                    {uniqueGroups.length > 8 && (
                      <div className="py-1.5 text-[11px] text-[#a8a29e]">+{uniqueGroups.length - 8} more groups…</div>
                    )}
                  </div>
                </div>
              )}

              {parseError && <p className="text-xs text-red-600 bg-red-50 border border-red-100 p-2 rounded">{parseError}</p>}

              <div className="flex justify-end gap-2 pt-2 border-t border-[#e8e6e5]">
                <button type="button" onClick={onClose} className="px-4 py-1.5 text-xs font-medium text-[#78716c] bg-[#fafaf9] border border-[#e8e6e5] rounded-full cursor-pointer">Cancel</button>
                <button type="button" disabled={!rows.length || !roomType || isPending} onClick={handleImport}
                  className="px-5 py-1.5 bg-[#3ba6f1] text-white text-xs font-medium rounded-full cursor-pointer disabled:opacity-50 hover:bg-[#3398e1] transition-colors flex items-center gap-1.5">
                  {isPending ? <><Loader2 size={12} className="animate-spin" /> Importing…</> : `Import ${uniqueGroups.length} Groups`}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Groups Page ──────────────────────────────────────────────────────────────
export default function GroupsPage() {
  const { campId } = useAdminCtx();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [showImport, setShowImport] = useState(false);
  const [isPending, startTransition] = useTransition();

  const load = async () => {
    const g = await getGroupsAction(campId);
    setGroups(g);
    setLoading(false);
  };

  useEffect(() => { load(); }, [campId]);

  const handleDelete = (groupId: string, groupNumber: number) => {
    if (!confirm(`Delete Group ${groupNumber} and all its members?`)) return;
    startTransition(async () => { await deleteGroupAction(groupId); await load(); });
  };

  const assigned = groups.filter(g => g.room_id);
  const unassigned = groups.filter(g => !g.room_id);

  const TYPE_COLORS: Record<string, string> = {
    "Villa": "text-violet-700 bg-violet-50 border-violet-200",
    "Hostel": "text-sky-700 bg-sky-50 border-sky-200",
    "Dormitory": "text-amber-700 bg-amber-50 border-amber-200",
    "Wise as Serpents": "text-emerald-700 bg-emerald-50 border-emerald-200",
  };

  return (
    <div className="p-5 sm:p-8 max-w-[960px]">
      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <div className="text-xs uppercase tracking-wider text-[#a8a29e] font-semibold mb-1">Assignment</div>
          <h1 className="font-display font-normal text-[28px] text-[#0c0a09] tracking-tight">Groups</h1>
          <p className="text-xs text-[#78716c] mt-1">Import pairings from CSV, then assign rooms to each group.</p>
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          {groups.length > 0 && (
            <Link href="/portal-admin-26/groups/assign"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-transparent border border-[#d6d3d1] text-[#0c0a09] text-xs font-medium rounded-full hover:bg-white transition-all cursor-pointer">
              Assign Rooms <ArrowRight size={13} />
            </Link>
          )}
          <button onClick={() => setShowImport(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#3ba6f1] hover:bg-[#3398e1] text-white text-xs font-medium rounded-full shadow-sm cursor-pointer transition-all">
            <Upload size={13} /> Import CSV
          </button>
        </div>
      </div>

      {/* Stats */}
      {groups.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { label: "Total Groups", value: groups.length },
            { label: "Assigned", value: assigned.length, color: "text-emerald-600" },
            { label: "Unassigned", value: unassigned.length, color: unassigned.length > 0 ? "text-amber-600" : "text-[#a8a29e]" },
          ].map(s => (
            <div key={s.label} className="bg-white border border-[#e8e6e5] rounded-[10px] p-4 shadow-[rgba(0,0,0,0.05)_0px_4px_16px_0px]">
              <div className="text-[10px] uppercase tracking-wider text-[#a8a29e] font-semibold mb-1">{s.label}</div>
              <div className={`font-display font-normal text-2xl ${s.color || "text-[#0c0a09]"}`}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 size={22} className="text-[#3ba6f1] animate-spin" /></div>
      ) : groups.length === 0 ? (
        <div className="bg-white border border-[#e8e6e5] rounded-[10px] p-12 text-center shadow-[rgba(0,0,0,0.05)_0px_4px_16px_0px]">
          <Layers size={28} className="text-[#a8a29e] mx-auto mb-3" />
          <p className="text-sm font-medium text-[#0c0a09] mb-1">No groups yet</p>
          <p className="text-xs text-[#78716c] mb-4">Import a CSV file to create groups from existing pairings.</p>
          <button onClick={() => setShowImport(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#3ba6f1] text-white text-xs font-medium rounded-full cursor-pointer hover:bg-[#3398e1] transition-colors">
            <Upload size={13} /> Import CSV
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Unassigned groups */}
          {unassigned.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <div className="text-xs font-semibold text-[#0c0a09]">Unassigned ({unassigned.length})</div>
                <Link href="/portal-admin-26/groups/assign" className="text-xs text-[#3398e1] hover:underline flex items-center gap-1">
                  Assign rooms <ArrowRight size={11} />
                </Link>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {unassigned.map(group => (
                  <GroupCard key={group.id} group={group} typeColors={TYPE_COLORS} onDelete={() => handleDelete(group.id, group.group_number)} />
                ))}
              </div>
            </div>
          )}

          {/* Assigned groups */}
          {assigned.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-[#0c0a09] mb-2.5">Assigned ({assigned.length})</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {assigned.map(group => (
                  <GroupCard key={group.id} group={group} typeColors={TYPE_COLORS} onDelete={() => handleDelete(group.id, group.group_number)} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {showImport && <CsvImportModal onClose={() => setShowImport(false)} onImported={load} campId={campId} />}
    </div>
  );
}

function GroupCard({ group, typeColors, onDelete }: { group: Group; typeColors: Record<string, string>; onDelete: () => void }) {
  const typeColor = typeColors[group.room_type_preference || ""] || "text-[#78716c] bg-[#fafaf9] border-[#e8e6e5]";
  return (
    <div className={`bg-white border rounded-[10px] p-4 shadow-[rgba(0,0,0,0.05)_0px_4px_16px_0px] transition-colors ${group.room_id ? "border-emerald-200" : "border-[#e8e6e5] hover:border-[#d6d3d1]"}`}>
      <div className="flex items-start justify-between mb-2">
        <div className="font-display font-normal text-xl text-[#0c0a09]">Group {group.group_number}</div>
        <button onClick={onDelete} className="p-1.5 text-[#a8a29e] hover:text-red-500 hover:bg-red-50 rounded transition-colors cursor-pointer">
          <Trash2 size={12} />
        </button>
      </div>
      {group.room_type_preference && (
        <span className={`inline-block text-[10px] font-medium border px-2 py-0.5 rounded-full mb-2 ${typeColor}`}>{group.room_type_preference}</span>
      )}
      <div className="text-[11px] text-[#78716c] flex items-center gap-1 mb-2">
        <Users size={11} /> {group.members?.length || 0} {(group.members?.length || 0) === 1 ? "person" : "people"}
      </div>
      {group.members && group.members.slice(0, 3).map(m => (
        <div key={m.id} className="text-[11px] text-[#a8a29e] truncate">{m.full_name}</div>
      ))}
      {(group.members?.length || 0) > 3 && (
        <div className="text-[10px] text-[#a8a29e]">+{(group.members?.length || 0) - 3} more</div>
      )}
      {group.room_id && (
        <div className="mt-2 pt-2 border-t border-[#e8e6e5] flex items-center gap-1 text-[11px] text-emerald-700">
          <CheckCircle2 size={11} /> Assigned
        </div>
      )}
    </div>
  );
}
