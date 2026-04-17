"use client";

import { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, Loader2, Check, Calendar as CalendarIcon, Clock, User, Phone as PhoneIcon, Mail, Info } from "lucide-react";
import { 
  format, 
  addMonths, 
  subMonths, 
  startOfMonth, 
  endOfMonth, 
  eachDayOfInterval, 
  isSameMonth, 
  isSameDay, 
  addDays, 
  isBefore, 
  startOfDay,
  getDay
} from "date-fns";
import { getAccraTime, isBookableDay, AVAILABLE_SLOTS } from "@/lib/date-utils";
import { createClient } from "@/utils/supabase/client";

export default function BookingPage() {
  const [currentMonth, setCurrentMonth] = useState(getAccraTime());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [bookedSlots, setBookedSlots] = useState<string[]>([]);
  const [blockedDates, setBlockedDates] = useState<Set<string>>(new Set());
  const [isLoadingAvailability, setIsLoadingAvailability] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [bookingDetails, setBookingDetails] = useState<any>(null);

  const [formData, setFormData] = useState({
    name: "",
    fellowship: "",
    phone: "",
    email: "",
    reason: "",
  });

  // Fetch blocked dates on mount
  useEffect(() => {
    async function fetchBlocked() {
      const { data } = await createClient().from('blocked_dates').select('blocked_date');
      setBlockedDates(new Set(data?.map(d => d.blocked_date)));
    }
    fetchBlocked();
  }, []);

  // Fetch availability when date changes
  useEffect(() => {
    if (selectedDate) {
      const fetchBooked = async () => {
        setIsLoadingAvailability(true);
        try {
          const dateStr = selectedDate.toISOString().split('T')[0];
          const res = await fetch(`/api/bookings/availability?date=${dateStr}`);
          const data = await res.json();
          setBookedSlots(data.bookedSlots || []);
        } catch (err) {
          console.error(err);
        } finally {
          setIsLoadingAvailability(false);
        }
      };
      fetchBooked();
    }
  }, [selectedDate]);

  const handleBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDate || !selectedTime) {
      alert("Please select a date and time");
      return;
    }

    setIsSubmitting(true);
    setStatusMessage("");

    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          date: selectedDate.toISOString(),
          time: selectedTime,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Something went wrong");
      }

      setBookingDetails({
        id: data.bookingId,
        date: format(selectedDate, "dd MMMM yyyy"),
        time: selectedTime,
        name: formData.name
      });
      setIsSuccess(true);
    } catch (err: any) {
      setStatusMessage(err.message);
      setIsSubmitting(false);
    }
  };

  // Calendar Logic
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(monthStart);
  const calendarDays = eachDayOfInterval({ start: monthStart, end: monthEnd });
  
  // Fill leading empty days
  const startDay = getDay(monthStart);
  const leadingDays = Array.from({ length: startDay }, (_, i) => null);

  const prevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));
  const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));

  if (isSuccess) {
    return (
      <div className="min-h-screen bg-[#FDFCFB] flex items-center justify-center p-6 relative overflow-hidden">
        {/* Subtle Background */}
        <div className="absolute inset-0 z-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(#0077E6 1px, transparent 1px)', backgroundSize: '24px 24px' }}></div>
        
        <div className="relative z-10 w-full max-w-md animate-in fade-in zoom-in duration-500">
          <div className="bg-white rounded-[2rem] shadow-2xl shadow-blue-100/50 border border-slate-100 overflow-hidden">
            <div className="bg-[#0077E6] py-10 px-6 text-center relative">
              <div className="absolute -top-10 left-1/2 -translate-x-1/2 w-20 h-20 bg-white rounded-2xl flex items-center justify-center shadow-xl rotate-3 transition-transform hover:rotate-0">
                <Check className="w-10 h-10 text-[#0077E6]" strokeWidth={3} />
              </div>
              <h2 className="text-3xl font-black text-white mt-8 tracking-tight">Congrats!</h2>
              <p className="text-blue-100 text-sm mt-1 font-medium">Your appointment is confirmed</p>
            </div>
            
            <div className="p-8 space-y-6">
              <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100">
                <div className="flex justify-between items-center pb-4 border-b border-slate-200/50">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Meeting ID</span>
                  <span className="text-sm font-bold text-slate-700">TACC-{bookingDetails.id?.split('-')[0].toUpperCase()}</span>
                </div>
                <div className="flex justify-between items-center py-4 border-b border-slate-200/50">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Date</span>
                  <span className="text-sm font-bold text-slate-700">{bookingDetails.date}</span>
                </div>
                <div className="flex justify-between items-center pt-4">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Time</span>
                  <span className="text-sm font-bold text-slate-700">{bookingDetails.time}</span>
                </div>
              </div>

              <button 
                onClick={() => window.location.reload()}
                className="w-full py-4 rounded-xl bg-[#0077E6] text-white font-bold text-sm shadow-xl shadow-blue-100 hover:bg-blue-700 transition-all active:scale-95"
              >
                Back to Home
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FDFCFB] flex items-center justify-center p-4 md:p-8 relative overflow-hidden font-sans">
      {/* Subtle Background */}
      <div className="absolute inset-0 z-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(#0077E6 1px, transparent 1px)', backgroundSize: '40px 40px' }}></div>

      <div className="relative z-10 w-full max-w-5xl bg-white rounded-[2.5rem] shadow-2xl shadow-blue-100/30 border border-slate-100 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-700">
        <div className="p-6 md:p-12">
          <h1 className="text-3xl md:text-4xl font-black text-[#1C1917] text-center mb-12 tracking-tight">
            Make an Appointment
          </h1>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            
            {/* Left: Calendar */}
            <div className="space-y-6">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Select Date</h3>
              </div>
              
              <div className="bg-slate-50 rounded-3xl p-6 border border-slate-100">
                <div className="flex items-center justify-between mb-8">
                  <button onClick={prevMonth} className="p-2 hover:bg-white rounded-xl transition-colors border border-transparent hover:border-slate-200">
                    <ChevronLeft className="w-5 h-5 text-slate-600" />
                  </button>
                  <span className="text-lg font-bold text-[#1C1917] tracking-tight">
                    {format(currentMonth, "MMMM yyyy")}
                  </span>
                  <button onClick={nextMonth} className="p-2 hover:bg-white rounded-xl transition-colors border border-transparent hover:border-slate-200">
                    <ChevronRight className="w-5 h-5 text-slate-600" />
                  </button>
                </div>

                <div className="grid grid-cols-7 gap-2 mb-2">
                  {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(d => (
                    <div key={d} className="text-center text-[10px] font-black text-slate-300 py-2">{d}</div>
                  ))}
                  {leadingDays.map((_, i) => <div key={`empty-${i}`} />)}
                  {calendarDays.map((day) => {
                    const dateStr = day.toISOString().split('T')[0];
                    const isBlocked = blockedDates.has(dateStr) || !isBookableDay(day) || isBefore(day, startOfDay(getAccraTime()));
                    const isSelected = selectedDate && isSameDay(day, selectedDate);
                    
                    return (
                      <button
                        key={day.toISOString()}
                        disabled={isBlocked}
                        onClick={() => {
                          setSelectedDate(day);
                          setSelectedTime(null);
                        }}
                        className={`
                          aspect-square rounded-xl flex items-center justify-center text-sm font-bold transition-all relative
                          ${isBlocked ? 'text-slate-200 cursor-not-allowed' : 'text-slate-600 hover:bg-white hover:shadow-lg hover:scale-110'}
                          ${isSelected ? 'bg-[#0077E6] text-white shadow-xl shadow-blue-200 scale-110 !hover:bg-[#0077E6]' : ''}
                        `}
                      >
                        {format(day, "d")}
                        {isSelected && <div className="absolute -bottom-1 w-1 h-1 bg-white rounded-full"></div>}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Right: Form & Time */}
            <div className="space-y-8">
              <div className="space-y-4">
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input 
                    type="email" 
                    placeholder="Enter your email"
                    className="w-full pl-12 pr-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all placeholder:text-slate-400"
                    value={formData.email}
                    onChange={(e) => setFormData({...formData, email: e.target.value})}
                  />
                </div>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input 
                    type="text" 
                    placeholder="Full Name"
                    className="w-full pl-12 pr-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all placeholder:text-slate-400"
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                  />
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Select Time</h3>
                {selectedDate ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 relative min-h-[160px]">
                    {isLoadingAvailability && (
                      <div className="absolute inset-0 bg-white/50 backdrop-blur-[1px] flex items-center justify-center z-10 rounded-2xl">
                        <Loader2 className="w-6 h-6 animate-spin text-[#0077E6]" />
                      </div>
                    )}
                    {AVAILABLE_SLOTS.map((slot) => {
                      const isBooked = bookedSlots.includes(slot);
                      const isSelected = selectedTime === slot;
                      
                      // Format to 12h
                      const [h, m] = slot.split(':');
                      const hour = parseInt(h);
                      const displayTime = `${hour > 12 ? hour - 12 : hour}:${m} ${hour >= 12 ? 'pm' : 'am'}`;

                      return (
                        <button
                          key={slot}
                          disabled={isBooked}
                          onClick={() => setSelectedTime(slot)}
                          className={`
                            py-3 rounded-xl text-xs font-bold transition-all border
                            ${isBooked ? 'bg-slate-50 text-slate-200 border-slate-50 cursor-not-allowed line-through' : 'bg-[#ADDBFF]/10 text-[#0077E6] border-[#ADDBFF]/20 hover:bg-[#ADDBFF]/20 hover:scale-105'}
                            ${isSelected ? 'bg-[#0077E6] !text-white border-[#0077E6] shadow-xl shadow-blue-100 scale-105' : ''}
                          `}
                        >
                          {displayTime}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="bg-slate-50 rounded-3xl p-8 border border-dashed border-slate-200 text-center">
                    <Clock className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Please select a date first</p>
                  </div>
                )}
              </div>

              <div className="bg-blue-50/50 p-4 rounded-2xl border border-blue-100 flex items-center gap-3">
                <div className="w-6 h-6 rounded-full bg-[#ADDBFF] flex items-center justify-center shrink-0">
                  <Info className="w-3 h-3 text-[#0077E6]" />
                </div>
                <p className="text-[10px] font-bold text-blue-800 uppercase tracking-tight">All times are in Greenwich Mean Time (Accra)</p>
              </div>
            </div>
          </div>

          <div className="mt-12 flex flex-col items-center gap-4">
            {statusMessage && <p className="text-red-500 text-[10px] font-black uppercase">{statusMessage}</p>}
            <button 
              disabled={isSubmitting || !selectedDate || !selectedTime || !formData.email || !formData.name}
              onClick={handleBooking}
              className="px-12 py-5 rounded-2xl bg-[#0077E6] text-white font-black text-xs uppercase tracking-[0.2em] shadow-2xl shadow-blue-200 hover:bg-blue-700 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-3"
            >
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Get Appointment'}
            </button>
          </div>
        </div>
      </div>
    </div>

  );
}
