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
  const demoSongs = [
    {
      week_label: "WEEK ONE",
      publish_date: "2026-07-26",
      title: "The Saviour of the World",
      artist: "Oge & Loveworld Singers",
      lyrics: `My life honors You
I live to worship You
You are the song I sing
You’re the source of my joy

[Pre-Chorus]
You are magnified
You are glorified
You are the King of the world

You are magnified
You are glorified
You’re the King of Heaven and earth

[Chorus]
Master, The ruler of the world
Dear Lord Jesus
Dear Lord Jesus

You are the One who conquered death
Dear Lord Jesus
Dear Lord Jesus

Dear Lord Jesus
Dear Lord Jesus
The Saviour of the world

[Bridge]
You are God in us
You are God with us
You are King of glory
Lord of all

You’re Lord Jesus, Lord Jesus
Dear Lord Jesus
The Saviour of the world

You are God in us
You are God with us
You are King of glory
Lord of all`,
      audio_url: "https://loveworldlyrics.com/wp-content/uploads/2026/06/SAVIOUR-OF-THE-WORLD-BY-OGE.mp3",
      cover_image_url: "https://loveworldlyrics.com/wp-content/uploads/2026/06/SAVIOUR-OF-THE-WORLD-BY-OGE-AND-LOVEWORLD-SINGERS.jpg",
      is_published: true,
    },
    {
      week_label: "WEEK TWO",
      publish_date: "2026-07-19",
      title: "Awesome God",
      artist: "Sinach",
      lyrics: `[Verse 1]
Holy are You Lord
All creation call You God
Worthy is Your name
We worship Your Name

[Chorus]
You are awesome in this place Mighty God
You are awesome in this place Abba Father
You are worthy of our praise
To You our lives we raise
You are awesome in this place Mighty God`,
      audio_url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3",
      cover_image_url: "",
      is_published: true,
    },
    {
      week_label: "WEEK THREE",
      publish_date: "2026-07-12",
      title: "Praise the Lord",
      artist: "Frank Edwards",
      lyrics: `[Verse]
Praise the Lord, praise the Lord
Let everything that breathes praise the Lord
For His goodness and His mercy
Let us shout for joy

[Chorus]
Hallelujah, hallelujah
Sing a new song to the Lord
Hallelujah, hallelujah
Celebrate His holy name`,
      audio_url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3",
      cover_image_url: "",
      is_published: true,
    }
  ];

  await supabaseAdmin.from("sotw_songs").insert(demoSongs);
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
