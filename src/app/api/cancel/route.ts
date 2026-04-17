import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { deleteCalendarEvent } from '@/lib/google-calendar';
// import { sendSMS } from '@/lib/mnotify'; // Optional: send cancellation SMS

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const token = searchParams.get('token');

    if (!id || !token) {
      return NextResponse.json({ error: "Missing required parameters." }, { status: 400 });
    }

    // In a real app, validate the token here.
    if (token !== "mock_secure_token") {
      return NextResponse.json({ error: "Invalid token." }, { status: 403 });
    }

    // 1. Get the booking from Supabase to find the Google Event ID
    const { data: booking, error: fetchError } = await supabaseAdmin
      .from('bookings')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !booking) {
      return NextResponse.json({ error: "Booking not found." }, { status: 404 });
    }

    // 2. Update status in Supabase
    const { error: updateError } = await supabaseAdmin
      .from('bookings')
      .update({ status: 'Cancelled' })
      .eq('id', id);

    if (updateError) {
      return NextResponse.json({ error: "Failed to update database." }, { status: 500 });
    }

    // 3. Delete from Google Calendar
    if (booking.google_event_id) {
      await deleteCalendarEvent(booking.google_event_id);
    }

    // 4. (Optional) Send cancellation email/SMS to user

    return NextResponse.json({ success: true, message: `Booking ${id} has been cancelled.` }, { status: 200 });

  } catch (error) {
    console.error("Cancellation Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
