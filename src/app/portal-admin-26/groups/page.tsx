"use client";

import React, { useState, useEffect, useTransition } from "react";
import Link from "next/link";
import { Layers, Upload, Trash2, Loader2, X, Users, ArrowRight, CheckCircle2 } from "lucide-react";
import { getGroupsAction, importGroupsFromCSVAction, deleteGroupAction, getCampsList, Group } from "../../camp/actions";
import { useAdminCtx } from "../AdminShell";


// ─── CSV Import Modal ─────────────────────────────────────────────────────────
function CsvImportModal({ onClose, onImported, campId, roomTypes }: {
  onClose: () => void; onImported: () => void; campId: string; roomTypes: string[];
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
    setParseError("");
    setRows([]);

    // Detect room type from filename using the camp's actual room types
    const detected = roomTypes.find(rt => file.name.toLowerCase().includes(rt.toLowerCase())) || "";
    setDetectedType(detected);
    setRoomType(detected);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const rawLines = text.split("\n");

      // Step 1: Find real header row — scan up to 30 rows for one containing NAME
      let headerRowIdx = -1;
      for (let i = 0; i < Math.min(rawLines.length, 30); i++) {
        const cols = rawLines[i].split(",").map(c => c.trim().replace(/^"|"$/g, "").toUpperCase());
        if (cols.includes("NAME")) { headerRowIdx = i; break; }
      }
      if (headerRowIdx === -1) { setParseError("Could not find a header row with a NAME column in the first 30 rows."); return; }

      // Step 2: Map column indices
      const hdr = rawLines[headerRowIdx].split(",").map(c => c.trim().replace(/^"|"$/g, "").toUpperCase());
      const col = (name: string, ...aliases: string[]) => {
        for (const a of [name, ...aliases]) { const i = hdr.findIndex(h => h === a || h.replace(/\s+/g, "") === a.replace(/\s+/g, "")); if (i >= 0) return i; }
        return -1;
      };
      const noIdx      = col("NO.", "NO", "#");
      const nameIdx    = col("NAME", "FULL NAME", "FULLNAME");
      const contactIdx = col("CONTACT", "PHONE", "MOBILE", "TEL");
      const fellowIdx  = col("FELLOWSHIP", "CHURCH", "PCF");
      const pfccIdx    = col("PFCC");
      const genderIdx  = col("GENDER", "SEX");
      const arrivalIdx = col("DAY OF ARRIVAL", "DAYOFARRIVAL", "ARRIVAL");

      if (nameIdx === -1) { setParseError("Found header row but could not locate NAME column."); return; }

      // Step 3: Parse rows — detect pairings by NO. resetting to 1
      const SKIP_LABELS = new Set(["PAIRINGS", "FEMALE", "MALE", "SECTION", ""]);
      const parsed: any[] = [];
      let groupCounter = 0;
      let prevNo = 0;

      for (let i = headerRowIdx + 1; i < rawLines.length; i++) {
        const line = rawLines[i].trim();
        if (!line) { prevNo = 0; continue; } // blank line = section separator

        const cols = line.split(",").map(c => c.trim().replace(/^"|"$/g, ""));
        const name = cols[nameIdx]?.trim() || "";
        if (!name || SKIP_LABELS.has(name.toUpperCase())) continue;

        const currentNo = noIdx >= 0 ? parseInt(cols[noIdx]) || 0 : 0;
        // New pairing group when NO. resets to 1
        if (currentNo === 1 || (prevNo > 0 && currentNo <= prevNo && currentNo !== 0)) groupCounter++;
        else if (groupCounter === 0) groupCounter = 1;
        prevNo = currentNo;

        parsed.push({
          full_name: name,
          fellowship: fellowIdx >= 0 ? cols[fellowIdx]?.trim() || "General" : "General",
          phone_number: contactIdx >= 0 ? cols[contactIdx]?.trim() || "" : "",
          pfcc: pfccIdx >= 0 ? cols[pfccIdx]?.trim() || "" : "",
          gender: genderIdx >= 0 ? cols[genderIdx]?.trim() || "" : "",
          day_of_arrival: arrivalIdx >= 0 ? cols[arrivalIdx]?.trim() || "" : "",
          group_id: String(groupCounter), // derived from NO. column reset
        });
      }

      if (parsed.length === 0) { setParseError("No valid data rows found after the header."); return; }
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
                <div className="text-[10px] font-mono bg-[#fafaf9] border border-[#e8e6e5] p-2 rounded mb-2 text-[#78716c] leading-relaxed">
                  NO. · NAME · CONTACT · FELLOWSHIP · GENDER · DAY OF ARRIVAL · PFCC
                </div>
                <label className="flex items-center gap-3 p-3 bg-[#fafaf9] border border-dashed border-[#d6d3d1] rounded-[8px] cursor-pointer hover:border-[#3ba6f1] transition-colors group">
                  <div className="w-9 h-9 rounded bg-white border border-[#e8e6e5] flex items-center justify-center shrink-0">
                    <Upload size={15} className="text-[#a8a29e] group-hover:text-[#3ba6f1] transition-colors" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-[#0c0a09]">{fileName || "Click to choose a CSV file"}</div>
                    {!fileName && <div className="text-[10px] text-[#a8a29e]">Filename can contain room type (e.g. "Hostel 4 IN A ROOM.csv")</div>}
                  </div>
                  <input type="file" accept=".csv,.txt,text/csv" className="hidden" onChange={handleFile} />
                </label>
              </div>

              {/* Room type selector */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[#78716c] mb-1.5">Room Type for this Group</label>
                {detectedType && (
                  <p className="text-[10px] text-[#3398e1] mb-1.5 font-medium">
                    ✓ Detected <strong>{detectedType}</strong> from filename
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  {roomTypes.map(t => (
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
                <div className="bg-[#fafaf9] border border-[#e8e6e5] rounded-[8px] p-3 space-y-3">
                  {/* Pairing Stats counter */}
                  <div className="grid grid-cols-3 gap-2 bg-white border border-[#e8e6e5] p-2.5 rounded-[6px] text-center">
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-[#a8a29e] font-semibold">Pairings</div>
                      <div className="font-display font-normal text-xl text-[#3ba6f1]">{uniqueGroups.length}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-[#a8a29e] font-semibold">Total People</div>
                      <div className="font-display font-normal text-xl text-[#0c0a09]">{rows.length}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-[#a8a29e] font-semibold">Avg / Room</div>
                      <div className="font-display font-normal text-xl text-[#78716c]">
                        {uniqueGroups.length ? (rows.length / uniqueGroups.length).toFixed(1) : 0}
                      </div>
                    </div>
                  </div>

                  <div className="max-h-36 overflow-y-auto divide-y divide-[#e8e6e5]">
                    {uniqueGroups.slice(0, 8).map(gid => {
                      const members = rows.filter(r => r.group_id === gid);
                      return (
                        <div key={gid} className="py-1.5 flex items-center justify-between">
                          <div className="text-[11px] font-mono text-[#3ba6f1] font-medium">Pairing #{gid} ({members.length})</div>
                          <div className="text-[11px] text-[#0c0a09] truncate max-w-[280px]">{members.map((m: any) => m.full_name).join(", ")}</div>
                        </div>
                      );
                    })}
                    {uniqueGroups.length > 8 && (
                      <div className="py-1.5 text-[11px] text-[#a8a29e]">+{uniqueGroups.length - 8} more pairings…</div>
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
  const [roomTypes, setRoomTypes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [showImport, setShowImport] = useState(false);
  const [isPending, startTransition] = useTransition();

  const load = async () => {
    const [g, camps] = await Promise.all([getGroupsAction(campId), getCampsList()]);
    setGroups(g);
    const currentCamp = camps.find(c => c.id === campId);
    if (currentCamp?.room_types) setRoomTypes(currentCamp.room_types);
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

      {showImport && <CsvImportModal onClose={() => setShowImport(false)} onImported={load} campId={campId} roomTypes={roomTypes} />}
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
