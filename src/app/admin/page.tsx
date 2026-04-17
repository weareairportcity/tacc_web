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

  const handleStatusChange = async (id: string, currentStatus: string) => {
    const statuses = ['Scheduled', 'Completed', 'Cancelled'];
    const nextIndex = (statuses.indexOf(currentStatus) + 1) % statuses.length;
    const nextStatus = statuses[nextIndex];

    try {
      const { error: updateError } = await supabase
        .from('bookings')
        .update({ status: nextStatus })
        .eq('id', id);

      if (updateError) throw updateError;
      
      setBookings(prev => prev.map(b => b.id === id ? { ...b, status: nextStatus } : b));
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
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 font-sans p-6 md:p-12">
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Admin Portal</h1>
            <p className="text-sm text-slate-500 mt-1">Track meetings, upcoming pastoral sessions, and cancellations.</p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={handleLogout} className="flex items-center gap-2 px-3 py-1.5 border border-slate-200 bg-white text-red-600 rounded-md text-sm font-medium hover:bg-red-50">
              <LogOut className="w-4 h-4" /> Logout
            </button>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <KpiCard title="Total Meetings" value={totalMeetings.toString()} />
          <KpiCard title="Upcoming Meetings" value={upcomingMeetings.toString()} />
          <KpiCard title="Cancellations" value={cancellations.toString()} />
        </div>

        {/* Data Table Area */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="p-5 border-b border-slate-200 flex justify-between items-center bg-white">
            <h2 className="font-semibold text-lg">Data Table</h2>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-slate-500 bg-slate-50 border-b border-slate-200 uppercase">
                <tr>
                  <th className="px-6 py-4 font-medium">Name</th>
                  <th className="px-6 py-4 font-medium">Fellowship</th>
                  <th className="px-6 py-4 font-medium">Date</th>
                  <th className="px-6 py-4 font-medium">Time</th>
                  <th className="px-6 py-4 font-medium">Reason</th>
                  <th className="px-6 py-4 font-medium">Phone</th>
                  <th className="px-6 py-4 font-medium">Email</th>
                  <th className="px-6 py-4 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {bookings.map((booking) => (
                  <tr key={booking.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 font-medium text-slate-900">{booking.name}</td>
                    <td className="px-6 py-4 text-slate-600">{booking.fellowship}</td>
                    <td className="px-6 py-4 text-slate-600">{format(new Date(booking.meeting_date), 'MMM dd, yyyy')}</td>
                    <td className="px-6 py-4 text-slate-600">{booking.meeting_time}</td>
                    <td className="px-6 py-4 text-slate-600 max-w-xs truncate" title={booking.reason}>{booking.reason}</td>
                    <td className="px-6 py-4 text-slate-600">{booking.phone}</td>
                    <td className="px-6 py-4 text-slate-600">{booking.email}</td>
                    <td className="px-6 py-4">
                      <button 
                        onClick={() => handleStatusChange(booking.id, booking.status)}
                        className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors cursor-pointer hover:opacity-80 ${
                        booking.status === 'Scheduled' 
                          ? 'bg-green-50 text-green-700 border-green-200' 
                          : booking.status === 'Completed'
                          ? 'bg-blue-50 text-blue-700 border-blue-200'
                          : 'bg-red-50 text-red-700 border-red-200'
                      }`}>
                        {booking.status}
                      </button>
                    </td>
                  </tr>
                ))}
                {bookings.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-6 py-8 text-center text-slate-500">No bookings found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}

function KpiCard({ title, value }: { title: string, value: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between">
      <h3 className="text-sm font-medium text-slate-500 mb-4">{title}</h3>
      <p className="text-3xl font-semibold text-slate-900">{value}</p>
    </div>
  );
}
