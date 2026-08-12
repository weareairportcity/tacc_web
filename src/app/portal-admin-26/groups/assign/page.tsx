"use client";

import React, { useState, useEffect, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft, Users, Building2, CheckCircle2, Loader2, X } from "lucide-react";
import {
  getGroupsAction, getRoomsAction, assignGroupToRoomAction, unassignGroupFromRoomAction,
  Group, Room
} from "../../../camp/actions";
import { useAdminCtx } from "../../AdminShell";

const TYPE_COLORS: Record<string, string> = {
  "Villa": "bg-violet-50 text-violet-700 border-violet-200",
  "Hostel": "bg-sky-50 text-sky-700 border-sky-200",
  "Dormitory": "bg-amber-50 text-amber-700 border-amber-200",
  "Wise as Serpents": "bg-emerald-50 text-emerald-700 border-emerald-200",
};

export default function AssignGroupsPage() {
  const { campId } = useAdminCtx();
  const [groups, setGroups] = useState<Group[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [roomTypeFilter, setRoomTypeFilter] = useState<string>("all");
  const [isPending, startTransition] = useTransition();

  const load = async () => {
    const [g, r] = await Promise.all([getGroupsAction(campId), getRoomsAction(campId)]);
    setGroups(g);
    setRooms(r);
    setLoading(false);
  };

  useEffect(() => { load(); }, [campId]);

  const selectedGroup = groups.find(g => g.id === selectedGroupId) || null;
  const unassignedGroups = groups.filter(g => !g.room_id);
  const assignedGroups = groups.filter(g => g.room_id);

  const allTypes = [...new Set(rooms.map(r => r.room_type))];
  const filteredRooms = roomTypeFilter === "all" ? rooms : rooms.filter(r => r.room_type === roomTypeFilter);

  const handleAssign = (roomId: string) => {
    if (!selectedGroupId) return;
    startTransition(async () => {
      await assignGroupToRoomAction(selectedGroupId, roomId);
      await load();
      // Auto-advance to next unassigned group
      const nextUnassigned = groups.find(g => !g.room_id && g.id !== selectedGroupId);
      setSelectedGroupId(nextUnassigned?.id || null);
    });
  };

  const handleUnassign = (groupId: string) => {
    startTransition(async () => {
      await unassignGroupFromRoomAction(groupId);
      await load();
    });
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-64 p-8"><Loader2 size={22} className="text-[#3ba6f1] animate-spin" /></div>;
  }

  if (groups.length === 0) {
    return (
      <div className="p-5 sm:p-8 max-w-[960px]">
        <Link href="/portal-admin-26/groups" className="inline-flex items-center gap-1.5 text-xs text-[#78716c] hover:text-[#0c0a09] mb-6 transition-colors">
          <ArrowLeft size={13} /> Groups
        </Link>
        <div className="bg-white border border-[#e8e6e5] rounded-[10px] p-10 text-center">
          <p className="text-sm text-[#78716c]">No groups to assign. Import a CSV first.</p>
          <Link href="/portal-admin-26/groups" className="text-xs text-[#3398e1] hover:underline mt-3 inline-block">← Back to Groups</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen">
      {/* Top bar */}
      <div className="border-b border-[#e8e6e5] bg-white px-5 py-3 flex items-center gap-4">
        <Link href="/portal-admin-26/groups" className="inline-flex items-center gap-1.5 text-xs text-[#78716c] hover:text-[#0c0a09] transition-colors">
          <ArrowLeft size={13} /> Groups
        </Link>
        <div className="h-4 w-px bg-[#e8e6e5]" />
        <div>
          <span className="text-xs font-medium text-[#0c0a09]">Room Assignment</span>
          <span className="text-xs text-[#a8a29e] ml-2">{assignedGroups.length}/{groups.length} assigned</span>
        </div>
        {selectedGroup && (
          <div className="ml-auto text-xs text-[#3398e1] font-medium">
            ← Select a room for Group {selectedGroup.group_number}
          </div>
        )}
      </div>

      {/* Split view */}
      <div className="flex flex-1 overflow-hidden">

        {/* LEFT — Groups Panel */}
        <div className="w-[300px] shrink-0 border-r border-[#e8e6e5] bg-white flex flex-col">
          <div className="px-4 py-3 border-b border-[#e8e6e5] bg-[#fafaf9]">
            <div className="text-[10px] uppercase tracking-wider font-semibold text-[#a8a29e]">Groups ({groups.length})</div>
            <div className="text-[11px] text-[#78716c] mt-0.5">Click a group to select it, then pick a room →</div>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
            {/* Unassigned */}
            {unassignedGroups.length > 0 && (
              <>
                <div className="text-[10px] uppercase tracking-wider font-semibold text-amber-600 px-1 pt-1 pb-0.5">
                  Unassigned ({unassignedGroups.length})
                </div>
                {unassignedGroups.map(group => (
                  <button key={group.id} onClick={() => setSelectedGroupId(group.id)}
                    className={`w-full text-left rounded-[8px] p-3 border transition-all cursor-pointer ${
                      selectedGroupId === group.id
                        ? "bg-[#c1e1f7]/40 border-[#3ba6f1] shadow-sm"
                        : "bg-white border-[#e8e6e5] hover:border-[#d6d3d1] hover:bg-[#fafaf9]"
                    }`}>
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-medium text-[#0c0a09]">Group {group.group_number}</div>
                      {group.room_type_preference && (
                        <span className={`text-[10px] font-medium border px-1.5 py-0.5 rounded-full ${TYPE_COLORS[group.room_type_preference] || "bg-[#fafaf9] text-[#78716c] border-[#e8e6e5]"}`}>
                          {group.room_type_preference}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-[#78716c] mt-1 flex items-center gap-1">
                      <Users size={10} /> {group.members?.length || 0} people
                    </div>
                    <div className="text-[10px] text-[#a8a29e] mt-0.5 truncate">
                      {group.members?.slice(0, 2).map(m => m.full_name).join(", ")}
                      {(group.members?.length || 0) > 2 && ` +${(group.members?.length || 0) - 2}`}
                    </div>
                  </button>
                ))}
              </>
            )}

            {/* Assigned */}
            {assignedGroups.length > 0 && (
              <>
                <div className="text-[10px] uppercase tracking-wider font-semibold text-emerald-600 px-1 pt-3 pb-0.5">
                  Assigned ({assignedGroups.length})
                </div>
                {assignedGroups.map(group => {
                  const room = rooms.find(r => r.id === group.room_id);
                  return (
                    <div key={group.id}
                      className="w-full text-left rounded-[8px] p-3 border border-emerald-200 bg-emerald-50 flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium text-[#0c0a09] flex items-center gap-1.5">
                          <CheckCircle2 size={12} className="text-emerald-600" />
                          Group {group.group_number}
                        </div>
                        <div className="text-[11px] text-emerald-700 font-mono font-semibold">{room?.room_number}</div>
                      </div>
                      <button onClick={() => handleUnassign(group.id)} title="Unassign"
                        className="p-1.5 text-[#a8a29e] hover:text-amber-600 rounded cursor-pointer">
                        <X size={12} />
                      </button>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </div>

        {/* RIGHT — Rooms Panel */}
        <div className="flex-1 min-w-0 bg-[#fafaf9] flex flex-col">
          <div className="px-5 py-3 border-b border-[#e8e6e5] bg-white flex items-center gap-3 flex-wrap">
            <div className="text-[10px] uppercase tracking-wider font-semibold text-[#a8a29e]">Available Rooms ({rooms.length})</div>
            {/* Room type filter */}
            <div className="flex gap-1.5 ml-auto flex-wrap">
              <button onClick={() => setRoomTypeFilter("all")}
                className={`px-2.5 py-1 text-[11px] font-medium rounded-full border cursor-pointer transition-colors ${roomTypeFilter === "all" ? "bg-[#0c0a09] text-white border-[#0c0a09]" : "bg-white text-[#78716c] border-[#e8e6e5] hover:border-[#d6d3d1]"}`}>
                All
              </button>
              {allTypes.map(t => (
                <button key={t} onClick={() => setRoomTypeFilter(t)}
                  className={`px-2.5 py-1 text-[11px] font-medium rounded-full border cursor-pointer transition-colors ${roomTypeFilter === t ? "bg-[#0c0a09] text-white border-[#0c0a09]" : "bg-white text-[#78716c] border-[#e8e6e5] hover:border-[#d6d3d1]"}`}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {!selectedGroupId && (
              <div className="text-center py-8 text-xs text-[#a8a29e]">
                ← Select a group on the left to start assigning
              </div>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
              {filteredRooms.map(room => {
                const isOccupied = groups.some(g => g.room_id === room.id);
                const occupyingGroup = groups.find(g => g.room_id === room.id);
                const typeColor = TYPE_COLORS[room.room_type] || "bg-[#fafaf9] text-[#78716c] border-[#e8e6e5]";
                const matchesPreference = selectedGroup?.room_type_preference === room.room_type;

                return (
                  <button
                    key={room.id}
                    disabled={!selectedGroupId || isOccupied || isPending}
                    onClick={() => handleAssign(room.id)}
                    className={`relative rounded-[10px] p-3.5 border text-left transition-all cursor-pointer ${
                      isOccupied
                        ? "bg-[#f7f6f5] border-[#e8e6e5] opacity-60 cursor-not-allowed"
                        : matchesPreference && selectedGroupId
                        ? "bg-white border-[#3ba6f1] shadow-[0_0_0_2px_rgba(59,166,241,0.15)] hover:shadow-[0_0_0_3px_rgba(59,166,241,0.2)]"
                        : selectedGroupId
                        ? "bg-white border-[#e8e6e5] hover:border-[#3ba6f1] hover:shadow-sm"
                        : "bg-white border-[#e8e6e5]"
                    }`}
                  >
                    {matchesPreference && selectedGroupId && (
                      <div className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-[#3ba6f1] rounded-full flex items-center justify-center">
                        <span className="text-white text-[8px] font-bold">✓</span>
                      </div>
                    )}
                    <div className="font-display font-normal text-xl text-[#0c0a09]">{room.room_number}</div>
                    <span className={`inline-block text-[10px] font-medium border px-1.5 py-0.5 rounded-full mt-1 ${typeColor}`}>{room.room_type}</span>
                    {isOccupied && occupyingGroup && (
                      <div className="text-[10px] text-emerald-700 mt-1.5 flex items-center gap-1">
                        <CheckCircle2 size={9} /> Group {occupyingGroup.group_number}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
