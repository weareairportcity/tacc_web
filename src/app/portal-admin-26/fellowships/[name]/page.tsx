"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Handshake, Key, UserX, Loader2 } from "lucide-react";
import { getFellowshipsAction, FellowshipGroup, AttendeeAdmin } from "../../../camp/actions";
import { useAdminCtx } from "../../AdminShell";

export default function FellowshipDetailPage() {
  const { campId } = useAdminCtx();
  const params = useParams();
  const name = decodeURIComponent(params.name as string);
  const [group, setGroup] = useState<FellowshipGroup | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getFellowshipsAction(campId).then(groups => {
      setGroup(groups.find(g => g.name === name) || null);
      setLoading(false);
    });
  }, [campId, name]);

  if (loading) {
    return <div className="flex items-center justify-center min-h-64 p-8"><Loader2 size={22} className="text-[#3ba6f1] animate-spin" /></div>;
  }

  if (!group) {
    return (
      <div className="p-5 sm:p-8">
        <Link href="/portal-admin-26/fellowships" className="inline-flex items-center gap-1.5 text-xs text-[#78716c] hover:text-[#0c0a09] mb-6">
          <ArrowLeft size={13} /> Fellowships
        </Link>
        <p className="text-sm text-[#78716c]">Fellowship not found.</p>
      </div>
    );
  }

  const assigned = group.members.filter(m => m.room_number);
  const unassigned = group.unassigned;

  return (
    <div className="p-5 sm:p-8 max-w-[800px]">
      {/* Breadcrumb */}
      <Link href="/portal-admin-26/fellowships" className="inline-flex items-center gap-1.5 text-xs text-[#78716c] hover:text-[#0c0a09] mb-6 transition-colors">
        <ArrowLeft size={13} /> Fellowships
      </Link>

      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-full bg-[#fafaf9] border border-[#e8e6e5] flex items-center justify-center">
          <Handshake size={18} className="text-[#3ba6f1]" />
        </div>
        <div>
          <h1 className="font-display font-normal text-[28px] text-[#0c0a09] tracking-tight">{name}</h1>
          <p className="text-xs text-[#78716c] mt-0.5">
            {group.members.length} {group.members.length === 1 ? "member" : "members"} · {assigned.length} assigned · {unassigned.length} unassigned
          </p>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3 mb-8">
        {[
          { label: "Total", value: group.members.length },
          { label: "Assigned", value: assigned.length, color: "text-emerald-600" },
          { label: "Unassigned", value: unassigned.length, color: unassigned.length > 0 ? "text-amber-600" : "text-[#a8a29e]" },
        ].map(s => (
          <div key={s.label} className="bg-white border border-[#e8e6e5] rounded-[10px] p-4 shadow-[rgba(0,0,0,0.05)_0px_4px_16px_0px]">
            <div className="text-[10px] uppercase tracking-wider text-[#a8a29e] font-semibold mb-1">{s.label}</div>
            <div className={`font-display font-normal text-2xl ${s.color || "text-[#0c0a09]"}`}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Unassigned — shown first if any */}
      {unassigned.length > 0 && (
        <section className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <UserX size={14} className="text-amber-500" />
            <h2 className="text-sm font-medium text-amber-700">Unassigned ({unassigned.length})</h2>
            <Link href="/portal-admin-26/groups/assign" className="ml-auto text-xs text-[#3398e1] hover:underline">
              Assign rooms →
            </Link>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-[10px] divide-y divide-amber-100">
            {unassigned.map((m: AttendeeAdmin) => (
              <div key={m.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <div className="text-sm font-medium text-[#0c0a09]">{m.full_name}</div>
                  <div className="text-[11px] text-[#a8a29e]">{m.fellowship}</div>
                </div>
                <span className="text-[11px] text-amber-700 font-medium bg-amber-100 px-2 py-0.5 rounded-full">No room</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Assigned members */}
      {assigned.length > 0 && (
        <section>
          <h2 className="text-sm font-medium text-[#0c0a09] mb-3">Assigned to a Room ({assigned.length})</h2>
          <div className="bg-white border border-[#e8e6e5] rounded-[10px] shadow-[rgba(0,0,0,0.05)_0px_4px_16px_0px] divide-y divide-[#fafaf9]">
            {assigned.map((m: AttendeeAdmin) => (
              <div key={m.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <div className="text-sm font-medium text-[#0c0a09]">{m.full_name}</div>
                  {m.key_bearer === m.full_name && (
                    <div className="text-[10px] text-[#3398e1] flex items-center gap-1">
                      <Key size={9} /> Key Bearer
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <div className="font-mono text-xs font-bold text-[#0c0a09]">{m.room_number}</div>
                  <div className="text-[10px] text-[#a8a29e]">{m.room_type}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {group.members.length === 0 && (
        <div className="bg-white border border-[#e8e6e5] rounded-[10px] p-10 text-center">
          <p className="text-sm text-[#78716c]">No members in this fellowship yet.</p>
        </div>
      )}
    </div>
  );
}
