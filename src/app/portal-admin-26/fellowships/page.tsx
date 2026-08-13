"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Handshake, UserX, ChevronRight, ChevronDown, Loader2, Users } from "lucide-react";
import { getPFCCGroupsAction, PFCCGroup } from "../../camp/actions";
import { useAdminCtx } from "../AdminShell";

function FellowshipCard({ name, memberCount, unassignedCount, totalCount }: {
  name: string; memberCount: number; unassignedCount: number; totalCount: number;
}) {
  const pct = totalCount > 0 ? Math.round(((totalCount - unassignedCount) / totalCount) * 100) : 0;
  return (
    <Link
      href={`/portal-admin-26/fellowships/${encodeURIComponent(name)}`}
      className="flex items-center gap-3 px-4 py-3 bg-[#fafaf9] border border-[#e8e6e5] rounded-[8px] hover:border-[#d6d3d1] hover:bg-white transition-colors group"
    >
      <div className="w-7 h-7 rounded-full bg-white border border-[#e8e6e5] flex items-center justify-center shrink-0">
        <Handshake size={12} className="text-[#3ba6f1]" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium text-[#0c0a09] truncate">{name}</div>
        <div className="flex items-center gap-2 mt-1">
          <div className="h-1 flex-1 bg-[#e8e6e5] rounded-full overflow-hidden">
            <div className="h-1 bg-[#3ba6f1] rounded-full" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-[10px] text-[#a8a29e] shrink-0">{memberCount}</span>
        </div>
      </div>
      {unassignedCount > 0 && (
        <span className="text-[10px] font-medium text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full shrink-0">
          {unassignedCount} ⚠
        </span>
      )}
      <ChevronRight size={12} className="text-[#a8a29e] group-hover:text-[#3ba6f1] transition-colors shrink-0" />
    </Link>
  );
}

function PFCCCard({ group }: { group: PFCCGroup }) {
  const [expanded, setExpanded] = useState(true);
  const pct = group.totalMembers > 0 ? Math.round((group.assignedMembers / group.totalMembers) * 100) : 0;
  const unassignedInPFCC = group.totalMembers - group.assignedMembers;

  return (
    <div className="bg-white border border-[#e8e6e5] rounded-[10px] shadow-[rgba(0,0,0,0.05)_0px_4px_16px_0px] overflow-hidden">
      {/* PFCC Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-[#fafaf9] transition-colors cursor-pointer"
      >
        <div className="w-9 h-9 rounded-full bg-[#fafaf9] border border-[#e8e6e5] flex items-center justify-center shrink-0">
          <Users size={15} className="text-[#3ba6f1]" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <div className="text-sm font-medium text-[#0c0a09]">{group.name}</div>
            {group.name === "Unassigned" ? (
              <span className="text-[10px] font-medium text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
                Missing PFCC in CSV
              </span>
            ) : unassignedInPFCC > 0 ? (
              <span className="text-[10px] font-medium text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full">
                {unassignedInPFCC} unassigned to rooms
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-2 mt-1.5">
            <div className="h-1 flex-1 max-w-[160px] bg-[#f0eeec] rounded-full overflow-hidden">
              <div className="h-1 bg-[#3ba6f1] rounded-full transition-all" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-[10px] text-[#a8a29e]">
              {group.assignedMembers}/{group.totalMembers} assigned · {group.fellowships.length} fellowships
            </span>
          </div>
        </div>
        {expanded
          ? <ChevronDown size={14} className="text-[#a8a29e] shrink-0" />
          : <ChevronRight size={14} className="text-[#a8a29e] shrink-0" />
        }
      </button>

      {/* Fellowship list */}
      {expanded && (
        <div className="px-4 pb-4 pt-1 space-y-1.5 border-t border-[#f5f5f4]">
          {group.fellowships.map(f => (
            <FellowshipCard
              key={f.name}
              name={f.name}
              memberCount={f.members.length}
              unassignedCount={f.unassigned.length}
              totalCount={f.members.length}
            />
          ))}
          {group.fellowships.length === 0 && (
            <p className="text-xs text-[#a8a29e] px-2 py-2">No fellowships found.</p>
          )}
        </div>
      )}
    </div>
  );
}

export default function FellowshipsPage() {
  const { campId } = useAdminCtx();
  const [pfccGroups, setPfccGroups] = useState<PFCCGroup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getPFCCGroupsAction(campId).then(g => { setPfccGroups(g); setLoading(false); });
  }, [campId]);

  const totalPeople = pfccGroups.reduce((s, g) => s + g.totalMembers, 0);
  const totalUnassigned = pfccGroups.reduce((s, g) => s + (g.totalMembers - g.assignedMembers), 0);

  return (
    <div className="p-5 sm:p-8 max-w-[960px]">
      {/* Header */}
      <div className="mb-6">
        <div className="text-xs uppercase tracking-wider text-[#a8a29e] font-semibold mb-1">Directory</div>
        <h1 className="font-display font-normal text-[28px] text-[#0c0a09] tracking-tight">Fellowships</h1>
        <p className="text-xs text-[#78716c] mt-1">
          Grouped by PFCC → Fellowship
          {totalPeople > 0 && (
            <span className="ml-2">· {totalPeople} people</span>
          )}
          {totalUnassigned > 0 && (
            <span className="ml-2 text-amber-600 flex items-center gap-1 inline-flex">
              <UserX size={11} /> {totalUnassigned} unassigned
            </span>
          )}
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 size={22} className="text-[#3ba6f1] animate-spin" /></div>
      ) : pfccGroups.length === 0 ? (
        <div className="bg-white border border-[#e8e6e5] rounded-[10px] p-10 text-center">
          <p className="text-sm text-[#78716c]">No people added yet. Import a CSV to get started.</p>
          <Link href="/portal-admin-26/people" className="text-xs text-[#3398e1] hover:underline mt-2 inline-block">Go to People →</Link>
        </div>
      ) : (
        <div className="space-y-3">
          {pfccGroups.map(group => (
            <PFCCCard key={group.name} group={group} />
          ))}
        </div>
      )}
    </div>
  );
}
