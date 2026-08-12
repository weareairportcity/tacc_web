"use client";

import React, { useState, useEffect } from "react";
import { Handshake, Users, UserX, ChevronRight, X, Loader2 } from "lucide-react";
import { getFellowshipsAction, FellowshipGroup, AttendeeAdmin } from "../../camp/actions";
import { useAdminCtx } from "../AdminShell";

// ─── Member List Panel ────────────────────────────────────────────────────────
function FellowshipPanel({ group, onClose }: { group: FellowshipGroup; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-40 flex">
      <button onClick={onClose} className="flex-1 bg-black/20 cursor-default" />
      <div className="w-full max-w-[380px] bg-white border-l border-[#e8e6e5] flex flex-col shadow-[rgba(17,12,46,0.12)_0px_12px_45px_0px]">
        <div className="px-5 py-4 border-b border-[#e8e6e5] bg-[#fafaf9] flex items-center justify-between">
          <div>
            <div className="font-display font-normal text-xl text-[#0c0a09] tracking-tight">{group.name}</div>
            <div className="text-xs text-[#78716c] mt-0.5">{group.members.length} members · {group.unassigned.length} unassigned</div>
          </div>
          <button onClick={onClose} className="text-[#a8a29e] hover:text-[#0c0a09] cursor-pointer"><X size={16} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Assigned Members */}
          <div>
            <div className="text-[10px] uppercase tracking-wider font-semibold text-[#a8a29e] mb-2">Assigned to Room</div>
            <div className="space-y-1.5">
              {group.members.filter(m => m.room_number).map(m => (
                <div key={m.id} className="flex items-center justify-between px-3 py-2 bg-white border border-[#e8e6e5] rounded-[8px]">
                  <div>
                    <div className="text-xs font-medium text-[#0c0a09]">{m.full_name}</div>
                    {m.key_bearer === m.full_name && (
                      <div className="text-[10px] text-[#3398e1]">Key Bearer</div>
                    )}
                  </div>
                  <span className="font-mono text-[11px] font-bold text-[#0c0a09] bg-[#fafaf9] border border-[#e8e6e5] px-2 py-0.5 rounded">{m.room_number}</span>
                </div>
              ))}
              {group.members.filter(m => m.room_number).length === 0 && (
                <p className="text-xs text-[#a8a29e]">No assigned members yet.</p>
              )}
            </div>
          </div>

          {/* Unassigned Members */}
          {group.unassigned.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider font-semibold text-amber-600 mb-2 flex items-center gap-1.5">
                <UserX size={11} /> Unassigned ({group.unassigned.length})
              </div>
              <div className="space-y-1.5">
                {group.unassigned.map(m => (
                  <div key={m.id} className="flex items-center justify-between px-3 py-2 bg-amber-50 border border-amber-200 rounded-[8px]">
                    <div className="text-xs font-medium text-[#0c0a09]">{m.full_name}</div>
                    <span className="text-[10px] text-amber-700 font-medium">No room</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Fellowships Page ─────────────────────────────────────────────────────────
export default function FellowshipsPage() {
  const { campId } = useAdminCtx();
  const [groups, setGroups] = useState<FellowshipGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<FellowshipGroup | null>(null);

  useEffect(() => {
    getFellowshipsAction(campId).then(g => { setGroups(g); setLoading(false); });
  }, [campId]);

  const totalUnassigned = groups.reduce((acc, g) => acc + g.unassigned.length, 0);

  return (
    <div className="p-5 sm:p-8 max-w-[960px]">
      {/* Header */}
      <div className="mb-6">
        <div className="text-xs uppercase tracking-wider text-[#a8a29e] font-semibold mb-1">Directory</div>
        <h1 className="font-display font-normal text-[28px] text-[#0c0a09] tracking-tight">Fellowships</h1>
        {totalUnassigned > 0 && (
          <p className="text-xs text-amber-600 mt-1.5 flex items-center gap-1.5">
            <UserX size={13} /> {totalUnassigned} people across fellowships have not been assigned to a room.
          </p>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 size={22} className="text-[#3ba6f1] animate-spin" /></div>
      ) : groups.length === 0 ? (
        <div className="bg-white border border-[#e8e6e5] rounded-[10px] p-10 text-center">
          <p className="text-sm text-[#78716c]">No fellowships found. Add people first.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {groups.map(group => {
            const assignedCount = group.members.filter(m => m.room_number).length;
            const pct = group.members.length > 0 ? Math.round((assignedCount / group.members.length) * 100) : 0;
            return (
              <button
                key={group.name}
                onClick={() => setSelected(group)}
                className="bg-white border border-[#e8e6e5] rounded-[10px] p-5 shadow-[rgba(0,0,0,0.05)_0px_4px_16px_0px] hover:border-[#d6d3d1] transition-colors text-left group w-full"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-[#fafaf9] border border-[#e8e6e5] flex items-center justify-center">
                      <Handshake size={14} className="text-[#3ba6f1]" />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-[#0c0a09]">{group.name}</div>
                      <div className="text-[11px] text-[#a8a29e]">{group.members.length} {group.members.length === 1 ? "member" : "members"}</div>
                    </div>
                  </div>
                  <ChevronRight size={14} className="text-[#a8a29e] group-hover:text-[#3ba6f1] transition-colors mt-1" />
                </div>

                {/* Assignment progress bar */}
                <div className="mt-2">
                  <div className="flex justify-between text-[10px] text-[#a8a29e] mb-1">
                    <span>{assignedCount} assigned</span>
                    {group.unassigned.length > 0 && (
                      <span className="text-amber-600 font-medium">{group.unassigned.length} unassigned</span>
                    )}
                  </div>
                  <div className="h-1 bg-[#f0eeec] rounded-full overflow-hidden">
                    <div
                      className="h-1 bg-[#3ba6f1] rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {selected && <FellowshipPanel group={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
