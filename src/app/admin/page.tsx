"use client";

import { useState } from "react";
import { Download, ChevronDown, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";

// Mock Data
const mockBookings = [
  { id: 1, name: "Nota", fellowship: "Pastor", date: "May 2025", time: "4:00 PM", reason: "Proce...", phone: "6559937", email: "Email", status: "Scheduled" },
  { id: 2, name: "Sashira", fellowship: "Pastor", date: "May 2025", time: "5:00 PM", reason: "Proce...", phone: "6559608", email: "Email", status: "Scheduled" },
  { id: 3, name: "Jose B.", fellowship: "Church", date: "May 2025", time: "3:00 PM", reason: "Proce...", phone: "6559959", email: "Email", status: "Scheduled" },
  { id: 4, name: "Cose", fellowship: "Pastor", date: "May 2025", time: "6:00 PM", reason: "Proce...", phone: "6559697", email: "Email", status: "Scheduled" },
  { id: 5, name: "Kuda Domin", fellowship: "Pastor", date: "May 2025", time: "6:30 PM", reason: "Mech...", phone: "6529902", email: "Email", status: "Cancelled" },
  { id: 6, name: "Jeanny", fellowship: "Pastor", date: "May 2025", time: "6:00 PM", reason: "Mech...", phone: "6329967", email: "Email", status: "Cancelled" },
  { id: 7, name: "Janes", fellowship: "Pastor", date: "May 2023", time: "6:30 PM", reason: "Mech...", phone: "5328907", email: "Email", status: "Scheduled" },
];

export default function AdminDashboard() {
  const router = useRouter();

  const handleLogout = () => {
    // Mock logout
    router.push("/admin/login");
  };

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
            <button className="flex items-center gap-2 px-3 py-1.5 border border-slate-200 bg-white rounded-md text-sm font-medium hover:bg-slate-50">
              Last 7 days <ChevronDown className="w-4 h-4" />
            </button>
            <button className="flex items-center gap-2 px-3 py-1.5 border border-slate-200 bg-white rounded-md text-sm font-medium hover:bg-slate-50">
              Cash <ChevronDown className="w-4 h-4" />
            </button>
            <button onClick={handleLogout} className="flex items-center gap-2 px-3 py-1.5 border border-slate-200 bg-white text-red-600 rounded-md text-sm font-medium hover:bg-red-50">
              <LogOut className="w-4 h-4" /> Logout
            </button>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <KpiCard title="Total Meetings" value="18" />
          <KpiCard title="Upcoming Meetings" value="7 Days" />
          <KpiCard title="Cancellations" value="0" />
          <KpiCard title="New Fellowship Int..." value="2" />
        </div>

        {/* Data Table Area */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="p-5 border-b border-slate-200 flex justify-between items-center bg-white">
            <h2 className="font-semibold text-lg">Data Table</h2>
            <button className="flex items-center gap-2 px-3 py-1.5 border border-slate-200 rounded-md text-sm font-medium hover:bg-slate-50 text-slate-600">
              <Download className="w-4 h-4" /> Export CSV
            </button>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-slate-500 bg-slate-50 border-b border-slate-200 uppercase">
                <tr>
                  <th className="px-6 py-4 font-medium">Name <ChevronDown className="w-3 h-3 inline" /></th>
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
                {mockBookings.map((booking) => (
                  <tr key={booking.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 font-medium text-slate-900">{booking.name}</td>
                    <td className="px-6 py-4 text-slate-600">{booking.fellowship}</td>
                    <td className="px-6 py-4 text-slate-600">{booking.date}</td>
                    <td className="px-6 py-4 text-slate-600">{booking.time}</td>
                    <td className="px-6 py-4 text-slate-600">{booking.reason}</td>
                    <td className="px-6 py-4 text-slate-600">{booking.phone}</td>
                    <td className="px-6 py-4 text-slate-600">{booking.email}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${
                        booking.status === 'Scheduled' 
                          ? 'bg-green-50 text-green-700 border-green-200' 
                          : 'bg-red-50 text-red-700 border-red-200'
                      }`}>
                        {booking.status}
                      </span>
                    </td>
                  </tr>
                ))}
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
