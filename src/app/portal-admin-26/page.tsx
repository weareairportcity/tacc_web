"use client";

import React, { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Users, Building2, Handshake, UserX, ArrowRight, Plus, Upload, Loader2 } from "lucide-react";
import { getAdminAttendees, getRoomsAction, getFellowshipsAction, AttendeeAdmin, Room } from "../camp/actions";
import { useAdminCtx } from "./AdminShell";

function StatCard({ label, value, icon: Icon, href }: { label: string; value: number | string; icon: any; href: string }) {
  return (
    <Link href={href} className="block bg-white border border-[#e8e6e5] rounded-[10px] p-5 shadow-[rgba(0,0,0,0.05)_0px_4px_16px_0px] hover:border-[#d6d3d1] transition-colors group">
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs font-medium uppercase tracking-wider text-[#a8a29e]">{label}</div>
        <Icon size={14} className="text-[#a8a29e] group-hover:text-[#3ba6f1] transition-colors" />
      </div>
      <div className="font-display font-normal text-3xl text-[#0c0a09]">{value}</div>
      <div className="flex items-center gap-1 mt-2 text-xs text-[#3398e1] opacity-0 group-hover:opacity-100 transition-opacity">
        <span>View all</span> <ArrowRight size={11} />
      </div>
    </Link>
  );
}

export default function OverviewPage() {
  const { campId } = useAdminCtx();
  const [attendees, setAttendees] = useState<AttendeeAdmin[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [atts, rms] = await Promise.all([getAdminAttendees(campId), getRoomsAction(campId)]);
      setAttendees(atts);
      setRooms(rms);
      setLoading(false);
    }
    load();
  }, [campId]);

  const unassigned = attendees.filter(a => !a.room_id && !a.room_number);
  const fellowships = [...new Set(attendees.map(a => a.fellowship).filter(Boolean))];
  const recentPeople = [...attendees].sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()).slice(0, 5);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-64 p-8">
        <Loader2 size={24} className="text-[#3ba6f1] animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-5 sm:p-8 max-w-[960px]">
      {/* Page Header */}
      <div className="mb-8">
        <div className="text-xs uppercase tracking-wider text-[#a8a29e] font-semibold mb-1">Dashboard</div>
        <h1 className="font-display font-normal text-[28px] text-[#0c0a09] tracking-tight">
          Overview
        </h1>
        <p className="text-sm text-[#78716c] mt-1">A quick snapshot of your camp meeting.</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="People" value={attendees.length} icon={Users} href="/portal-admin-26/people" />
        <StatCard label="Rooms" value={rooms.length} icon={Building2} href="/portal-admin-26/rooms" />
        <StatCard label="Fellowships" value={fellowships.length} icon={Handshake} href="/portal-admin-26/fellowships" />
        <StatCard label="Unassigned" value={unassigned.length} icon={UserX} href="/portal-admin-26/people" />
      </div>

      {/* Quick Actions */}
      <div className="mb-8">
        <div className="text-xs font-semibold uppercase tracking-wider text-[#a8a29e] mb-3">Quick Actions</div>
        <div className="flex flex-wrap gap-2.5">
          <Link href="/portal-admin-26/people" className="inline-flex items-center gap-2 px-4 py-2 bg-[#3ba6f1] hover:bg-[#3398e1] text-white text-xs font-medium rounded-full shadow-sm transition-all">
            <Plus size={13} /> Add Person
          </Link>
          <Link href="/portal-admin-26/rooms" className="inline-flex items-center gap-2 px-4 py-2 bg-transparent border border-[#d6d3d1] text-[#0c0a09] text-xs font-medium rounded-full hover:bg-white transition-all">
            <Building2 size={13} /> Add Room
          </Link>
          <Link href="/portal-admin-26/fellowships" className="inline-flex items-center gap-2 px-4 py-2 bg-transparent border border-[#d6d3d1] text-[#0c0a09] text-xs font-medium rounded-full hover:bg-white transition-all">
            <Handshake size={13} /> View Fellowships
          </Link>
        </div>
      </div>

      {/* Recent People */}
      <div className="bg-white border border-[#e8e6e5] rounded-[10px] shadow-[rgba(0,0,0,0.05)_0px_4px_16px_0px] overflow-hidden">
        <div className="px-5 py-4 border-b border-[#e8e6e5] flex items-center justify-between">
          <div className="text-sm font-medium text-[#0c0a09]">Recent People Added</div>
          <Link href="/portal-admin-26/people" className="text-xs text-[#3398e1] hover:underline flex items-center gap-1">
            View all <ArrowRight size={11} />
          </Link>
        </div>
        <ul className="divide-y divide-[#fafaf9]">
          {recentPeople.map(person => (
            <li key={person.id} className="px-5 py-3 flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-[#0c0a09]">{person.full_name}</div>
                <div className="text-xs text-[#a8a29e]">{person.fellowship}</div>
              </div>
              {person.room_number ? (
                <span className="text-xs font-mono font-semibold px-2 py-1 bg-[#fafaf9] border border-[#e8e6e5] rounded text-[#0c0a09]">{person.room_number}</span>
              ) : (
                <span className="text-xs px-2 py-1 bg-amber-50 border border-amber-200 text-amber-700 rounded-full font-medium">Unassigned</span>
              )}
            </li>
          ))}
          {recentPeople.length === 0 && (
            <li className="px-5 py-8 text-center text-xs text-[#a8a29e]">No people added yet.</li>
          )}
        </ul>
      </div>
    </div>
  );
}
