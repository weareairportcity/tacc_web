import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  // TODO: Verify Vercel Cron Secret
  // const authHeader = req.headers.get('authorization');
  // if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
  //   return new Response('Unauthorized', { status: 401 });
  // }

  // TODO: Query Supabase for meetings 'Tomorrow'
  // TODO: Dispatch Resend emails

  console.log("Cron job ran: sending reminders");

  return NextResponse.json({ success: true, message: "Reminders dispatched (Mock)" });
}
