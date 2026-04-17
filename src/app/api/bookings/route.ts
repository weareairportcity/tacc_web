import { NextResponse } from 'next/server';
import { format } from 'date-fns';
import { sendBookingNotifications } from '@/lib/mnotify';
import { createCalendarEvent } from '@/lib/google-calendar';
import { supabaseAdmin } from '@/lib/supabase';
import { sendConfirmationEmail, sendAdminNotificationEmail } from '@/lib/email';
import * as ics from 'ics';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, fellowship, phone, email, reason, date, time } = body;

    console.log("Received booking request:", body);

    // 1. Insert into Supabase
    const { data: dbEvent, error: dbError } = await supabaseAdmin
      .from('bookings')
      .insert([
        {
          meeting_date: date.split('T')[0],
          meeting_time: time,
          name,
          fellowship,
          phone,
          email,
          reason,
          status: 'Scheduled'
        }
      ])
      .select()
      .single();

    if (dbError) {
      console.error("Supabase Error:", dbError);
      return NextResponse.json({ error: "Failed to save booking to database." }, { status: 500 });
    }

    const bookingId = dbEvent.id;

    // 2. Create Google Calendar event
    const eventId = await createCalendarEvent({
      name, fellowship, phone, email, reason, date, time
    });

    // Update Supabase with Google Event ID if successful
    if (eventId) {
      await supabaseAdmin.from('bookings').update({ google_event_id: eventId }).eq('id', bookingId);
    }

    // 3. Format date for communications
    const formattedDate = format(new Date(date), 'MMM dd, yyyy');

    // 4. Send SMS via mNotify
    await sendBookingNotifications(phone, name, formattedDate, time);

    // 5. Generate ICS & Send Emails via Resend
    const [year, month, day] = date.split('T')[0].split('-').map(Number);
    const [hour, minute] = time.split(':').map(Number);
    
    const { value: icsContent } = ics.createEvent({
      title: `Meeting with Pastor (${name})`,
      description: reason,
      start: [year, month, day, hour, minute],
      duration: { hours: 0, minutes: 30 },
      status: 'CONFIRMED',
      busyStatus: 'BUSY',
      organizer: { name: 'The Airport City Church', email: process.env.EMAIL_FROM || 'booking@theairportcitychurch.com' },
    });

    if (email && icsContent) {
      await sendConfirmationEmail(email, name, formattedDate, time, icsContent);
    }

    // Provide a basic absolute URL for cancellation (assuming localhost for dev, you should use an env var in production)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const cancelUrl = `${appUrl}/api/cancel?id=${bookingId}&token=mock_secure_token`;
    await sendAdminNotificationEmail(name, fellowship, phone, email, reason, formattedDate, time, cancelUrl);

    return NextResponse.json({ success: true, message: "Booking recorded", bookingId }, { status: 200 });

  } catch (error) {
    console.error("Booking Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
