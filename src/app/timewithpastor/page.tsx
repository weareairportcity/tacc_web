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
import Link from "next/link";

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
      <div className="min-h-screen bg-white flex items-center justify-center p-6 relative">
        <div className="relative z-10 w-full max-w-md animate-in fade-in zoom-in duration-300">
          <div className="bg-white border-2 border-black">
            <div className="bg-black py-10 px-6 text-center">
              <div className="w-16 h-16 mx-auto bg-white flex items-center justify-center border-2 border-white mb-4">
                <Check className="w-8 h-8 text-black" strokeWidth={4} />
              </div>
              <h2 className="text-2xl font-black text-white uppercase tracking-tighter">Confirmed</h2>
              <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mt-1">Your appointment is set</p>
            </div>
            
            <div className="p-8 space-y-6">
              <div className="bg-slate-50 border border-slate-200 p-6 space-y-4">
                <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-slate-400">
                  <span>ID</span>
                  <span className="text-black">TACC-{bookingDetails.id?.split('-')[0].toUpperCase()}</span>
                </div>
                <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-slate-400">
                  <span>Date</span>
                  <span className="text-black">{bookingDetails.date}</span>
                </div>
                <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-slate-400">
                  <span>Time</span>
                  <span className="text-black">{bookingDetails.time}</span>
                </div>
              </div>

              <button 
                onClick={() => window.location.href = '/'}
                className="w-full py-4 bg-black text-white font-black text-xs uppercase tracking-[0.2em] hover:bg-slate-800 transition-all"
              >
                Return Home
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-4 md:p-8 relative font-sans">
      <div className="relative z-10 w-full max-w-5xl bg-white border-2 border-black overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-500">
        <div className="p-6 md:p-12">
          <h1 className="text-3xl md:text-5xl font-black text-black text-center mb-12 uppercase tracking-tighter italic">
            Make an Appointment
          </h1>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            
            {/* Left: Calendar */}
            <div className="space-y-6">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">01. Select Date</h3>
              
              <div className="bg-white border border-slate-200 p-6">
                <div className="flex items-center justify-between mb-8 border-b border-slate-100 pb-4">
                  <button onClick={prevMonth} className="p-1 hover:bg-slate-100 transition-colors">
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <span className="text-sm font-black uppercase tracking-widest">
                    {format(currentMonth, "MMMM yyyy")}
                  </span>
                  <button onClick={nextMonth} className="p-1 hover:bg-slate-100 transition-colors">
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>

                <div className="grid grid-cols-7 gap-1 mb-2">
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
                          aspect-square flex items-center justify-center text-xs font-bold transition-all border
                          ${isBlocked ? 'text-slate-100 border-transparent cursor-not-allowed' : 'text-slate-600 border-transparent hover:border-black'}
                          ${isSelected ? 'bg-black text-white !border-black scale-110 z-10' : ''}
                        `}
                      >
                        {format(day, "d")}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Right: Form & Time */}
            <div className="space-y-8">
              <div className="space-y-4">
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">02. Personal Info</h3>
                <div className="space-y-2">
                  <input 
                    type="email" 
                    placeholder="EMAIL@EXAMPLE.COM"
                    className="w-full px-4 py-4 bg-slate-50 border border-slate-200 text-xs font-bold focus:outline-none focus:border-black transition-all placeholder:text-slate-300 uppercase tracking-widest"
                    value={formData.email}
                    onChange={(e) => setFormData({...formData, email: e.target.value})}
                  />
                  <input 
                    type="text" 
                    placeholder="YOUR FULL NAME"
                    className="w-full px-4 py-4 bg-slate-50 border border-slate-200 text-xs font-bold focus:outline-none focus:border-black transition-all placeholder:text-slate-300 uppercase tracking-widest"
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                  />
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">03. Select Time</h3>
                {selectedDate ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 relative min-h-[160px]">
                    {isLoadingAvailability && (
                      <div className="absolute inset-0 bg-white/80 flex items-center justify-center z-10">
                        <Loader2 className="w-6 h-6 animate-spin" />
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
                            py-3 text-[10px] font-black uppercase tracking-widest transition-all border
                            ${isBooked ? 'bg-slate-50 text-slate-200 border-slate-50 cursor-not-allowed line-through' : 'bg-white text-black border-slate-200 hover:border-black'}
                            ${isSelected ? 'bg-black !text-white !border-black scale-105 z-10' : ''}
                          `}
                        >
                          {displayTime}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="bg-slate-50 border border-dashed border-slate-200 p-8 text-center">
                    <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Select a date first</p>
                  </div>
                )}
              </div>

              <div className="border border-black p-4 flex items-center gap-3">
                <Info className="w-4 h-4" />
                <p className="text-[10px] font-black uppercase tracking-widest">Times in GMT (Accra)</p>
              </div>
            </div>
          </div>

          <div className="mt-12 flex flex-col items-center gap-4">
            {statusMessage && <p className="text-red-500 text-[10px] font-black uppercase tracking-widest">{statusMessage}</p>}
            <button 
              disabled={isSubmitting || !selectedDate || !selectedTime || !formData.email || !formData.name}
              onClick={handleBooking}
              className="px-16 py-6 bg-black text-white font-black text-xs uppercase tracking-[0.3em] hover:bg-slate-800 transition-all disabled:opacity-20 disabled:cursor-not-allowed flex items-center gap-4"
            >
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirm Appointment'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
