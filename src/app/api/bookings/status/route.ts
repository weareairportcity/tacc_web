import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { sendThankYouEmail } from '@/lib/email';
import { sendThankYouSMS } from '@/lib/mnotify';

export async function POST(req: Request) {
  try {
    const { id, status } = await req.json();

    if (!id || !status) {
      return NextResponse.json({ error: "Booking ID and Status are required" }, { status: 400 });
    }

    // 1. Get booking details for notification
    const { data: booking, error: fetchError } = await supabaseAdmin
      .from('bookings')
      .select('name, email, phone')
      .eq('id', id)
      .single();

    if (fetchError || !booking) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }

    // 2. Update status in Supabase
    const { error: updateError } = await supabaseAdmin
      .from('bookings')
      .update({ status })
      .eq('id', id);

    if (updateError) throw updateError;

    // 3. If status is 'Completed', send thank you messages
    if (status === 'Completed') {
      if (booking.email) {
        await sendThankYouEmail(booking.email, booking.name);
      }
      if (booking.phone) {
        await sendThankYouSMS(booking.phone, booking.name);
      }
    }

    return NextResponse.json({ success: true, message: "Status updated and notifications sent." }, { status: 200 });

  } catch (error) {
    console.error("Status Update Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
