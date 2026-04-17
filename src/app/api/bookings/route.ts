import { NextResponse } from 'next/server';
import { format } from 'date-fns';
import { sendBookingNotifications } from '@/lib/mnotify';
import { createCalendarEvent } from '@/lib/google-calendar';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, fellowship, phone, email, reason, date, time } = body;

    // TODO: 1. Validate date/time constraints server-side to prevent tampering
    // TODO: 2. Check Supabase for conflicts
    // TODO: 3. Insert into Supabase
    // TODO: 4. Send emails via Resend

    console.log("Received booking request:", body);

    // Create Google Calendar event
    const eventId = await createCalendarEvent({
      name, fellowship, phone, email, reason, date, time
    });

    // Send SMS via mNotify
    const formattedDate = format(new Date(date), 'MMM dd, yyyy');
    await sendBookingNotifications(phone, name, formattedDate, time);

    // Mock successful response (Replace with real DB ID later)
    return NextResponse.json({ success: true, message: "Booking recorded", eventId }, { status: 200 });

  } catch (error) {
    console.error("Booking Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
