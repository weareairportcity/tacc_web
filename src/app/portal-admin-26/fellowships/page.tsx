"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Handshake, UserX, ChevronRight, Loader2 } from "lucide-react";
import { getFellowshipsAction, FellowshipGroup } from "../../camp/actions";
import { useAdminCtx } from "../AdminShell";

export default function FellowshipsPage() {
  const { campId } = useAdminCtx();
  const [groups, setGroups] = useState<FellowshipGroup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getFellowshipsAction(campId).then(g => { setGroups(g); setLoading(false); });
  }, [campId]);

  const totalUnassigned = groups.reduce((acc, g) => acc + g.unassigned.length, 0);

  return (
    <div className="p-5 sm:p-8 max-w-[960px]">
      <div className="mb-6">
        <div className="text-xs uppercase tracking-wider text-[#a8a29e] font-semibold mb-1">Directory</div>
        <h1 className="font-display font-normal text-[28px] text-[#0c0a09] tracking-tight">Fellowships</h1>
        {totalUnassigned > 0 && (
          <p className="text-xs text-amber-600 mt-1.5 flex items-center gap-1.5">
            <UserX size={13} /> {totalUnassigned} people have not been assigned to a room.
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
            const encodedName = encodeURIComponent(group.name);
            return (
              <Link
                key={group.name}
                href={`/portal-admin-26/fellowships/${encodedName}`}
                className="bg-white border border-[#e8e6e5] rounded-[10px] p-5 shadow-[rgba(0,0,0,0.05)_0px_4px_16px_0px] hover:border-[#d6d3d1] transition-colors group w-full block"
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
                <div className="mt-2">
                  <div className="flex justify-between text-[10px] text-[#a8a29e] mb-1">
                    <span>{assignedCount} assigned</span>
                    {group.unassigned.length > 0 && (
                      <span className="text-amber-600 font-medium">{group.unassigned.length} unassigned</span>
                    )}
                  </div>
                  <div className="h-1 bg-[#f0eeec] rounded-full overflow-hidden">
                    <div className="h-1 bg-[#3ba6f1] rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
