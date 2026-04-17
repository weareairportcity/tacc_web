"use client";

import { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, Loader2, Check } from "lucide-react";
import { 
  format, 
  addMonths, 
  subMonths, 
  startOfMonth, 
  endOfMonth, 
  eachDayOfInterval, 
  isSameMonth, 
  isSameDay, 
  isBefore, 
  startOfDay,
  getDay
} from "date-fns";
import { getAccraTime, isBookableDay, AVAILABLE_SLOTS } from "@/lib/date-utils";
import { createClient } from "@/utils/supabase/client";
import Image from "next/image";
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

  const handleBooking = async () => {
    if (!selectedDate || !selectedTime || !formData.name || !formData.email || !formData.phone || !formData.reason) {
      setStatusMessage("Please fill in all required fields.");
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
  const startDay = getDay(monthStart);
  const leadingDays = Array.from({ length: startDay }, (_, i) => null);

  const prevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));
  const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));

  if (isSuccess) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 font-sans">
        <div className="w-full max-w-md bg-white rounded-xl border border-slate-200 shadow-sm p-8 text-center animate-in fade-in zoom-in duration-300">
          <div className="w-16 h-16 bg-slate-900 rounded-full flex items-center justify-center mx-auto mb-6">
            <Check className="w-8 h-8 text-white" strokeWidth={3} />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Booking Confirmed</h2>
          <p className="text-slate-500 mb-8 text-sm">Your appointment has been successfully scheduled.</p>
          
          <div className="bg-slate-50 rounded-lg p-4 mb-8 text-left space-y-3 border border-slate-100">
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-500">Booking ID</span>
              <span className="text-slate-900 font-medium">TACC-{bookingDetails.id?.split('-')[0].toUpperCase()}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-500">Date</span>
              <span className="text-slate-900 font-medium">{bookingDetails.date}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-500">Time</span>
              <span className="text-slate-900 font-medium">{bookingDetails.time}</span>
            </div>
          </div>

          <button 
            onClick={() => window.location.href = '/'}
            className="w-full py-3 bg-slate-900 text-white font-medium rounded-md hover:bg-slate-800 transition-colors"
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-transparent lg:bg-slate-50 font-sans text-slate-900 relative overflow-hidden">
      {/* Mobile Background Image */}
      <div className="lg:hidden absolute inset-0 z-0">
        <Image
          src="/homepage-hero.jpeg"
          alt="Background"
          fill
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-white/40 backdrop-blur-[2px]" />
      </div>

      {/* Right side: Image (Desktop) - Note: order-last makes it appear on the right */}
      <div className="hidden lg:flex lg:w-1/2 relative bg-slate-100 shrink-0 border-l border-slate-200 order-last">
        <Image
          src="/homepage-hero.jpeg"
          alt="Airport City Church"
          fill
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-slate-900/10 mix-blend-multiply" />
      </div>

      {/* Left side: Booking Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-3 sm:p-6 lg:p-12 relative z-10 lg:order-first">
        <div className="w-full max-w-[500px] bg-white/90 lg:bg-white backdrop-blur-xl lg:backdrop-blur-none rounded-xl shadow-2xl lg:shadow-sm p-5 sm:p-7 border border-white/50 lg:border-slate-200 max-h-[95vh] overflow-y-auto scrollbar-hide">
          <div className="flex items-center gap-3 mb-4">
            <Link href="/" className="p-1.5 -ml-1.5 rounded-md hover:bg-slate-100 transition-colors">
              <ChevronLeft className="w-5 h-5 text-slate-600" />
            </Link>
            <h1 className="text-xl font-bold text-slate-900">
              Booking Page<span className="text-red-500">*</span>
            </h1>
          </div>

          {/* Month Navigator */}
          <div className="flex items-center justify-between mb-2">
            <div className="text-base font-bold text-slate-900">
              {format(currentMonth, "MMMM yyyy")}
            </div>
            <div className="flex items-center gap-1">
              <button onClick={prevMonth} className="p-1.5 rounded-md hover:bg-slate-100 text-slate-600 transition-colors">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button onClick={nextMonth} className="p-1.5 rounded-md hover:bg-slate-100 text-slate-600 transition-colors">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Calendar Grid */}
          <div className="mb-4">
            <div className="grid grid-cols-7 gap-1 mb-1">
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(d => (
                <div key={d} className="text-center text-[10px] font-bold text-slate-400 py-1">{d}</div>
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
                      py-1.5 flex items-center justify-center rounded-md transition-colors border text-base font-bold
                      ${isBlocked ? 'opacity-40 cursor-not-allowed border-transparent text-slate-400' : 'hover:border-slate-300 border-slate-200/60 lg:border-slate-100 cursor-pointer text-slate-700 hover:bg-white'}
                      ${isSelected ? 'bg-slate-900 !text-white border-slate-900 shadow-md hover:bg-slate-800 hover:border-slate-800' : 'bg-white/60 lg:bg-white'}
                    `}
                  >
                    {format(day, "d")}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Timezone & Time Slots */}
          <div className="mb-6">
            <div className="text-sm text-slate-600 mb-3 flex items-center gap-1">
              Accra (GMT) <ChevronDownIcon className="w-3 h-3 text-slate-400" />
            </div>
            
            {selectedDate ? (
              <div className="grid grid-cols-3 gap-2 relative">
                {isLoadingAvailability && (
                  <div className="absolute inset-0 bg-white/60 backdrop-blur-[1px] flex items-center justify-center z-10 rounded-md">
                    <Loader2 className="w-5 h-5 animate-spin text-slate-900" />
                  </div>
                )}
                {AVAILABLE_SLOTS.map((slot) => {
                  const isBooked = bookedSlots.includes(slot);
                  const isSelected = selectedTime === slot;
                  
                  const [h, m] = slot.split(':');
                  const hour = parseInt(h);
                  const displayTime = `${hour > 12 ? hour - 12 : hour}:${m} ${hour >= 12 ? 'PM' : 'AM'}`;

                  return (
                    <button
                      key={slot}
                      disabled={isBooked}
                      onClick={() => setSelectedTime(slot)}
                      className={`
                        py-2.5 rounded-md text-sm transition-all border font-medium
                        ${isBooked ? 'bg-slate-50 text-slate-300 border-slate-100 cursor-not-allowed line-through' : 
                          isSelected ? 'bg-slate-900 text-white border-slate-900' : 'bg-slate-900 text-white border-slate-900 hover:bg-slate-800'}
                      `}
                    >
                      {displayTime}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="text-xs text-slate-400 italic py-2">Select a date to view available times</div>
            )}
            <div className="text-xs text-slate-500 mt-3">Timezone: Accra Time</div>
          </div>

          <div className="h-px bg-slate-100 w-full mb-6"></div>

          {/* Form Fields */}
          <div className="space-y-3 mb-6">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Name<span className="text-red-500">*</span>
              </label>
              <input 
                type="text" 
                placeholder="Name"
                className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-slate-900 focus:border-slate-900 placeholder:text-slate-400"
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Fellowship<span className="text-red-500">*</span>
                </label>
                <input 
                  type="text" 
                  placeholder="Fellowship"
                  className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-slate-900 focus:border-slate-900 placeholder:text-slate-400"
                  value={formData.fellowship}
                  onChange={(e) => setFormData({...formData, fellowship: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Phone Number<span className="text-red-500">*</span>
                </label>
                <input 
                  type="tel" 
                  placeholder="Phone Number"
                  className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-slate-900 focus:border-slate-900 placeholder:text-slate-400"
                  value={formData.phone}
                  onChange={(e) => setFormData({...formData, phone: e.target.value})}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Email<span className="text-red-500">*</span>
              </label>
              <input 
                type="email" 
                placeholder="Email Address"
                className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-slate-900 focus:border-slate-900 placeholder:text-slate-400"
                value={formData.email}
                onChange={(e) => setFormData({...formData, email: e.target.value})}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Meeting Reason<span className="text-red-500">*</span>
              </label>
              <textarea 
                placeholder="Meeting Reason for here..."
                rows={2}
                className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-slate-900 focus:border-slate-900 placeholder:text-slate-400 resize-none"
                value={formData.reason}
                onChange={(e) => setFormData({...formData, reason: e.target.value})}
              />
            </div>
          </div>

          {statusMessage && <p className="text-red-500 text-sm mb-4 text-center">{statusMessage}</p>}

          <button 
            disabled={isSubmitting || !selectedDate || !selectedTime || !formData.name || !formData.email || !formData.phone || !formData.reason}
            onClick={handleBooking}
            className="w-full py-2.5 bg-slate-900 text-white text-sm font-medium rounded-md hover:bg-slate-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Schedule'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ChevronDownIcon(props: any) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m6 9 6 6 6-6"/>
    </svg>
  );
}
