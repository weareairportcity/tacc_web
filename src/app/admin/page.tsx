"use client";

import { useState, useEffect } from "react";
import { Download, ChevronDown, LogOut, Loader2, Calendar, Users, Ban, Trash2, ArrowRight } from "lucide-react";
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
    return <div className="min-h-screen bg-slate-50 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>;
  }

  return (
    <div className="min-h-screen bg-slate-50/50 text-slate-900 font-sans p-4 md:p-10 relative overflow-hidden">
      {/* Subtle Grid Background */}
      <div className="absolute inset-0 z-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'linear-gradient(#4f46e5 1px, transparent 1px), linear-gradient(90deg, #4f46e5 1px, transparent 1px)', backgroundSize: '60px 60px' }}></div>

      <div className="relative z-10 max-w-7xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-100">
              <Calendar className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">Admin Console</h1>
              <p className="text-sm font-medium text-slate-400">Manage church appointments & availability</p>
            </div>
          </div>
          <button onClick={handleLogout} className="flex items-center justify-center gap-2 px-6 py-3 bg-slate-100 text-slate-600 rounded-2xl text-xs font-bold hover:bg-slate-200 transition-all active:scale-95">
            <LogOut className="w-4 h-4" /> Sign Out
          </button>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <KpiCard title="Total Sessions" value={totalMeetings.toString()} icon={<Users className="w-5 h-5" />} color="blue" />
          <KpiCard title="Upcoming" value={upcomingMeetings.toString()} icon={<Calendar className="w-5 h-5" />} color="blue" />
          <KpiCard title="Cancelled" value={cancellations.toString()} icon={<Ban className="w-5 h-5" />} color="red" />
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Bookings List */}
          <div className="lg:col-span-2 bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden self-start">
            <div className="p-8 border-b border-slate-100 flex justify-between items-center">
              <h2 className="font-bold text-lg text-slate-900">Appointment Ledger</h2>
              <span className="px-3 py-1 bg-blue-50 text-blue-600 rounded-full text-[10px] font-black uppercase tracking-widest">Live Updates</span>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left border-collapse">
                <thead>
                  <tr className="text-[10px] text-slate-400 border-b border-slate-100 uppercase tracking-widest">
                    <th className="px-8 py-5 font-black">Attendee Info</th>
                    <th className="px-8 py-5 font-black">Group/Fellowship</th>
                    <th className="px-8 py-5 font-black">Status</th>
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
                  <tbody key={date}>
                    <tr className="bg-slate-50/50">
                      <td colSpan={3} className="px-8 py-4 text-[11px] font-bold text-slate-500 border-y border-slate-100 uppercase tracking-wide">
                        {format(new Date(date), 'EEEE, MMMM dd, yyyy')}
                      </td>
                    </tr>
                    {dayBookings
                      .sort((a, b) => a.meeting_time.localeCompare(b.meeting_time))
                      .map((booking) => (
                        <tr key={booking.id} className="hover:bg-slate-50/30 transition-colors border-b border-slate-50 last:border-0">
                          <td className="px-8 py-6">
                            <div className="font-bold text-slate-900 mb-1">{booking.name}</div>
                            <div className="text-xs text-slate-400 flex flex-col gap-1 font-medium">
                              <span>{booking.email}</span>
                              <span className="text-blue-600">{booking.phone}</span>
                            </div>
                            <div className="mt-4 flex items-center gap-2">
                              <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-3 py-1 rounded-full uppercase tracking-widest border border-blue-100">
                                {booking.meeting_time}
                              </span>
                            </div>
                            {booking.reason && (
                              <div className="mt-3 p-3 bg-slate-50 rounded-xl text-[11px] text-slate-500 leading-relaxed border border-slate-100/50">
                                "{booking.reason}"
                              </div>
                            )}
                          </td>
                          <td className="px-8 py-6 align-top">
                            <span className="text-xs font-bold text-slate-600 uppercase tracking-tight bg-slate-100 px-3 py-1 rounded-lg">
                              {booking.fellowship || 'N/A'}
                            </span>
                          </td>
                          <td className="px-8 py-6 align-top">
                            <select
                              value={booking.status}
                              onChange={(e) => handleStatusChange(booking.id, e.target.value)}
                              className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border bg-white cursor-pointer transition-all focus:outline-none shadow-sm ${
                                booking.status === 'Scheduled' 
                                  ? 'text-blue-600 border-blue-100 hover:border-blue-300' 
                                  : booking.status === 'Completed'
                                  ? 'text-slate-400 border-slate-200'
                                  : 'text-red-500 border-red-100 hover:border-red-300'
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
              </table>
              {bookings.length === 0 && (
                <div className="p-20 text-center text-slate-300 font-bold uppercase text-xs tracking-widest italic">
                  No records found in database.
                </div>
              )}
            </div>
          </div>

          {/* Availability Sidebar */}
          <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden self-start">
            <div className="p-8 border-b border-slate-100">
              <h2 className="font-bold text-lg text-slate-900 mb-1">Blackout Dates</h2>
              <p className="text-xs font-medium text-slate-400">Block specific days from the calendar</p>
            </div>
            <div className="p-8 space-y-8">
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
                className="space-y-4"
              >
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Select Date</label>
                  <input 
                    type="date" 
                    name="date"
                    required
                    className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold focus:outline-none focus:ring-4 focus:ring-blue-50 focus:border-blue-400 transition-all"
                  />
                </div>
                <button type="submit" className="w-full py-4 bg-slate-900 text-white text-[10px] font-black uppercase tracking-[0.2em] rounded-2xl hover:bg-black transition-all shadow-lg active:scale-95 flex items-center justify-center gap-2">
                  Add Restriction <Ban className="w-3 h-3" />
                </button>
              </form>

              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Current Restrictions</label>
                <div className="max-h-[300px] overflow-y-auto pr-2 space-y-2 scrollbar-hide">
                  <BlockedDatesList supabase={supabase} />
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

function KpiCard({ title, value, icon, color }: { title: string, value: string, icon: React.ReactNode, color: 'blue' | 'red' }) {
  const isBlue = color === 'blue';
  return (
    <div className="bg-white border border-slate-200 rounded-[2.5rem] p-8 flex flex-col justify-between shadow-sm hover:border-slate-300 transition-all cursor-default relative overflow-hidden group">
      <div className={`absolute top-0 right-0 w-24 h-24 -mr-8 -mt-8 rounded-full opacity-[0.03] group-hover:scale-110 transition-transform ${isBlue ? 'bg-blue-600' : 'bg-red-600'}`}></div>
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">{title}</h3>
        <div className={`p-2.5 rounded-xl ${isBlue ? 'bg-blue-50 text-blue-600' : 'bg-red-50 text-red-600'}`}>
          {icon}
        </div>
      </div>
      <p className="text-5xl font-black tracking-tighter text-slate-900">{value}</p>
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

  if (loading) return <div className="text-[10px] text-slate-400 font-black uppercase py-4">Checking...</div>;
  if (dates.length === 0) return <div className="text-[10px] text-slate-400 text-center py-6 border border-dashed border-slate-100 rounded-2xl uppercase tracking-widest">No restrictions</div>;

  const removeDate = async (id: string) => {
    const { error } = await supabase.from('blocked_dates').delete().eq('id', id);
    if (error) alert(error.message);
    else setDates(prev => prev.filter(d => d.id !== id));
  };

  return (
    <>
      {dates.map((d) => (
        <div key={d.id} className="group flex justify-between items-center px-5 py-4 rounded-2xl bg-slate-50/50 border border-slate-100 hover:bg-slate-50 transition-all">
          <span className="text-xs font-bold text-slate-600 tracking-tight">{format(new Date(d.blocked_date), 'EEE, MMM dd, yyyy')}</span>
          <button 
            onClick={() => removeDate(d.id)}
            className="p-2 text-slate-300 hover:text-red-500 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ))}
    </>
  );
}
