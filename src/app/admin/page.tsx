"use client";

import { useState, useEffect } from "react";
import { Download, ChevronDown, LogOut, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { createClient } from "@/utils/supabase/client";

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

export default function AdminDashboard() {
  const router = useRouter();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
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
  const upcomingMeetings = bookings.filter(b => new Date(b.meeting_date) >= new Date()).length;
  const cancellations = bookings.filter(b => b.status === 'Cancelled').length;

  if (isLoading) {
    return <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-slate-500" /></div>;
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 font-sans p-4 md:p-12">
      <div className="max-w-6xl mx-auto space-y-6 md:space-y-8">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl md:text-3xl font-black tracking-tight text-[#1C1917]">Admin Portal</h1>
            <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mt-1">Track meetings and pastoral sessions.</p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={handleLogout} className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-2.5 bg-white border border-slate-200 text-red-600 rounded-xl text-xs font-bold hover:bg-red-50 transition-all shadow-sm">
              <LogOut className="w-4 h-4" /> Logout
            </button>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <KpiCard title="Total Meetings" value={totalMeetings.toString()} color="#0077E6" />
          <KpiCard title="Upcoming Meetings" value={upcomingMeetings.toString()} color="#0077E6" />
          <KpiCard title="Cancellations" value={cancellations.toString()} color="#F87171" />
        </div>

        {/* Manage Availability */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Data Table Area */}
          <div className="lg:col-span-2 bg-white border border-slate-100 rounded-3xl overflow-hidden self-start shadow-xl shadow-slate-200/50">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white">
              <h2 className="font-bold text-lg text-[#1C1917]">Bookings List</h2>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-[10px] text-slate-400 bg-slate-50/50 border-b border-slate-100 uppercase tracking-widest">
                  <tr>
                    <th className="px-6 py-4 font-black">Name / Contact</th>
                    <th className="px-6 py-4 font-black">Fellowship</th>
                    <th className="px-6 py-4 font-black">Status</th>
                  </tr>
                </thead>
                {Object.entries(
                  bookings.reduce((acc, booking) => {
                    const date = booking.meeting_date;
                    if (!acc[date]) acc[date] = [];
                    acc[date].push(booking);
                    return acc;
                  }, {} as Record<string, Booking[]>)
                )
                .sort(([dateA], [dateB]) => new Date(dateA).getTime() - new Date(dateB).getTime())
                .map(([date, dayBookings]) => (
                  <tbody key={date} className="border-b border-slate-100 last:border-0">
                    <tr className="bg-slate-50/30">
                      <td colSpan={3} className="px-6 py-2.5 text-[10px] font-black text-[#0077E6] uppercase tracking-widest border-y border-slate-50">
                        {format(new Date(date), 'EEEE, MMM dd, yyyy')}
                      </td>
                    </tr>
                    {dayBookings
                      .sort((a, b) => a.meeting_time.localeCompare(b.meeting_time))
                      .map((booking) => (
                        <tr key={booking.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-6 py-5">
                            <div className="font-bold text-[#1C1917]">{booking.name}</div>
                            <div className="text-xs text-slate-500 flex flex-col gap-0.5 mt-1 font-medium">
                              <span>{booking.email}</span>
                              <span className="text-[#0077E6]">{booking.phone}</span>
                            </div>
                            <div className="mt-3 text-[10px] font-black text-slate-500 bg-slate-100/80 inline-block px-2 py-0.5 rounded-lg border border-slate-200/50">
                              {booking.meeting_time}
                            </div>
                          </td>
                          <td className="px-6 py-5 text-slate-600 font-bold text-xs uppercase tracking-tight">{booking.fellowship}</td>
                          <td className="px-6 py-5">
                            <select
                              value={booking.status}
                              onChange={(e) => handleStatusChange(booking.id, e.target.value)}
                              className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider border bg-white cursor-pointer transition-all focus:outline-none focus:ring-2 focus:ring-blue-100 ${
                                booking.status === 'Scheduled' 
                                  ? 'text-green-600 border-green-100 bg-green-50/30' 
                                  : booking.status === 'Completed'
                                  ? 'text-[#0077E6] border-blue-100 bg-blue-50/30'
                                  : 'text-red-600 border-red-100 bg-red-50/30'
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
                ))}
                {bookings.length === 0 && (
                  <tbody>
                    <tr>
                      <td colSpan={3} className="px-6 py-16 text-center text-slate-400 font-bold uppercase text-[10px] tracking-[0.2em] italic">No bookings found.</td>
                    </tr>
                  </tbody>
                )}
              </table>
            </div>
          </div>

          {/* Blocked Dates Sidebar */}
          <div className="bg-white border border-slate-100 rounded-3xl overflow-hidden self-start shadow-xl shadow-slate-200/50">
            <div className="p-6 border-b border-slate-100 bg-[#1C1917]">
              <h2 className="font-bold text-lg text-white">Blocked Dates</h2>
              <p className="text-[10px] font-black uppercase text-white/40 tracking-widest mt-1">Prevent bookings on specific days.</p>
            </div>
            <div className="p-6 space-y-6">
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
                className="flex gap-2"
              >
                <input 
                  type="date" 
                  name="date"
                  required
                  className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-[#0077E6] transition-all"
                />
                <button type="submit" className="px-6 py-2.5 bg-[#0077E6] text-white rounded-xl text-xs font-black uppercase tracking-wider hover:bg-blue-700 transition-all shadow-lg shadow-blue-100">
                  Block
                </button>
              </form>

              <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 scrollbar-hide">
                <BlockedDatesList supabase={supabase} />
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

function KpiCard({ title, value, color }: { title: string, value: string, color: string }) {
  return (
    <div className="bg-white border border-slate-100 rounded-[2rem] p-8 flex flex-col justify-between shadow-xl shadow-slate-200/50 hover:scale-[1.02] transition-transform cursor-default">
      <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">{title}</h3>
      <p className="text-4xl font-black tracking-tighter" style={{ color }}>{value}</p>
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

  if (loading) return <div className="text-xs text-slate-400">Loading...</div>;
  if (dates.length === 0) return <div className="text-xs text-slate-400 text-center py-4 italic">No dates blocked.</div>;

  const removeDate = async (id: string) => {
    const { error } = await supabase.from('blocked_dates').delete().eq('id', id);
    if (error) alert(error.message);
    else setDates(prev => prev.filter(d => d.id !== id));
  };

  return (
    <>
      {dates.map((d) => (
        <div key={d.id} className="flex justify-between items-center p-2 rounded-lg bg-slate-50 border border-slate-100">
          <span className="text-sm font-medium text-slate-700">{format(new Date(d.blocked_date), 'EEE, MMM dd, yyyy')}</span>
          <button 
            onClick={() => removeDate(d.id)}
            className="text-xs text-red-500 hover:text-red-700 font-medium"
          >
            Remove
          </button>
        </div>
      ))}
    </>
  );
}
