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
  let { data, error } = await query.order("publish_date", { ascending: false });

  if (error) {
    console.error("Error fetching songs:", error);
    return [];
  }

  // Auto-ensure default songs exist in database
  if (data) {
    for (const defaultSong of DEFAULT_SONGS) {
      if (!data.some(s => s.title?.toLowerCase() === defaultSong.title.toLowerCase())) {
        try {
          const { data: newSongData } = await supabaseAdmin
            .from("sotw_songs")
            .insert([defaultSong])
            .select();
          if (newSongData) {
            data = [...newSongData, ...data];
          }
        } catch (e) {
          console.error(`Failed to auto-insert default song ${defaultSong.title}:`, e);
        }
      }
    }
  }

  return data || [];
}

const DEFAULT_SONGS = [
  {
    week_label: "WEEK THREE",
    publish_date: "2026-08-09",
    title: "I Am Complete In You",
    artist: "Loveworld Singers",
    lyrics: `Verse 1

Precious Lord, Your amazing love
You displayed at Calvary
Made a show of Your foes
Triumphed over them for me


Chorus

I am complete in You
The head over all rule and power
In heaven and earth
Great God of strength
Eternal King, Light of my life
I am complete in You


Verse 2

In Your name, I triumph
I'm victorious over all
By Your Spirit, You lead and guide me
Lord, Your word is my delight


Bridge

Dear Lord Jesus, You're my delight
My hope and joy
(My hope and joy)
Full of compassion
Boundless in mercy
You are my life


Refrain

You called me and chose me
By Your grace
Your thoughts of me
Are so great
You’re my All`,
    audio_url: "https://loveworldworship.com/worship/upload/audio/2025/05/gqWNeWDGmz8EYaRw6n1P_21_97bd2db2be614ebe8beb0f564c844184_audio_16105_converted.mp3",
    cover_image_url: "https://loveworldworship.com/worship/upload/photos/2025/05/ikm2mcyjpG2k1bhRRAmN_21_ea22a870d6d717660d662eafbdd180e4_image.jpeg",
    is_published: true,
  },
  {
    week_label: "WEEK TWO",
    publish_date: "2026-08-02",
    title: "Your Dominion Is For Eternity",
    artist: "Loveworld Singers",
    lyrics: `Verse 1

Almighty God, you are so great
Your majesty is for eternity

All the earth resounds your matchless name
Faithful God
Holy God

We affirm and extol your mightiness
Great God, maker of the universe
Your excellence is seen in all the earth
Faithful God
Holy God


Chorus

The great I Am
Faithful and true You are
Righteous and lofty One
The everlasting King of glory
Above all royalties
Is your holy name
Your dominion is for eternity


The great I Am
Faithful and true You are
Righteous and lofty One
The everlasting King of glory
Above all royalties
Is your holy name
Your dominion is for eternity
Almighty God


Verse 2

Yours is the kingdom,
The power and the glory
All authority is in your name
Your power is supreme
In all the earth
Faithful God
Holy God


Chorus

The great I Am
Faithful and true You are
Righteous and lofty One
The everlasting King of glory
Above all royalties
Is your holy name
Your dominion is for eternity

The great I Am
Faithful and true You are
Righteous and lofty One
The everlasting King of glory
Above all royalties
Is your holy name
Your dominion is for eternity
Almighty God


Refrain

The soon coming King

The Lord of Hosts
Nations of men shall declare Your Lordship
No more palaces and kings
Nor Kingdoms of men
For Your decree shall rule the nations

The soon coming King
The Lord of Hosts
Nations of men shall declare Your Lordship
No more palaces and kings
Nor kingdoms of men
For Your decree shall rule the nations
Almighty God`,
    audio_url: "https://loveworldworship.com/worship/upload/audio/2025/05/ZgnAPaiFdwpACTq9Nla2_11_520e043bf3f84965024552b8d3d4303c_audio_69214_converted.mp3",
    cover_image_url: "https://loveworldworship.com/worship/upload/photos/2025/05/bpAMWIYdaCac4OiUo6UA_11_8afb422ff4aff35ce84a47bd76310acf_image.jpeg",
    is_published: true,
  },
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

async function seedSongs() {
  await supabaseAdmin.from("sotw_songs").insert(DEFAULT_SONGS);
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
