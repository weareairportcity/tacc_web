"use client";

import { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, Loader2, Check, Calendar as CalendarIcon, Clock, User, Phone as PhoneIcon, Mail, Info, ArrowRight } from "lucide-react";
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
  const [step, setStep] = useState(1); // 1: Date & Time, 2: Personal Info

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

  const handleBooking = async () => {
    if (!selectedDate || !selectedTime) {
      setStep(1);
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
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 font-sans">
        <div className="w-full max-w-lg bg-white rounded-3xl border border-slate-200 shadow-sm p-8 text-center animate-in fade-in zoom-in duration-300">
          <div className="w-20 h-20 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg shadow-blue-200">
            <Check className="w-10 h-10 text-white" strokeWidth={3} />
          </div>
          <h2 className="text-3xl font-bold text-slate-900 mb-2">Booking Confirmed!</h2>
          <p className="text-slate-500 mb-8 font-medium">Your appointment has been successfully scheduled.</p>
          
          <div className="bg-slate-50 rounded-2xl p-6 mb-8 text-left space-y-4 border border-slate-100">
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-400 font-medium">Booking ID</span>
              <span className="text-slate-900 font-bold">TACC-{bookingDetails.id?.split('-')[0].toUpperCase()}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-400 font-medium">Date</span>
              <span className="text-slate-900 font-bold">{bookingDetails.date}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-400 font-medium">Time</span>
              <span className="text-slate-900 font-bold">{bookingDetails.time}</span>
            </div>
          </div>

          <button 
            onClick={() => window.location.href = '/'}
            className="w-full py-4 bg-blue-600 text-white font-bold rounded-2xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-100 active:scale-95"
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50/50 flex flex-col items-center justify-center p-4 md:p-8 relative font-sans">
      {/* Subtle Grid Background */}
      <div className="absolute inset-0 z-0 opacity-[0.05] pointer-events-none" style={{ backgroundImage: 'linear-gradient(#4f46e5 1px, transparent 1px), linear-gradient(90deg, #4f46e5 1px, transparent 1px)', backgroundSize: '40px 40px' }}></div>

      <div className="relative z-10 w-full max-w-4xl bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-700">
        
        {/* Stepper Header */}
        <div className="px-8 pt-10 pb-6 border-b border-slate-100">
          <div className="flex items-center gap-4 mb-8">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-100">
              <CalendarIcon className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Book a Meeting</h1>
              <p className="text-slate-500 text-sm font-medium">Schedule a session with the Pastor.</p>
            </div>
          </div>

          {/* Stepper */}
          <div className="flex items-center gap-4 max-w-md">
            <div className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${step === 1 ? 'bg-blue-600 text-white shadow-lg shadow-blue-100' : 'bg-blue-100 text-blue-600'}`}>01</div>
              <span className={`text-sm font-bold ${step === 1 ? 'text-slate-900' : 'text-slate-400'}`}>Date & Time</span>
            </div>
            <div className="flex-1 h-px bg-slate-100"></div>
            <div className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${step === 2 ? 'bg-blue-600 text-white shadow-lg shadow-blue-100' : 'bg-slate-100 text-slate-400'}`}>02</div>
              <span className={`text-sm font-bold ${step === 2 ? 'text-slate-900' : 'text-slate-400'}`}>Personal Details</span>
            </div>
          </div>
        </div>

        <div className="p-8 md:p-10">
          {step === 1 ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 animate-in fade-in slide-in-from-right-4 duration-500">
              {/* Calendar Section */}
              <div className="space-y-4">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Select Date *</label>
                <div className="bg-slate-50/50 rounded-2xl p-6 border border-slate-100">
                  <div className="flex items-center justify-between mb-8">
                    <button onClick={prevMonth} className="p-2 hover:bg-white rounded-xl transition-colors border border-transparent hover:border-slate-200">
                      <ChevronLeft className="w-5 h-5 text-slate-600" />
                    </button>
                    <span className="text-lg font-bold text-slate-900 tracking-tight">
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
                            ${isSelected ? 'bg-blue-600 text-white shadow-xl shadow-blue-200 scale-110' : ''}
                          `}
                        >
                          {format(day, "d")}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Time Section */}
              <div className="space-y-4">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Select Time *</label>
                {selectedDate ? (
                  <div className="grid grid-cols-2 gap-3 relative min-h-[200px]">
                    {isLoadingAvailability && (
                      <div className="absolute inset-0 bg-white/50 backdrop-blur-[1px] flex items-center justify-center z-10 rounded-2xl">
                        <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
                      </div>
                    )}
                    {AVAILABLE_SLOTS.map((slot) => {
                      const isBooked = bookedSlots.includes(slot);
                      const isSelected = selectedTime === slot;
                      
                      const [h, m] = slot.split(':');
                      const hour = parseInt(h);
                      const displayTime = `${hour > 12 ? hour - 12 : hour}:${m} ${hour >= 12 ? 'pm' : 'am'}`;

                      return (
                        <button
                          key={slot}
                          disabled={isBooked}
                          onClick={() => setSelectedTime(slot)}
                          className={`
                            py-4 rounded-2xl text-xs font-bold transition-all border
                            ${isBooked ? 'bg-slate-50 text-slate-200 border-slate-50 cursor-not-allowed' : 'bg-white text-slate-600 border-slate-100 hover:border-blue-200 hover:bg-blue-50/30'}
                            ${isSelected ? 'bg-blue-600 !text-white border-blue-600 shadow-xl shadow-blue-100 scale-105' : ''}
                          `}
                        >
                          {displayTime}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="bg-slate-50/50 rounded-2xl p-8 border border-dashed border-slate-200 text-center h-[340px] flex flex-col items-center justify-center">
                    <Clock className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Please select a date first</p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500 max-w-2xl mx-auto">
              {/* Form Fields - Restoring all previous fields */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-700 ml-1">Full Name *</label>
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input 
                      type="text" 
                      placeholder="Enter your full name"
                      className="w-full pl-12 pr-6 py-4 bg-white border border-slate-200 rounded-2xl text-sm focus:outline-none focus:ring-4 focus:ring-blue-50 focus:border-blue-400 transition-all placeholder:text-slate-300 font-medium"
                      value={formData.name}
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-700 ml-1">Email Address *</label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input 
                      type="email" 
                      placeholder="email@example.com"
                      className="w-full pl-12 pr-6 py-4 bg-white border border-slate-200 rounded-2xl text-sm focus:outline-none focus:ring-4 focus:ring-blue-50 focus:border-blue-400 transition-all placeholder:text-slate-300 font-medium"
                      value={formData.email}
                      onChange={(e) => setFormData({...formData, email: e.target.value})}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-700 ml-1">Phone Number *</label>
                  <div className="relative">
                    <PhoneIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input 
                      type="tel" 
                      placeholder="+233 XX XXX XXXX"
                      className="w-full pl-12 pr-6 py-4 bg-white border border-slate-200 rounded-2xl text-sm focus:outline-none focus:ring-4 focus:ring-blue-50 focus:border-blue-400 transition-all placeholder:text-slate-300 font-medium"
                      value={formData.phone}
                      onChange={(e) => setFormData({...formData, phone: e.target.value})}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-700 ml-1">Fellowship (Optional)</label>
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input 
                      type="text" 
                      placeholder="e.g. Young Professionals"
                      className="w-full pl-12 pr-6 py-4 bg-white border border-slate-200 rounded-2xl text-sm focus:outline-none focus:ring-4 focus:ring-blue-50 focus:border-blue-400 transition-all placeholder:text-slate-300 font-medium"
                      value={formData.fellowship}
                      onChange={(e) => setFormData({...formData, fellowship: e.target.value})}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 ml-1">Reason for Meeting *</label>
                <textarea 
                  placeholder="Tell us briefly why you want to meet with the Pastor..."
                  rows={4}
                  className="w-full px-6 py-4 bg-white border border-slate-200 rounded-2xl text-sm focus:outline-none focus:ring-4 focus:ring-blue-50 focus:border-blue-400 transition-all placeholder:text-slate-300 font-medium resize-none"
                  value={formData.reason}
                  onChange={(e) => setFormData({...formData, reason: e.target.value})}
                />
              </div>
            </div>
          )}

          {/* Action Footer */}
          <div className="mt-12 flex flex-col md:flex-row items-center justify-between gap-4 pt-8 border-t border-slate-100">
            <div className="flex items-center gap-2 text-blue-600">
              <Info className="w-4 h-4" />
              <p className="text-[10px] font-bold uppercase tracking-tight">Times are in GMT (Accra)</p>
            </div>

            <div className="flex items-center gap-3 w-full md:w-auto">
              {step === 2 && (
                <button 
                  onClick={() => setStep(1)}
                  className="px-8 py-4 bg-slate-100 text-slate-600 font-bold rounded-2xl hover:bg-slate-200 transition-all active:scale-95"
                >
                  Back
                </button>
              )}
              
              <button 
                disabled={isSubmitting || (step === 1 && (!selectedDate || !selectedTime)) || (step === 2 && (!formData.email || !formData.name || !formData.phone || !formData.reason))}
                onClick={() => {
                  if (step === 1) setStep(2);
                  else handleBooking();
                }}
                className="flex-1 md:flex-none px-10 py-4 bg-blue-600 text-white font-bold rounded-2xl hover:bg-blue-700 transition-all shadow-xl shadow-blue-100 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                  <>
                    {step === 1 ? 'Next Step' : 'Confirm Booking'}
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </div>
          {statusMessage && <p className="text-red-500 text-xs font-bold mt-4 text-center">{statusMessage}</p>}
        </div>
      </div>
    </div>
  );
}
