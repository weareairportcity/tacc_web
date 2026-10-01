import { batch, query } from "./cf";

/**
 * Song of the Week data on Cloudflare D1 (database "tacc"), moved off
 * Supabase. Public pages read published songs on the server; the admin
 * writes through server actions in app/admin/songs/actions.ts.
 */

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
  source_url?: string | null;
  is_published: boolean;
};

type SongRow = Omit<Song, "is_published"> & { is_published: number };

const toSong = (row: SongRow): Song => ({ ...row, is_published: row.is_published === 1 });

// Public reads are cached for a minute; admin saves revalidate the "songs" tag.
export const SONGS_TAG = "songs";
const PUBLIC_CACHE = { revalidate: 60, tags: [SONGS_TAG] };

const COLUMNS =
  "id, created_at, week_label, publish_date, title, artist, lyrics, audio_url, cover_image_url, source_url, is_published";


const DEFAULT_SONGS = [
  {
    week_label: "WEEK FIVE",
    publish_date: "2026-08-23",
    title: "What You Say Is Final",
    artist: "Eli-J & Loveworld Singers",
    lyrics: `Verse 1

You're the truth the scholars scribed
As from a place that has no death nor night

You're the Word of truth, undefined
Outclassing time and state

Lord, our Rock,
Your Words are just
All who know You are wise and just

There's no name that does like Yours
Reversing time and state


Chorus

Great Lord, your name
Wields all power in the universe
You told the sun
When to rise and where to reside

Lord, we rejoice in You
You are God of the living, not the dead

Lord, Your Word is sovereign
What You say is final


Verse 2

Who can stand against the Lord's decree?
None will be, You didn't call to be
While You showed us the way of peace
You trained our mouths for war

When we walk the world, they say
behold the children of the great I AM

The battles we see are pieces
from the war we've already won


Chorus

Great Lord, your name
Wields all power in the universe
You told the sun
When to rise and where to reside

Lord, we rejoice in You
You are God of the living, not the dead

Lord, Your Word is sovereign
What You say is final


Outro

Lord, Your Word is sovereign
Lord, Your Word is sovereign
Lord, Your Word is sovereign
What You say is final`,
    audio_url: "https://media.theairportcitychurch.com/sotw-what-you-say-is-final-1790869600526.mp3",
    cover_image_url: "https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/ee/86/6c/ee866c7c-feeb-87a5-9b99-0879bb02ce8e/7300341490854.jpg/600x600bb.jpg",
    is_published: true,
  },
  {
    week_label: "WEEK FOUR",
    publish_date: "2026-08-16",
    title: "Sweet Holy Spirit",
    artist: "Simeon Rich, Maya & Loveworld Singers",
    lyrics: `Verse 1

Sweet Holy Spirit, You are here
Life-giver and strengthener, You are
The great comforter and our helper, You are
Sweet Holy Spirit, we adore You

Heaven's dew on us, You are
The Teacher within us, You are
Our great guide in the path of life, You are
Sweet Holy Spirit, we adore You


Chorus

Hallelujah to You, Lord
Hallelujah, great God
You're the Angel of His presence
So gentle yet all-powerful

Hallelujah to You, Lord
Hallelujah, great God
Sweet Holy Spirit, we adore You

Hallelujah to You, Lord
Hallelujah, great God
You're the Angel of His presence
So gentle, yet all-powerful

Hallelujah to You, Lord
Hallelujah, great God
Sweet Holy Spirit, we adore You


Verse 2

You are pure and holy
Your presence here is glorious
Your power is mighty
And great in our midst
Sweet Holy Spirit, we adore You

Your presence has filled our lives
With boundless grace, we are strengthened
With Your might from within
Mightily helped by You
Sweet Holy Spirit, we adore You


Chorus

Hallelujah to You, Lord
Hallelujah, great God
You're the Angel of His presence
So gentle, yet all-powerful

Hallelujah to You, Lord
Hallelujah, great God
Sweet Holy Spirit, we adore You


Bridge

Sweet Spirit of God
You're the holy and gracious One
You answer when we called the name of Jesus

Blessed with Your power
Blessed with Your glory
Blessed with all that You are
All that You are


Outro

Hallelujah to You, Lord
Hallelujah, great God
You're the Angel of His presence
So gentle, yet all-powerful

Hallelujah to You, Lord
Hallelujah, great God
Sweet Holy Spirit, we adore You

You're the Angel of His presence
So gentle, yet all-powerful
Sweet Holy Spirit, we adore You`,
    audio_url: "https://media.theairportcitychurch.com/sotw-sweet-holy-spirit-simeon-rich-and-maya-1790869700163.mp3",
    cover_image_url: "https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/ae/49/7a/ae497a24-2564-a067-5abb-528b1e8c6953/7300344067473.jpg/600x600bb.jpg",
    is_published: true,
  },
  {
    week_label: "WEEK THREE",
    publish_date: "2026-08-09",
    title: "The King",
    artist: "Loveworld Singers",
    lyrics: `Verse 1

With your blood, you paid for every soul
And gave us a name so man can be saved
Lord Jesus, you know all by name
And we'll make the world know your name

Heaven and earth shall pass away
But your word, our anchor for each day
Some have the sun and the stars as gods
Folly's the wisdom of men


Pre-Chorus

Lord Christ, you're the first begotten
And the Creator divine, you are


Chorus

King of heaven
Our Lord on high
The King of the city of lights
The Son of God, you are
Beyond duty
We raise our hands in praise
Too much for words for us
Is your love


Verse 2

The world gives powerless thrones
The power of the world is no power at all
Humble on earth, the King from above
To you, there's nothing unknown

You do not change nor age with time
You dwell not in past, present, nor future
That's why you gave us a life so divine
A life beyond time


Pre-Chorus

Lord Christ, you're the first begotten
And the Creator divine, you are


Chorus

King of heaven
Our Lord on high
The King of the city of lights
The Son of God, you are
Beyond duty
We raise our hands in praise
Too much for words for us
Is your love


Refrain

There's no depth
There's no height
There's no power
In this world
And the world to come
That can separate us from your love
Christ, the King


Coda

Beyond duty
We raise our hands in praise
Too much for words for us
Is your love`,
    audio_url: "https://media.theairportcitychurch.com/sotw-the-king-1790869753286.mp3",
    cover_image_url: "https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/df/89/d5/df89d530-d7e2-996b-03cb-9e0fc6eb623f/7300343705253.jpg/600x600bb.jpg",
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
    audio_url: "https://media.theairportcitychurch.com/sotw-your-dominion-is-for-eternity-1790869790199.mp3",
    cover_image_url: "https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/29/b6/db/29b6dbc9-164a-c02b-0077-1506eb415826/7300342869666.jpg/600x600bb.jpg",
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
    audio_url: "https://media.theairportcitychurch.com/sotw-the-centre-of-your-love-1790869821801.mp3",
    cover_image_url: "https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/19/17/d1/1917d12d-82ff-31a1-368c-c2817ef3b65c/7300346224256.jpg/600x600bb.jpg",
    is_published: true,
  },
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
    audio_url: "https://media.theairportcitychurch.com/sotw-i-am-complete-in-you-1790869848122.mp3",
    cover_image_url: "https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/ae/49/7a/ae497a24-2564-a067-5abb-528b1e8c6953/7300344067473.jpg/600x600bb.jpg",
    is_published: true,
  }
];

/** Inserts the built-in songs the first time, when the table is empty. */
export async function seedIfEmpty() {
  const [{ n }] = await query<{ n: number }>("app", "SELECT count(*) AS n FROM sotw_songs");
  if (n > 0) return;
  await batch(
    "app",
    DEFAULT_SONGS.map((song) => ({
      sql: `INSERT INTO sotw_songs (id, week_label, publish_date, title, artist, lyrics, audio_url, cover_image_url, is_published)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      params: [
        crypto.randomUUID(),
        song.week_label,
        song.publish_date,
        song.title,
        song.artist,
        song.lyrics,
        song.audio_url ?? null,
        song.cover_image_url ?? null,
      ],
    })),
  );
}

/** Songs, latest week first. Admin sees drafts; the public only published. */
export async function getSongs(onlyPublished = false): Promise<Song[]> {
  try {
    const rows = await query<SongRow>(
      "app",
      `SELECT ${COLUMNS} FROM sotw_songs ${onlyPublished ? "WHERE is_published = 1" : ""}
       ORDER BY publish_date DESC, created_at DESC`,
      [],
      PUBLIC_CACHE,
    );
    return rows.map(toSong);
  } catch (error) {
    console.error("Error fetching songs:", error);
    return [];
  }
}

export async function getSongById(id: string): Promise<Song | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  try {
    const [row] = await query<SongRow>("app", `SELECT ${COLUMNS} FROM sotw_songs WHERE id = ?`, [id], PUBLIC_CACHE);
    return row ? toSong(row) : null;
  } catch (error) {
    console.error("Error fetching song:", error);
    return null;
  }
}
