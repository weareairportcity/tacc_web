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
  attendees INTEGER DEFAULT 1,
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

-- Enable RLS for blocked_dates
ALTER TABLE public.blocked_dates ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can view blocked dates (needed for the booking calendar)
CREATE POLICY "Anyone can view blocked dates"
ON public.blocked_dates FOR SELECT
TO public
USING (true);

-- Policy: Only authenticated users (Admin) can insert/delete blocked dates
CREATE POLICY "Admin can manage blocked dates"
ON public.blocked_dates FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- Song of the Week Table
CREATE TABLE public.sotw_songs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now(),
  week_label TEXT NOT NULL,          -- e.g. "WEEK ONE"
  publish_date DATE NOT NULL,        -- e.g. "2026-07-26"
  title TEXT NOT NULL,
  artist TEXT NOT NULL,
  lyrics TEXT NOT NULL,              -- Full lyrics formatted with newlines or Markdown
  audio_url TEXT,                    -- URL to the audio file
  cover_image_url TEXT,              -- URL to the cover image
  is_published BOOLEAN DEFAULT true
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.sotw_songs ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can view published songs
CREATE POLICY "Anyone can view songs"
ON public.sotw_songs FOR SELECT
TO public
USING (true);

-- Policy: Only authenticated users (Admins) can modify songs
CREATE POLICY "Admin can manage songs"
ON public.sotw_songs FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- Song of the Week Analytics Table
CREATE TABLE IF NOT EXISTS public.sotw_analytics_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now(),
  song_id UUID REFERENCES public.sotw_songs(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL, -- 'view' or 'play'
  visitor_id TEXT NOT NULL   -- anonymous browser visitor UUID
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.sotw_analytics_events ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can insert analytics events (public tracking)
CREATE POLICY "Anyone can log analytics"
ON public.sotw_analytics_events FOR INSERT
TO public
WITH CHECK (true);

-- Policy: Anyone can view analytics
CREATE POLICY "Anyone can view analytics"
ON public.sotw_analytics_events FOR SELECT
TO public
USING (true);


