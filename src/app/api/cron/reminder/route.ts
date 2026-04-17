import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { sendReminderEmail } from '@/lib/email';
import { sendSMS } from '@/lib/mnotify';
import { getAccraTime } from '@/lib/date-utils';
import { addDays, format } from 'date-fns';

export async function GET(req: Request) {
  // Verify Vercel Cron Secret in production
  if (process.env.NODE_ENV === 'production') {
    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return new Response('Unauthorized', { status: 401 });
    }
  }

  try {
    const tomorrow = addDays(getAccraTime(), 1);
    const tomorrowStr = format(tomorrow, 'yyyy-MM-dd');

    const { data: bookings, error } = await supabaseAdmin
      .from('bookings')
      .select('*')
      .eq('meeting_date', tomorrowStr)
      .eq('status', 'Scheduled');

    if (error) {
      throw error;
    }

    let remindersSent = 0;

    for (const booking of bookings) {
      if (booking.email) {
        await sendReminderEmail(booking.email, booking.name, booking.meeting_time);
      }
      if (booking.phone) {
        const smsMessage = `Reminder: Hi ${booking.name}, you have a meeting with the Pastor tomorrow at ${booking.meeting_time}. - The Airport City Church`;
        await sendSMS(booking.phone, smsMessage);
      }
      remindersSent++;
    }

    console.log(`Cron job ran: sent ${remindersSent} reminders for ${tomorrowStr}`);
    return NextResponse.json({ success: true, sent: remindersSent });
  } catch (error: any) {
    console.error("Cron Error:", error.message);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
