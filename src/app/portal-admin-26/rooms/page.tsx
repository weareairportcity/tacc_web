"use client";

import React, { useState, useEffect, useTransition } from "react";
import {
  Plus, X, Trash2, Key, Users, Send, CheckCircle2, Loader2, Search, ChevronDown
} from "lucide-react";
import {
  getRoomsAction, addRoomAction, deleteRoomAction, getRoomOccupants,
  assignPersonToRoomAction, removePersonFromRoomAction, setKeyBearerAction,
  sendRoomAssignmentSMSAction, getAdminAttendees,
  Room, AttendeeAdmin
} from "../../camp/actions";
import { useAdminCtx } from "../AdminShell";

// ─── Room Detail Panel ────────────────────────────────────────────────────────
function RoomPanel({ room, campId, roomTypes, onClose, onChanged }: {
  room: Room; campId: string; roomTypes: string[]; onClose: () => void; onChanged: () => void;
}) {
  const [occupants, setOccupants] = useState<AttendeeAdmin[]>([]);
  const [allPeople, setAllPeople] = useState<AttendeeAdmin[]>([]);
  const [addSearch, setAddSearch] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [smsMap, setSmsMap] = useState<Record<string, "sending" | "sent">>({});
  const [isPending, startTransition] = useTransition();

  const load = async () => {
    const [occ, all] = await Promise.all([getRoomOccupants(room.id), getAdminAttendees(campId)]);
    setOccupants(occ);
    setAllPeople(all);
  };

  useEffect(() => { load(); }, [room.id]);

  const unassigned = allPeople.filter(p => !p.room_id && !p.room_number);
  const searchResults = unassigned.filter(p => p.full_name.toLowerCase().includes(addSearch.toLowerCase()));

  const handleAssign = (personId: string) => {
    startTransition(async () => {
      await assignPersonToRoomAction(personId, room.id);
      await load(); onChanged();
    });
  };

  const handleRemove = (personId: string) => {
    startTransition(async () => {
      await removePersonFromRoomAction(personId);
      await load(); onChanged();
    });
  };

  const handleSetKeyBearer = (personId: string) => {
    startTransition(async () => {
      await setKeyBearerAction(room.id, personId);
      await load(); onChanged();
    });
  };

  const handleSMS = (occ: AttendeeAdmin) => {
    setSmsMap(m => ({ ...m, [occ.id]: "sending" }));
    startTransition(async () => {
      await sendRoomAssignmentSMSAction({ name: occ.full_name, roomNumber: room.room_number, roomType: room.room_type, keyBearer: occ.key_bearer || "TBD", phoneNumber: occ.phone_number || "0550076503" });
      setSmsMap(m => ({ ...m, [occ.id]: "sent" }));
    });
  };

  return (
    <div className="fixed inset-0 z-40 flex">
      <button onClick={onClose} className="flex-1 bg-black/20 cursor-default" />
      <div className="w-full max-w-[400px] bg-white border-l border-[#e8e6e5] flex flex-col shadow-[rgba(17,12,46,0.12)_0px_12px_45px_0px]">
        {/* Panel Header */}
        <div className="px-5 py-4 border-b border-[#e8e6e5] bg-[#fafaf9] flex items-center justify-between">
          <div>
            <div className="font-display font-normal text-2xl text-[#0c0a09] tracking-tight">{room.room_number}</div>
            <div className="text-xs text-[#78716c]">{room.room_type}</div>
          </div>
          <button onClick={onClose} className="text-[#a8a29e] hover:text-[#0c0a09] cursor-pointer"><X size={16} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Occupants */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="text-xs font-semibold uppercase tracking-wider text-[#a8a29e] flex items-center gap-1.5">
                <Users size={12} /> Occupants ({occupants.length})
              </div>
              <button onClick={() => setShowSearch(s => !s)}
                className="text-xs text-[#3398e1] hover:underline flex items-center gap-1 cursor-pointer">
                <Plus size={12} /> Add person
              </button>
            </div>

            {showSearch && (
              <div className="mb-3 bg-[#fafaf9] border border-[#e8e6e5] rounded-[8px] p-3">
                <div className="relative mb-2">
                  <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#a8a29e]" />
                  <input type="text" placeholder="Search unassigned people..." value={addSearch} onChange={e => setAddSearch(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 bg-white border border-[#d6d3d1] rounded text-xs text-[#0c0a09] focus:ring-1 focus:ring-[#3ba6f1] focus:outline-none" />
                </div>
                <div className="max-h-36 overflow-y-auto space-y-1">
                  {searchResults.length === 0
                    ? <p className="text-[11px] text-[#a8a29e] py-1">No unassigned people {addSearch && `matching "${addSearch}"`}</p>
                    : searchResults.map(p => (
                      <button key={p.id} onClick={() => handleAssign(p.id)}
                        className="w-full text-left px-2.5 py-1.5 text-xs text-[#0c0a09] hover:bg-white rounded flex items-center justify-between cursor-pointer">
                        <span>{p.full_name}</span>
                        <span className="text-[#a8a29e]">{p.fellowship}</span>
                      </button>
                    ))}
                </div>
              </div>
            )}

            {occupants.length === 0
              ? <p className="text-xs text-[#a8a29e] py-2">No one assigned yet.</p>
              : occupants.map(occ => {
                const isKeyHolder = room.key_bearer_id === occ.id;
                return (
                  <div key={occ.id} className="mb-2 bg-white border border-[#e8e6e5] rounded-[8px] p-3 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-[#0c0a09] truncate">{occ.full_name}</div>
                      <div className="text-[11px] text-[#a8a29e]">{occ.fellowship}</div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {isKeyHolder && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-[#3398e1] bg-[#c1e1f7]/50 px-2 py-0.5 rounded-full">
                          <Key size={9} /> Key
                        </span>
                      )}
                      {!isKeyHolder && (
                        <button onClick={() => handleSetKeyBearer(occ.id)} title="Set as Key Bearer"
                          className="p-1.5 text-[#a8a29e] hover:text-[#3ba6f1] rounded hover:bg-[#fafaf9] transition-colors cursor-pointer">
                          <Key size={12} />
                        </button>
                      )}
                      <button onClick={() => handleSMS(occ)} title="Send SMS"
                        className={`p-1.5 rounded hover:bg-[#fafaf9] transition-colors cursor-pointer ${smsMap[occ.id] === "sent" ? "text-emerald-600" : "text-[#a8a29e] hover:text-[#3ba6f1]"}`}>
                        {smsMap[occ.id] === "sending" ? <Loader2 size={12} className="animate-spin" /> : smsMap[occ.id] === "sent" ? <CheckCircle2 size={12} /> : <Send size={12} />}
                      </button>
                      <button onClick={() => handleRemove(occ.id)} title="Remove from room"
                        className="p-1.5 text-[#a8a29e] hover:text-red-500 rounded hover:bg-red-50 transition-colors cursor-pointer">
                        <X size={12} />
                      </button>
                    </div>
                  </div>
                );
              })}
          </div>

          {/* Key Bearer info */}
          {occupants.length > 0 && (
            <div className="text-[11px] text-[#a8a29e] bg-[#fafaf9] border border-[#e8e6e5] rounded p-2.5 flex items-start gap-2">
              <Key size={11} className="mt-0.5 text-[#3ba6f1] shrink-0" />
              <span>Click the <Key size={10} className="inline text-[#3ba6f1]" /> icon on any occupant to set them as the room&apos;s key bearer.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Rooms Page ───────────────────────────────────────────────────────────────
export default function RoomsPage() {
  const { campId } = useAdminCtx();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [occupantCounts, setOccupantCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newNumber, setNewNumber] = useState("");
  const [newType, setNewType] = useState("Villa");
  const [addError, setAddError] = useState("");
  const [isPending, startTransition] = useTransition();

  // Get room types from camp (default fallback)
  const roomTypes = ["Wise as Serpents", "Villa", "Hostel", "Dormitory"];

  const load = async () => {
    const rms = await getRoomsAction(campId);
    setRooms(rms);
    // Count occupants per room using attendees store
    const all = await getAdminAttendees(campId);
    const counts: Record<string, number> = {};
    for (const att of all) { if (att.room_id) counts[att.room_id] = (counts[att.room_id] || 0) + 1; }
    setOccupantCounts(counts);
    setLoading(false);
  };

  useEffect(() => { load(); }, [campId]);

  const handleAddRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNumber.trim()) { setAddError("Room number is required."); return; }
    setAddError("");
    startTransition(async () => {
      const res = await addRoomAction(campId, newNumber.trim().toUpperCase(), newType);
      if (res.success) { setNewNumber(""); setShowAdd(false); await load(); }
      else setAddError(res.error || "Failed to add room.");
    });
  };

  const handleDelete = (roomId: string, roomNumber: string) => {
    if (!confirm(`Delete room ${roomNumber}? All occupants will be unassigned.`)) return;
    startTransition(async () => { await deleteRoomAction(roomId); await load(); });
  };

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
          <div className="text-xs uppercase tracking-wider text-[#a8a29e] font-semibold mb-1">Management</div>
          <h1 className="font-display font-normal text-[28px] text-[#0c0a09] tracking-tight">Rooms</h1>
        </div>
        <button onClick={() => setShowAdd(true)}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#3ba6f1] hover:bg-[#3398e1] text-white text-xs font-medium rounded-full shadow-sm cursor-pointer transition-all shrink-0">
          <Plus size={13} /> Add Room
        </button>
      </div>

      {/* Add Room inline form */}
      {showAdd && (
        <div className="mb-6 bg-white border border-[#e8e6e5] rounded-[10px] p-5 shadow-[rgba(0,0,0,0.05)_0px_4px_16px_0px]">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-[#0c0a09]">New Room</h3>
            <button onClick={() => setShowAdd(false)} className="text-[#a8a29e] hover:text-[#0c0a09] cursor-pointer"><X size={15} /></button>
          </div>
          <form onSubmit={handleAddRoom} className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[140px]">
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-[#78716c] mb-1">Room Number *</label>
              <input type="text" value={newNumber} onChange={e => setNewNumber(e.target.value)} placeholder="e.g. V-103"
                className="w-full px-3 py-2 font-mono bg-white border border-[#d6d3d1] rounded-[6px] text-xs text-[#0c0a09] focus:ring-1 focus:ring-[#3ba6f1] focus:outline-none" />
            </div>
            <div className="flex-1 min-w-[160px]">
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-[#78716c] mb-1">Room Type *</label>
              <select value={newType} onChange={e => setNewType(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-[#d6d3d1] rounded-[6px] text-xs text-[#0c0a09] focus:ring-1 focus:ring-[#3ba6f1] focus:outline-none">
                {roomTypes.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <button type="submit" disabled={isPending}
              className="px-5 py-2 bg-[#3ba6f1] text-white text-xs font-medium rounded-full cursor-pointer disabled:opacity-50 transition-colors hover:bg-[#3398e1]">
              {isPending ? "Adding..." : "Add Room"}
            </button>
          </form>
          {addError && <p className="text-xs text-red-600 mt-2">{addError}</p>}
        </div>
      )}

      {/* Rooms Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 size={22} className="text-[#3ba6f1] animate-spin" /></div>
      ) : rooms.length === 0 ? (
        <div className="bg-white border border-[#e8e6e5] rounded-[10px] p-10 text-center">
          <p className="text-sm text-[#78716c] mb-3">No rooms yet.</p>
          <button onClick={() => setShowAdd(true)} className="text-xs text-[#3398e1] hover:underline cursor-pointer">Add your first room →</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {rooms.map(room => {
            const count = occupantCounts[room.id] || 0;
            const typeColor = TYPE_COLORS[room.room_type] || "text-[#78716c] bg-[#fafaf9] border-[#e8e6e5]";
            return (
              <div key={room.id} className="bg-white border border-[#e8e6e5] rounded-[10px] p-4 shadow-[rgba(0,0,0,0.05)_0px_4px_16px_0px] hover:border-[#d6d3d1] transition-colors">
                <div className="flex items-start justify-between mb-3">
                  <div className="font-display font-normal text-2xl text-[#0c0a09] tracking-tight">{room.room_number}</div>
                  <button onClick={() => handleDelete(room.id, room.room_number)}
                    className="p-1.5 text-[#a8a29e] hover:text-red-500 hover:bg-red-50 rounded transition-colors cursor-pointer">
                    <Trash2 size={13} />
                  </button>
                </div>
                <span className={`inline-block text-[11px] font-medium border px-2 py-0.5 rounded-full mb-3 ${typeColor}`}>{room.room_type}</span>
                <div className="flex items-center justify-between text-xs text-[#78716c]">
                  <span className="flex items-center gap-1"><Users size={11} /> {count} {count === 1 ? "person" : "people"}</span>
                  <button onClick={() => setSelectedRoom(room)}
                    className="text-[#3398e1] hover:underline cursor-pointer font-medium">View Room →</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Room Detail Panel */}
      {selectedRoom && (
        <RoomPanel
          room={selectedRoom}
          campId={campId}
          roomTypes={roomTypes}
          onClose={() => setSelectedRoom(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}
