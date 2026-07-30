import { supabaseAdmin } from "./supabase";

export type Song = {
  id: string;
  created_at?: string;
  week_label: string;
  publish_date: string;
  title: string;
  artist: string;
  lyrics: string;
  audio_url?: string;
  cover_image_url?: string;
  is_published: boolean;
};

// Fetch all songs. Admin can see drafts, public only gets published songs.
export async function getSongs(onlyPublished = false): Promise<Song[]> {
  // Check if database is empty, seed if it is
  const { count, error: countError } = await supabaseAdmin
    .from("sotw_songs")
    .select("*", { count: "exact", head: true });

  // If the table doesn't exist yet, return empty gracefully
  if (countError) {
    // PGRST205 = table not found in schema cache
    if (countError.code === "PGRST205" || countError.message?.includes("Could not find")) {
      console.warn("sotw_songs table not found — please create it via the Supabase SQL editor.");
      return [];
    }
    console.error("Error checking songs count:", countError);
    return [];
  }

  if (count === 0) {
    try {
      await seedSongs();
    } catch (e) {
      console.error("Failed to seed songs:", e);
    }
  }

  let query = supabaseAdmin
    .from("sotw_songs")
    .select("*");

  if (onlyPublished) {
    query = query.eq("is_published", true);
  }

  // Order by publish date descending (latest week first)
  const { data, error } = await query.order("publish_date", { ascending: false });

  if (error) {
    console.error("Error fetching songs:", error);
    return [];
  }

  return data || [];
}

async function seedSongs() {
  const defaultSong = [
    {
      week_label: "WEEK ONE",
      publish_date: "2026-07-26",
      title: "The Center of Your Love",
      artist: "Loveworld Singers",
      lyrics: `Verse 1
You are the height
The depth, the width
And the breadth of life
Lord over winds, the seas, and the storms
Encapsulation of the Father’s love

The revelation of divinity
Eternal Word supreme
You’re the greatest
The biggest, oh, Lord

Chorus 
I stand amazed
At the wonders of Your works, my God
There’s no beginning
And no end to Your pleasant ways

Unfathomable is the love
You bestowed on me
You made me the centre of Your love

Verse 2
The heavens rule
For heaven is Your throne
And the earth Your footstool

Your word’s the beginning
And the end of all things
Dependable and infallible

Your word, our divine ability
It has the power to create
and sustain all things

Chorus
I stand amazed
At the wonders of Your works, my God
There’s no beginning
And no end to Your pleasant ways

Unfathomable is the love
You bestowed on me
You made me the centre of Your love

Bridge 
You are the greatest, Lord
You are the strongest, Lord
All of creation tremble before You
Heaven and earth bow before You

All sovereign God
You are the greatest
There’s none like You

Coda 
You are the greatest
The biggest, the strongest, the wisest
The highest, the fairest, oh Lord`,
      audio_url: "https://loveworldworship.com/worship/upload/audio/2026/02/otPdGjse1C7YvxPrq5FP_21_962866e322d9272bb9434bd7d0195cf1_audio_36532_converted.mp3",
      cover_image_url: "https://loveworldworship.com/worship/upload/photos/2026/02/ya7lrmcYnjrvsYPBrRnT_21_8e98bf661deab569e26c964f24938f08_image.jpeg",
      is_published: true,
    }
  ];

  await supabaseAdmin.from("sotw_songs").insert(defaultSong);
}

// Fetch a single song by ID
export async function getSongById(id: string): Promise<Song | null> {
  const { data, error } = await supabaseAdmin
    .from("sotw_songs")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error(`Error fetching song ${id}:`, error);
    return null;
  }

  return data;
}

// Save or update a song
export async function saveSong(song: Partial<Song> & { week_label: string; title: string; artist: string; publish_date: string; lyrics: string }) {
  const { data, error } = await supabaseAdmin
    .from("sotw_songs")
    .upsert(song)
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

// Delete a song
export async function deleteSong(id: string) {
  const { error } = await supabaseAdmin
    .from("sotw_songs")
    .delete()
    .eq("id", id);

  if (error) {
    throw new Error(error.message);
  }
}
