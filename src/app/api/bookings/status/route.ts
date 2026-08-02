import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { sendThankYouEmail, sendCancellationEmail } from '@/lib/email';
import { sendThankYouSMS, sendCancellationSMS } from '@/lib/mnotify';
import { format } from 'date-fns';

export async function POST(req: Request) {
  try {
    const { id, status, cancellationReason } = await req.json();

    if (!id || !status) {
      return NextResponse.json({ error: "Booking ID and Status are required" }, { status: 400 });
    }

    // 1. Get booking details for notification
    const { data: booking, error: fetchError } = await supabaseAdmin
      .from('bookings')
      .select('name, email, phone, meeting_date, meeting_time')
      .eq('id', id)
      .single();

    if (fetchError || !booking) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }

    // 2. Update status and cancellation_reason in Supabase
    const updateData: { status: string; cancellation_reason?: string | null } = { status };
    if (status === 'Cancelled') {
      updateData.cancellation_reason = cancellationReason || null;
    }

    const { error: updateError } = await supabaseAdmin
      .from('bookings')
      .update(updateData)
      .eq('id', id);

    if (updateError) throw updateError;

    // 3. Send notifications based on status
    if (status === 'Completed') {
      if (booking.email) {
        await sendThankYouEmail(booking.email, booking.name);
      }
      if (booking.phone) {
        await sendThankYouSMS(booking.phone, booking.name);
      }
    } else if (status === 'Cancelled') {
      const formattedDate = format(new Date(booking.meeting_date), 'MMMM do, yyyy');
      if (booking.email) {
        await sendCancellationEmail(booking.email, booking.name, formattedDate, booking.meeting_time, cancellationReason);
      }
      if (booking.phone) {
        await sendCancellationSMS(booking.phone, booking.name, formattedDate, booking.meeting_time, cancellationReason);
      }
    }

    return NextResponse.json({ success: true, message: "Status updated and notifications sent." }, { status: 200 });

  } catch (error) {
    console.error("Status Update Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
