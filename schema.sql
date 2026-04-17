-- Run this in your Supabase SQL Editor to create the bookings table

CREATE TABLE public.bookings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now(),
  meeting_date DATE NOT NULL,
  meeting_time TIME NOT NULL,
  name TEXT NOT NULL,
  fellowship TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  reason TEXT NOT NULL,
  status TEXT DEFAULT 'Scheduled',
  google_event_id TEXT
);

-- Set up Row Level Security (RLS)
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can insert a booking (public form)
CREATE POLICY "Anyone can insert bookings" 
ON public.bookings FOR INSERT 
TO public 
WITH CHECK (true);

-- Policy: Only authenticated users (Admin) can view/update bookings
CREATE POLICY "Admin can view bookings" 
ON public.bookings FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Admin can update bookings" 
ON public.bookings FOR UPDATE 
TO authenticated 
USING (true);
