"use client";

import { useState, useEffect } from "react";
import { Download, ChevronDown, LogOut, Loader2, Calendar, Users, Ban, Trash2, ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { createClient } from "@/utils/supabase/client";
import Image from "next/image";

type Booking = {
  id: string;
  created_at: string;
  meeting_date: string;
  meeting_time: string;
  name: string;
  fellowship: string;
  phone: string;
  email: string;
  reason: string;
  status: string;
};

type TabType = 'Upcoming' | 'Completed' | 'Cancelled';

export default function AdminDashboard() {
  const router = useRouter();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<TabType>('Upcoming');
  const supabase = createClient();

  useEffect(() => {
    async function fetchBookings() {
      try {
        const { data, error: fetchError } = await supabase
          .from('bookings')
          .select('*')
          .order('created_at', { ascending: false });

        if (fetchError) throw fetchError;
        setBookings(data || []);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    }
    fetchBookings();
  }, [supabase]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/admin/login");
    router.refresh();
  };

  const handleStatusChange = async (id: string, newStatus: string) => {
    if (newStatus === 'Completed') {
      const confirmed = window.confirm("Are you sure you want to mark this as Completed? This will send a Thank You email and SMS to the user.");
      if (!confirmed) return;
    } else if (newStatus === 'Cancelled') {
      const confirmed = window.confirm("Are you sure you want to Cancel this appointment? This will send a Cancellation email and SMS to the user.");
      if (!confirmed) return;
    }

    try {
      const res = await fetch("/api/bookings/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: newStatus })
      });

      if (!res.ok) throw new Error("Failed to update status");
      
      setBookings(prev => prev.map(b => b.id === id ? { ...b, status: newStatus } : b));
    } catch (err: any) {
      alert("Failed to update status: " + err.message);
    }
  };

  const totalMeetings = bookings.length;
  const upcomingMeetings = bookings.filter(b => b.status === 'Scheduled').length;
  const cancellations = bookings.filter(b => b.status === 'Cancelled').length;
  const newFellowships = Array.from(new Set(bookings.filter(b => b.fellowship).map(b => b.fellowship))).length;

  // Filtering Logic
  const filteredBookings = bookings.filter(b => {
    if (activeTab === 'Upcoming') return b.status === 'Scheduled';
    if (activeTab === 'Completed') return b.status === 'Completed';
    if (activeTab === 'Cancelled') return b.status === 'Cancelled';
    return true;
  });

  // Grouping Logic for 'Upcoming'
  let groupedBookings: Record<string, Booking[]> = {};
  let sortedDates: string[] = [];

  if (activeTab === 'Upcoming') {
    filteredBookings.forEach(b => {
      if (!groupedBookings[b.meeting_date]) groupedBookings[b.meeting_date] = [];
      groupedBookings[b.meeting_date].push(b);
    });
    sortedDates = Object.keys(groupedBookings).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
  } else {
    // For Completed/Cancelled, sort by meeting date descending (most recent first)
    filteredBookings.sort((a, b) => new Date(b.meeting_date).getTime() - new Date(a.meeting_date).getTime());
  }

  const renderBookingTable = (bookingsToRender: Booking[], showDateColumn = true) => (
    <div className="hidden lg:block border border-slate-200 rounded-xl overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left whitespace-nowrap bg-white">
          <thead className="text-xs text-slate-500 bg-slate-50/80 border-b border-slate-200">
            <tr>
              <th className="px-6 py-4 font-medium">Name <ChevronDown className="w-3 h-3 inline ml-1" /></th>
              <th className="px-6 py-4 font-medium">Fellowship</th>
              {showDateColumn && <th className="px-6 py-4 font-medium">Date</th>}
              <th className="px-6 py-4 font-medium">Time</th>
              <th className="px-6 py-4 font-medium">Reason</th>
              <th className="px-6 py-4 font-medium">Phone</th>
              <th className="px-6 py-4 font-medium">Email</th>
              <th className="px-6 py-4 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {bookingsToRender.map((booking) => (
              <tr key={booking.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50 transition-colors text-slate-600">
                <td className="px-6 py-4 text-slate-900 font-medium">{booking.name}</td>
                <td className="px-6 py-4">{booking.fellowship || '-'}</td>
                {showDateColumn && <td className="px-6 py-4 text-slate-700">{format(new Date(booking.meeting_date), 'MMM dd, yyyy')}</td>}
                <td className="px-6 py-4 text-slate-700">{booking.meeting_time}</td>
                <td className="px-6 py-4 max-w-[150px] truncate">{booking.reason}</td>
                <td className="px-6 py-4">{booking.phone}</td>
                <td className="px-6 py-4 text-slate-500">{booking.email}</td>
                <td className="px-6 py-4">
                  <select
                    value={booking.status}
                    onChange={(e) => handleStatusChange(booking.id, e.target.value)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium border cursor-pointer focus:outline-none focus:ring-2 focus:ring-slate-200 transition-colors ${
                      booking.status === 'Scheduled' 
                        ? 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100' 
                        : booking.status === 'Completed'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                        : 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100'
                    }`}
                  >
                    <option value="Scheduled">Scheduled</option>
                    <option value="Completed">Completed</option>
                    <option value="Cancelled">Cancelled</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderBookingCards = (bookingsToRender: Booking[], showDate = true) => (
    <div className="lg:hidden flex flex-col gap-4">
      {bookingsToRender.map((booking) => (
        <div key={booking.id} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col gap-3">
          <div className="flex justify-between items-start">
            <div>
              <h3 className="font-semibold text-slate-900">{booking.name}</h3>
              <p className="text-xs text-slate-500">{booking.fellowship || 'No Fellowship'}</p>
            </div>
            <select
              value={booking.status}
              onChange={(e) => handleStatusChange(booking.id, e.target.value)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium border cursor-pointer focus:outline-none ${
                booking.status === 'Scheduled' 
                  ? 'bg-blue-50 text-blue-700 border-blue-200' 
                  : booking.status === 'Completed'
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-red-50 text-red-700 border-red-200'
              }`}
            >
              <option value="Scheduled">Scheduled</option>
              <option value="Completed">Completed</option>
              <option value="Cancelled">Cancelled</option>
            </select>
          </div>
          
          <div className="grid grid-cols-2 gap-2 text-sm text-slate-600 mt-1">
            <div>
              <span className="block text-xs text-slate-400 mb-0.5">Date & Time</span>
              {showDate && <div className="font-medium text-slate-700">{format(new Date(booking.meeting_date), 'MMM dd')}</div>}
              <div className="text-xs">{booking.meeting_time}</div>
            </div>
            <div>
              <span className="block text-xs text-slate-400 mb-0.5">Contact</span>
              <div className="truncate text-slate-700 font-medium">{booking.phone}</div>
              <div className="truncate text-xs">{booking.email}</div>
            </div>
          </div>

          {booking.reason && (
            <div className="mt-1 bg-slate-50/80 p-3 rounded-lg border border-slate-100">
              <span className="block text-xs text-slate-400 mb-1 font-medium">Reason</span>
              <p className="text-sm text-slate-700 line-clamp-3">{booking.reason}</p>
            </div>
          )}
        </div>
      ))}
    </div>
  );

  if (isLoading) {
    return <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-slate-900" /></div>;
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 font-sans p-4 sm:p-8 lg:p-12">
      <div className="max-w-[1400px] mx-auto bg-white rounded-2xl shadow-sm border border-slate-200 p-4 sm:p-6 md:p-8">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
          <div className="flex items-center gap-4">
            <Image src="/logo.png" alt="TACC Logo" width={40} height={40} className="object-contain" />
            <div>
              <h1 className="text-xl font-semibold text-slate-900">Admin Portal</h1>
              <p className="text-sm text-slate-500 mt-1">Track church appointments and availability.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button className="flex items-center gap-2 px-3 py-1.5 border border-slate-200 rounded-md text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
              <Download className="w-4 h-4" /> Export CSV
            </button>
            <button onClick={handleLogout} className="flex items-center gap-2 px-3 py-1.5 border border-slate-200 rounded-md text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
              Sign Out <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
          <KpiCard title="Total Meetings" value={totalMeetings.toString()} />
          <KpiCard title="Upcoming Meetings" value={`${upcomingMeetings}`} />
          <KpiCard title="Cancellations" value={cancellations.toString()} />
          <KpiCard title="New Fellowships" value={newFellowships.toString()} />
        </div>

        {/* Data Table Section */}
        <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <h2 className="text-lg font-semibold text-slate-900">Appointments</h2>
          
          {/* Tabs */}
          <div className="flex p-1 bg-slate-100 rounded-lg w-full md:w-[400px]">
            {['Upcoming', 'Completed', 'Cancelled'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab as TabType)}
                className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-all ${
                  activeTab === tab 
                    ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-900/5' 
                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50/50'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        {/* Rendering Logic */}
        {activeTab === 'Upcoming' ? (
          sortedDates.length === 0 ? (
            <div className="text-center py-16 border border-dashed border-slate-200 rounded-xl text-slate-400 text-sm mb-12">
              No upcoming appointments.
            </div>
          ) : (
            <div className="mb-12">
              {sortedDates.map(date => (
                <div key={date} className="mb-10 last:mb-0">
                  <h3 className="text-sm font-bold text-slate-500 mb-4 uppercase tracking-wider pl-2 border-l-2 border-slate-300">
                    {format(new Date(date), 'EEEE, MMMM do, yyyy')}
                  </h3>
                  {renderBookingTable(groupedBookings[date], false)}
                  {renderBookingCards(groupedBookings[date], false)}
                </div>
              ))}
            </div>
          )
        ) : (
          <div className="mb-12">
            {filteredBookings.length === 0 ? (
              <div className="text-center py-16 border border-dashed border-slate-200 rounded-xl text-slate-400 text-sm">
                No {activeTab.toLowerCase()} records found.
              </div>
            ) : (
              <>
                {renderBookingTable(filteredBookings, true)}
                {renderBookingCards(filteredBookings, true)}
              </>
            )}
          </div>
        )}

        {/* Blackout Dates (Moved below table for a cleaner layout matching the mockup) */}
        <div className="border-t border-slate-100 pt-10">
          <div className="max-w-md">
            <h2 className="text-lg font-semibold text-slate-900 mb-2">Blackout Dates</h2>
            <p className="text-sm text-slate-500 mb-6">Block specific days from the calendar</p>
            
            <form 
              onSubmit={async (e) => {
                e.preventDefault();
                const date = (e.target as any).date.value;
                if (!date) return;
                const { error } = await supabase.from('blocked_dates').insert([{ blocked_date: date }]);
                if (error) alert(error.message);
                else {
                  (e.target as any).date.value = '';
                  window.location.reload();
                }
              }}
              className="flex gap-3 mb-6"
            >
              <input 
                type="date" 
                name="date"
                required
                className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-slate-900 focus:border-slate-900"
              />
              <button type="submit" className="px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-md hover:bg-slate-800 transition-colors">
                Block Date
              </button>
            </form>

            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 scrollbar-hide">
              <BlockedDatesList supabase={supabase} />
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

function KpiCard({ title, value }: { title: string, value: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between shadow-sm">
      <h3 className="text-xs font-medium text-slate-500 mb-3 truncate">{title}</h3>
      <p className="text-2xl font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function BlockedDatesList({ supabase }: { supabase: any }) {
  const [dates, setDates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchDates() {
      const { data } = await supabase.from('blocked_dates').select('*').order('blocked_date', { ascending: true });
      setDates(data || []);
      setLoading(false);
    }
    fetchDates();
  }, [supabase]);

  if (loading) return <div className="text-sm text-slate-400 py-2">Loading...</div>;
  if (dates.length === 0) return <div className="text-sm text-slate-400 py-2">No blocked dates.</div>;

  const removeDate = async (id: string) => {
    const { error } = await supabase.from('blocked_dates').delete().eq('id', id);
    if (error) alert(error.message);
    else setDates(prev => prev.filter(d => d.id !== id));
  };

  return (
    <>
      {dates.map((d) => (
        <div key={d.id} className="flex justify-between items-center px-4 py-3 rounded-lg bg-slate-50 border border-slate-100">
          <span className="text-sm text-slate-700">{format(new Date(d.blocked_date), 'EEE, MMM dd, yyyy')}</span>
          <button 
            onClick={() => removeDate(d.id)}
            className="text-slate-400 hover:text-red-500 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ))}
    </>
  );
}
