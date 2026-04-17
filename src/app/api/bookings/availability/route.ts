import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get('date');

  if (!date) {
    return NextResponse.json({ error: "Date is required" }, { status: 400 });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('bookings')
      .select('meeting_time')
      .eq('meeting_date', date)
      .neq('status', 'Cancelled');

    if (error) throw error;

    const bookedSlots = data.map(b => b.meeting_time);
    return NextResponse.json({ bookedSlots }, { status: 200 });
  } catch (error) {
    console.error("Availability Check Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
