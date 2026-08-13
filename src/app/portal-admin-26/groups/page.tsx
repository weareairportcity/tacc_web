"use client";

import React, { useState, useEffect, useTransition } from "react";
import Link from "next/link";
import { Layers, Upload, Trash2, Loader2, X, Users, ArrowRight, CheckCircle2, Home, Plus, Unlink, Phone, Calendar, Search, ShieldCheck } from "lucide-react";
import {
  getGroupsAction, importGroupsFromCSVAction, deleteGroupAction,
  getCampsList, getRoomsAction, addRoomAction, assignGroupToRoomAction,
  unassignGroupFromRoomAction, Group, Room
} from "../../camp/actions";
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
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [isPending, startTransition] = useTransition();

  const load = async () => {
    const [g, camps] = await Promise.all([getGroupsAction(campId), getCampsList()]);
    setGroups(g);
    const currentCamp = camps.find(c => c.id === campId);
    if (currentCamp?.room_types) setRoomTypes(currentCamp.room_types);
    setLoading(false);
  };

  useEffect(() => { load(); }, [campId]);

  // Keep selectedGroup state in sync after reloads
  useEffect(() => {
    if (selectedGroup) {
      const updated = groups.find(g => g.id === selectedGroup.id);
      if (updated) setSelectedGroup(updated);
    }
  }, [groups]);

  const handleDelete = (groupId: string, groupNumber: number) => {
    if (!confirm(`Delete Group ${groupNumber} and all its members?`)) return;
    startTransition(async () => {
      await deleteGroupAction(groupId);
      if (selectedGroup?.id === groupId) setSelectedGroup(null);
      await load();
    });
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
          <p className="text-xs text-[#78716c] mt-1">Click any group card to view member details and assign a room.</p>
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
                  <GroupCard
                    key={group.id}
                    group={group}
                    typeColors={TYPE_COLORS}
                    onSelect={() => setSelectedGroup(group)}
                    onDelete={() => handleDelete(group.id, group.group_number)}
                  />
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
                  <GroupCard
                    key={group.id}
                    group={group}
                    typeColors={TYPE_COLORS}
                    onSelect={() => setSelectedGroup(group)}
                    onDelete={() => handleDelete(group.id, group.group_number)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {showImport && <CsvImportModal onClose={() => setShowImport(false)} onImported={load} campId={campId} roomTypes={roomTypes} />}
      {selectedGroup && (
        <GroupDetailSidebar
          group={selectedGroup}
          campId={campId}
          roomTypes={roomTypes}
          onClose={() => setSelectedGroup(null)}
          onUpdated={load}
        />
      )}
    </div>
  );
}

function GroupCard({
  group,
  typeColors,
  onSelect,
  onDelete,
}: {
  group: Group;
  typeColors: Record<string, string>;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const typeColor = typeColors[group.room_type_preference || ""] || "text-[#78716c] bg-[#fafaf9] border-[#e8e6e5]";
  return (
    <div
      onClick={onSelect}
      className={`bg-white border rounded-[10px] p-4 shadow-[rgba(0,0,0,0.05)_0px_4px_16px_0px] transition-all cursor-pointer group hover:border-[#3ba6f1] hover:shadow-md ${
        group.room_id ? "border-emerald-200" : "border-[#e8e6e5]"
      }`}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="font-display font-normal text-xl text-[#0c0a09] group-hover:text-[#3ba6f1] transition-colors">
          Group {group.group_number}
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="p-1.5 text-[#a8a29e] hover:text-red-500 hover:bg-red-50 rounded transition-colors cursor-pointer"
          title="Delete Group"
        >
          <Trash2 size={12} />
        </button>
      </div>
      {group.room_type_preference && (
        <span className={`inline-block text-[10px] font-medium border px-2 py-0.5 rounded-full mb-2 ${typeColor}`}>
          {group.room_type_preference}
        </span>
      )}
      <div className="text-[11px] text-[#78716c] flex items-center gap-1 mb-2">
        <Users size={11} /> {group.members?.length || 0} {(group.members?.length || 0) === 1 ? "person" : "people"}
      </div>
      <div className="space-y-1 my-2">
        {group.members && group.members.slice(0, 4).map(m => (
          <div key={m.id} className="text-[11px] flex items-center justify-between gap-1">
            <span className="text-[#0c0a09] font-medium truncate">{m.full_name}</span>
            {m.room_number ? (
              <span className="text-[10px] font-mono text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 rounded font-semibold shrink-0">
                {m.room_number}
              </span>
            ) : (
              <span className="text-[9px] text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.2 rounded shrink-0">
                Unassigned
              </span>
            )}
          </div>
        ))}
        {(group.members?.length || 0) > 4 && (
          <div className="text-[10px] text-[#a8a29e]">+{(group.members?.length || 0) - 4} more</div>
        )}
      </div>
      {group.room_id && (
        <div className="mt-2 pt-2 border-t border-[#e8e6e5] flex items-center gap-1 text-[11px] text-emerald-700 font-medium">
          <CheckCircle2 size={11} /> Group Assigned
        </div>
      )}
    </div>
  );
}

// ─── Group Details Slide-Over Sidebar ──────────────────────────────────────────
function GroupDetailSidebar({
  group,
  campId,
  roomTypes,
  onClose,
  onUpdated,
}: {
  group: Group;
  campId: string;
  roomTypes: string[];
  onClose: () => void;
  onUpdated: () => Promise<void> | void;
}) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [currentRoomId, setCurrentRoomId] = useState<string | undefined>(group.room_id);
  const [roomFilter, setRoomFilter] = useState("");
  const [showAddRoom, setShowAddRoom] = useState(false);
  const [newRoomNumber, setNewRoomNumber] = useState("");
  const [newRoomType, setNewRoomType] = useState(
    group.room_type_preference || roomTypes[0] || "Hostel"
  );
  const [errorMsg, setErrorMsg] = useState("");
  const [isPending, startTransition] = useTransition();

  const fetchRooms = async () => {
    setLoadingRooms(true);
    const r = await getRoomsAction(campId);
    setRooms(r);
    setLoadingRooms(false);
  };

  useEffect(() => {
    fetchRooms();
    setCurrentRoomId(group.room_id);
  }, [campId, group.id, group.room_id]);

  const assignedRoom = rooms.find(r => r.id === currentRoomId);

  const handleAssignExistingRoom = (roomId: string) => {
    setErrorMsg("");
    startTransition(async () => {
      const res = await assignGroupToRoomAction(group.id, roomId);
      if (res.success) {
        setCurrentRoomId(roomId);
        await fetchRooms();
        await onUpdated();
      } else {
        setErrorMsg(res.error || "Failed to assign room.");
      }
    });
  };

  const handleUnassign = () => {
    setErrorMsg("");
    startTransition(async () => {
      await unassignGroupFromRoomAction(group.id);
      setCurrentRoomId(undefined);
      await fetchRooms();
      await onUpdated();
    });
  };

  const handleCreateAndAssignRoom = () => {
    setErrorMsg("");
    if (!newRoomNumber.trim()) {
      setErrorMsg("Please enter a room number.");
      return;
    }
    startTransition(async () => {
      const addRes = await addRoomAction(campId, newRoomNumber.trim(), newRoomType);
      if (!addRes.success || !addRes.room) {
        setErrorMsg(addRes.error || "Failed to create room.");
        return;
      }
      const assignRes = await assignGroupToRoomAction(group.id, addRes.room.id);
      if (assignRes.success) {
        setCurrentRoomId(addRes.room.id);
        setShowAddRoom(false);
        setNewRoomNumber("");
        await fetchRooms();
        await onUpdated();
      } else {
        setErrorMsg(assignRes.error || "Room created but failed to assign.");
      }
    });
  };

  // Sort rooms so matching room type preference comes first
  const pref = (group.room_type_preference || "").toLowerCase();
  const sortedRooms = [...rooms].sort((a, b) => {
    const aMatch = a.room_type.toLowerCase() === pref ? -1 : 1;
    const bMatch = b.room_type.toLowerCase() === pref ? -1 : 1;
    return aMatch - bMatch;
  });

  const filteredRooms = sortedRooms.filter(r =>
    r.room_number.toLowerCase().includes(roomFilter.toLowerCase()) ||
    r.room_type.toLowerCase().includes(roomFilter.toLowerCase())
  );

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 backdrop-blur-xs z-40 transition-opacity"
        onClick={onClose}
      />

      {/* Slide-over Panel */}
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-[480px] bg-white shadow-[-16px_0px_50px_rgba(0,0,0,0.15)] flex flex-col transform transition-transform duration-300 ease-in-out">
        {/* Header */}
        <div className="px-6 py-5 border-b border-[#e8e6e5] bg-[#fafaf9] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white border border-[#e8e6e5] flex items-center justify-center shrink-0 shadow-xs">
              <Users size={18} className="text-[#3ba6f1]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-display font-normal text-2xl text-[#0c0a09]">Group {group.group_number}</h2>
                {group.room_type_preference && (
                  <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#c1e1f7]/30 text-[#3398e1] border border-[#3ba6f1]/30">
                    {group.room_type_preference}
                  </span>
                )}
              </div>
              <p className="text-xs text-[#78716c] mt-0.5">
                {group.members?.length || 0} members · {assignedRoom ? `Assigned to ${assignedRoom.room_number}` : "Unassigned"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full border border-[#e8e6e5] bg-white flex items-center justify-center text-[#78716c] hover:text-[#0c0a09] hover:border-[#d6d3d1] cursor-pointer transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Members List Section */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[#78716c] flex items-center gap-1.5">
                <Users size={13} className="text-[#3ba6f1]" /> Members ({group.members?.length || 0})
              </h3>
            </div>
            <div className="space-y-2.5">
              {group.members?.map(m => (
                <div key={m.id} className="p-3.5 bg-[#fafaf9] border border-[#e8e6e5] rounded-[10px] space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm text-[#0c0a09]">{m.full_name}</span>
                      {m.room_number ? (
                        <span className="text-[10px] font-mono font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <Home size={9} /> {m.room_number}
                        </span>
                      ) : (
                        <span className="text-[10px] font-medium text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full">
                          Unassigned
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] font-medium text-[#78716c] bg-white border border-[#e8e6e5] px-2 py-0.5 rounded-full">
                      {m.fellowship || "General"}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#78716c]">
                    {(m as any).pfcc && (
                      <span className="text-[10px] font-medium text-[#3398e1] bg-[#c1e1f7]/25 border border-[#3ba6f1]/20 px-1.5 py-0.5 rounded">
                        {(m as any).pfcc}
                      </span>
                    )}
                    {(m as any).gender && <span className="text-[#78716c]">{(m as any).gender}</span>}
                    {(m as any).day_of_arrival && (
                      <span className="text-[#a8a29e] flex items-center gap-1">
                        <Calendar size={10} /> {(m as any).day_of_arrival}
                      </span>
                    )}
                    {m.phone_number && (
                      <span className="text-[#a8a29e] flex items-center gap-1">
                        <Phone size={10} /> {m.phone_number}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Room Assignment Section */}
          <div className="pt-4 border-t border-[#e8e6e5] space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[#78716c] flex items-center gap-1.5">
              <Home size={13} className="text-[#3ba6f1]" /> Room Assignment
            </h3>

            {/* Current status banner */}
            {assignedRoom ? (
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-[10px] flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700">Currently Assigned</div>
                  <div className="font-display font-medium text-lg text-emerald-950 mt-0.5">
                    Room {assignedRoom.room_number} <span className="text-xs font-normal text-emerald-700">({assignedRoom.room_type})</span>
                  </div>
                </div>
                <button
                  onClick={handleUnassign}
                  disabled={isPending}
                  className="inline-flex items-center gap-1 px-3 py-1.5 bg-white border border-emerald-300 text-emerald-800 text-xs font-medium rounded-full cursor-pointer hover:bg-emerald-100 transition-colors disabled:opacity-50"
                >
                  <Unlink size={12} /> Unassign
                </button>
              </div>
            ) : (
              <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-[10px] text-xs text-amber-800 font-medium">
                Not assigned to any room yet.
              </div>
            )}

            {/* Error Message */}
            {errorMsg && (
              <div className="p-2.5 bg-red-50 border border-red-200 rounded-[6px] text-xs text-red-600">
                {errorMsg}
              </div>
            )}

            {/* Create New Room Option */}
            <div className="bg-[#fafaf9] border border-[#e8e6e5] rounded-[10px] p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold text-[#0c0a09]">Add & Assign New Room</div>
                  <div className="text-[11px] text-[#78716c]">Pre-sets room type to {group.room_type_preference || "preference"}</div>
                </div>
                <button
                  onClick={() => setShowAddRoom(!showAddRoom)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 bg-[#3ba6f1] text-white text-xs font-medium rounded-full cursor-pointer hover:bg-[#3398e1] transition-colors"
                >
                  <Plus size={13} /> {showAddRoom ? "Close" : "New Room"}
                </button>
              </div>

              {showAddRoom && (
                <div className="pt-3 border-t border-[#e8e6e5] space-y-3">
                  <div>
                    <label className="block text-[11px] font-medium text-[#0c0a09] mb-1">Room Number</label>
                    <input
                      type="text"
                      placeholder="e.g. H-102 or Villa 5"
                      value={newRoomNumber}
                      onChange={e => setNewRoomNumber(e.target.value)}
                      className="w-full px-3 py-1.5 bg-white border border-[#d6d3d1] rounded-[6px] text-xs text-[#0c0a09] focus:ring-1 focus:ring-[#3ba6f1] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-[#0c0a09] mb-1">Room Type</label>
                    <select
                      value={newRoomType}
                      onChange={e => setNewRoomType(e.target.value)}
                      className="w-full px-3 py-1.5 bg-white border border-[#d6d3d1] rounded-[6px] text-xs text-[#0c0a09] focus:ring-1 focus:ring-[#3ba6f1] focus:outline-none"
                    >
                      {roomTypes.map(rt => (
                        <option key={rt} value={rt}>{rt}</option>
                      ))}
                    </select>
                  </div>
                  <button
                    onClick={handleCreateAndAssignRoom}
                    disabled={isPending || !newRoomNumber.trim()}
                    className="w-full py-2 bg-[#0c0a09] text-white text-xs font-medium rounded-full cursor-pointer hover:bg-[#262322] transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                  >
                    {isPending ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                    Create & Assign Room
                  </button>
                </div>
              )}
            </div>

            {/* Select Existing Room */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-[#0c0a09]">Select Existing Room</label>
                <span className="text-[10px] text-[#78716c]">{filteredRooms.length} available</span>
              </div>

              <div className="relative mb-2">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#a8a29e]" />
                <input
                  type="text"
                  placeholder="Filter rooms by number or type..."
                  value={roomFilter}
                  onChange={e => setRoomFilter(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-white border border-[#d6d3d1] rounded-[6px] text-xs text-[#0c0a09] focus:ring-1 focus:ring-[#3ba6f1] focus:outline-none"
                />
              </div>

              {loadingRooms ? (
                <div className="flex justify-center py-6"><Loader2 size={18} className="text-[#3ba6f1] animate-spin" /></div>
              ) : filteredRooms.length === 0 ? (
                <div className="p-4 text-center text-xs text-[#a8a29e] border border-dashed border-[#e8e6e5] rounded-[8px]">
                  No matching rooms found. Use "New Room" above to create one.
                </div>
              ) : (
                <div className="max-h-56 overflow-y-auto space-y-1.5 border border-[#e8e6e5] rounded-[8px] p-2 bg-[#fafaf9]">
                  {filteredRooms.map(r => {
                    const isCurrent = r.id === group.room_id;
                    const isPrefMatch = r.room_type.toLowerCase() === pref;
                    return (
                      <button
                        key={r.id}
                        onClick={() => handleAssignExistingRoom(r.id)}
                        disabled={isPending || isCurrent}
                        className={`w-full p-2.5 rounded-[6px] text-left transition-colors flex items-center justify-between border cursor-pointer ${
                          isCurrent
                            ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                            : "bg-white border-[#e8e6e5] hover:border-[#3ba6f1] hover:bg-[#c1e1f7]/10"
                        }`}
                      >
                        <div>
                          <div className="font-medium text-xs text-[#0c0a09] flex items-center gap-1.5">
                            Room {r.room_number}
                            {isPrefMatch && (
                              <span className="text-[9px] font-semibold uppercase tracking-wider text-[#3398e1] bg-[#c1e1f7]/30 px-1.5 py-0.2 rounded">
                                Preferred
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-[#78716c]">{r.room_type}</div>
                        </div>
                        {isCurrent ? (
                          <span className="text-[10px] font-medium text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                            Assigned
                          </span>
                        ) : (
                          <span className="text-[11px] font-medium text-[#3398e1]">
                            Assign →
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
