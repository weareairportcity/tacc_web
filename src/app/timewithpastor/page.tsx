"use client";

import { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, Loader2, Check } from "lucide-react";
import { format, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay } from "date-fns";
import { getAccraTime, isBookableDay, AVAILABLE_SLOTS } from "@/lib/date-utils";

export default function BookingPage() {
  const [currentDate, setCurrentDate] = useState(getAccraTime());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [availableDates, setAvailableDates] = useState<Date[]>([]);

  // Form State
  const [formData, setFormData] = useState({
    name: "",
    fellowship: "",
    phone: "",
    email: "",
    reason: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [isSuccess, setIsSuccess] = useState(false);

  useEffect(() => {
    // Calculate the next 4 available dates
    const dates: Date[] = [];
    let checkDate = getAccraTime();
    while (dates.length < 4) {
      if (isBookableDay(checkDate)) {
        dates.push(new Date(checkDate));
      }
      checkDate = new Date(checkDate.getTime() + 24 * 60 * 60 * 1000); // add 1 day
    }
    setAvailableDates(dates);
  }, []);

  const handleDateSelect = async (day: Date) => {
    setSelectedDate(day);
    setSelectedTime(null);
    setBookedSlots([]);
    setIsLoadingAvailability(true);

    try {
      const dateStr = day.toISOString().split('T')[0];
      const res = await fetch(`/api/bookings/availability?date=${dateStr}`);
      if (res.ok) {
        const data = await res.json();
        setBookedSlots(data.bookedSlots || []);
      }
    } catch (error) {
      console.error("Failed to fetch availability:", error);
    } finally {
      setIsLoadingAvailability(false);
    }
  };

  const handleTimeSelect = (time: string) => {
    setSelectedTime(time);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDate || !selectedTime) {
      setStatusMessage("Please select a date and time.");
      return;
    }
    
    setIsSubmitting(true);
    setStatusMessage("");

    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: selectedDate.toISOString(),
          time: selectedTime,
          ...formData
        })
      });

      const data = await res.json();
      if (res.ok) {
        setIsSuccess(true);
      } else {
        setStatusMessage(data.error || "Something went wrong.");
        setIsSubmitting(false);
      }
    } catch (error) {
      setStatusMessage("Failed to submit booking.");
      setIsSubmitting(false);
    }
  };

  if (isSuccess && selectedDate && selectedTime) {
    // Convert 24h to 12h for display
    const [h, m] = selectedTime.split(':');
    const ampm = parseInt(h) >= 12 ? 'PM' : 'AM';
    const displayH = parseInt(h) > 12 ? parseInt(h) - 12 : parseInt(h);
    const displaySlot = `${displayH}:${m} ${ampm}`;

    return (
      <div className="min-h-screen bg-[#f1f5f9] flex items-center justify-center p-4 py-12 font-sans">
        <div className="bg-white rounded-[2rem] shadow-sm border border-slate-100 p-8 md:p-12 w-full max-w-md text-center">
          <div className="w-24 h-24 mx-auto bg-[#eef2ff] rounded-full flex items-center justify-center mb-8">
            <div className="w-16 h-16 bg-[#6366f1] rounded-full flex items-center justify-center">
              <Check className="w-8 h-8 text-white" strokeWidth={3} />
            </div>
          </div>
          
          <h1 className="text-2xl md:text-[1.75rem] font-medium tracking-tight text-slate-900 mb-4 leading-tight">
            Success! Your meeting is<br/>scheduled.
          </h1>
          
          <p className="text-[15px] text-slate-500 mb-10 max-w-[280px] mx-auto leading-relaxed">
            Please check your email and SMS for confirmation and further instructions about the meeting.
          </p>

          <div className="bg-[#f8fafc] rounded-2xl p-6 text-left space-y-4 mb-10">
            <div className="flex justify-between items-center text-[15px]">
              <span className="text-slate-500">Meeting ID</span>
              <span className="font-medium text-slate-900">TACC-{Math.floor(Math.random() * 100000)}</span>
            </div>
            <div className="flex justify-between items-center text-[15px]">
              <span className="text-slate-500">Name</span>
              <span className="font-medium text-slate-900">{formData.name}</span>
            </div>
            <div className="flex justify-between items-center text-[15px]">
              <span className="text-slate-500">Date</span>
              <span className="font-medium text-slate-900">{format(selectedDate, "d MMMM yyyy")}</span>
            </div>
            <div className="flex justify-between items-center text-[15px]">
              <span className="text-slate-500">Time</span>
              <span className="font-medium text-slate-900">{displaySlot}</span>
            </div>
          </div>

          <button 
            onClick={() => window.location.href = '/'}
            className="w-full py-4 rounded-full bg-[#030712] text-white font-medium text-[15px] transition-colors hover:bg-slate-800"
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center p-4 py-12">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 w-full max-w-lg">
        <h1 className="text-xl font-semibold text-slate-900 mb-6">Booking Page<span className="text-red-500">*</span></h1>

        {/* Date Grid */}
        <div className="flex gap-3 mb-6 overflow-x-auto pb-2 scrollbar-hide justify-between">
          {availableDates.map((day, i) => {
            const isSelected = selectedDate && isSameDay(day, selectedDate);

            return (
              <button
                key={i}
                onClick={() => handleDateSelect(day)}
                className={`
                  flex-1 flex flex-col items-center justify-center py-3 rounded-xl border transition-colors
                  ${isSelected ? 'bg-[#0f172a] text-white border-[#0f172a]' : 'border-slate-200 hover:border-slate-400 text-slate-900'}
                `}
              >
                <span className="text-xs mb-1 font-medium">{format(day, "EEE")}</span>
                <span className="text-xl font-semibold">{format(day, "dd")}</span>
              </button>
            );
          })}
        </div>

        {/* Timezone Info */}
        <div className="mb-4">
          <p className="text-sm text-slate-600">Lisbon (GMT +1) <ChevronRight className="w-3 h-3 rotate-90 inline" /></p>
        </div>

        {/* Time Slots */}
        {selectedDate && (
          <div className="relative">
            {isLoadingAvailability && (
              <div className="absolute inset-0 bg-white/50 z-10 flex items-center justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
              </div>
            )}
            <div className="grid grid-cols-3 gap-3 mb-4">
              {AVAILABLE_SLOTS.map((slot) => {
                // Convert 24h to 12h for display
                const [h, m] = slot.split(':');
                const ampm = parseInt(h) >= 12 ? 'PM' : 'AM';
                const displayH = parseInt(h) > 12 ? parseInt(h) - 12 : parseInt(h);
                const displaySlot = `${displayH}:${m} ${ampm}`;
                const isSelected = selectedTime === slot;
                const isBooked = bookedSlots.includes(slot);

                return (
                  <button
                    key={slot}
                    disabled={isBooked}
                    onClick={() => handleTimeSelect(slot)}
                    className={`
                      py-2.5 rounded-md text-sm font-medium transition-colors border
                      ${isSelected 
                        ? 'bg-[#0f172a] text-white border-[#0f172a]' 
                        : isBooked
                        ? 'bg-slate-100 text-slate-400 border-slate-100 cursor-not-allowed line-through'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:border-slate-400'}
                    `}
                  >
                    {displaySlot}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <p className="text-sm text-slate-600 mb-8">Timezone: Accra Time)</p>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Name<span className="text-red-500">*</span></label>
            <input
              required
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="Name"
              className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent text-sm text-slate-900 placeholder:text-slate-400"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Fellowship<span className="text-red-500">*</span></label>
              <input
                required
                name="fellowship"
                value={formData.fellowship}
                onChange={handleChange}
                placeholder="Fellowship"
                className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent text-sm text-slate-900 placeholder:text-slate-400"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Phone Number<span className="text-red-500">*</span></label>
              <input
                required
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                placeholder="+1234567890"
                className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent text-sm text-slate-900 placeholder:text-slate-400"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
            <input
              required
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="Email"
              className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent text-sm text-slate-900 placeholder:text-slate-400"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Meeting Reason<span className="text-red-500">*</span></label>
            <textarea
              required
              name="reason"
              value={formData.reason}
              onChange={handleChange}
              placeholder="Meeting Reason for here..."
              rows={3}
              className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent text-sm text-slate-900 placeholder:text-slate-400 resize-none"
            />
          </div>

          {statusMessage && (
            <p className={`text-sm ${statusMessage.includes("successful") ? "text-green-600" : "text-red-600"}`}>
              {statusMessage}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting || !selectedDate || !selectedTime}
            className="w-full py-3 rounded-lg bg-[#0f172a] text-white font-medium text-sm transition-colors hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : "Schedule"}
          </button>
        </form>
      </div>
    </div>
  );
}
