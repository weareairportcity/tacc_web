import { NextResponse } from "next/server";
import { putMedia } from "@/lib/cf";
import { songsAdmin } from "@/lib/code-session";

// Sanitize a string for use as a Supabase Storage file name
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&#038;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#8216;/g, "'")
    .replace(/&#8217;/g, "'")
    .replace(/&#8220;/g, '"')
    .replace(/&#8221;/g, '"')
    .replace(/&#8230;/g, "...")
    .replace(/&hellip;/g, "...")
    .replace(/&#8211;/g, "-")
    .replace(/&#8212;/g, "—")
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/&nbsp;/g, " ")
    .replace(/&#160;/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, code) => {
      const n = Number(code);
      return !isNaN(n) ? String.fromCharCode(n) : "";
    });
}

function toTitleCase(str: string): string {
  return str
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/-([a-z])/g, (_, c) => `-${c.toUpperCase()}`)
    .replace(/\bAnd\b/g, "&")
    .trim();
}

type ParsedSong = {
  title: string;
  artist: string;
  lyrics: string;
  externalAudioUrl: string | null;
  pageCoverUrl: string | null;
};

const stripTags = (html: string) => decodeHtmlEntities(html.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "")).trim();

/** The old WordPress loveworldlyrics.com pages. */
function parseLoveworldWordPress(html: string): ParsedSong {
  // Extract title from <h1 class="post-title entry-title"> or <title>
  const h1Match = html.match(
    /<h1[^>]*class="[^"]*post-title[^"]*"[^>]*>([\s\S]*?)<\/h1>/i
  );
  let rawTitle = h1Match
    ? h1Match[1].replace(/<[^>]+>/g, "").trim()
    : "";

  if (!rawTitle) {
    const titleTagMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
    rawTitle = titleTagMatch ? titleTagMatch[1].replace(/<[^>]+>/g, "").trim() : "";
  }

  // Clean special entities
  rawTitle = decodeHtmlEntities(rawTitle)
    .replace(/\s+/g, " ")
    .replace(/\s*-\s*LOVEWORLD\s+SONGS.*$/i, "")
    .trim();

  // Parse title + artist from pattern: "TITLE BY ARTIST ..."
  let title = rawTitle;
  let artist = "Loveworld Singers";

  const byMatch = rawTitle.match(/^(.+?)\s+BY\s+(.+)$/i);
  if (byMatch) {
    title = byMatch[1].trim();
    artist = byMatch[2].trim();

    // Clean trailing event/service tags from artist:
    // e.g. "LOVEWORLD SINGERS – FEBRUARY COMMUNION SERVICE", "PRAISE NIGHT 19"
    artist = artist
      .replace(
        /\s*[-–|]\s*(?:JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER)?\s*(?:COMMUNION|PRAISE|WORSHIP|SERVICE|NIGHT|GLOBAL).*/i,
        ""
      )
      .replace(/\s+PRAISE\s+NIGHT.*$/i, "")
      .replace(/\s+COMMUNION\s+SERVICE.*$/i, "")
      .replace(/[-–|]\s*$/g, "")
      .trim();
  }

  // Title case formatting
  title = toTitleCase(title);
  artist = toTitleCase(artist);

  // ── 2. Extract Lyrics ───────────────────────────────────────────
  const entryContentMatch =
    html.match(
      /<div[^>]*class="[^"]*entry-content[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<!--\s*\.entry-content/i
    ) ||
    html.match(/<div[^>]*class="[^"]*entry-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
  const contentArea = entryContentMatch ? entryContentMatch[1] : html;

  const lyricBlocks: string[] = [];
  const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let pMatch;
  while ((pMatch = pRegex.exec(contentArea)) !== null) {
    let block = pMatch[1]
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "");
    block = decodeHtmlEntities(block).trim();

    const lower = block.toLowerCase().trim();
    // Filter out unwanted blocks, loading placeholders, download buttons, ads
    if (
      !block ||
      lower.startsWith("loading") ||
      lower === "loading..." ||
      lower === "loading…" ||
      lower.startsWith("donwload") ||
      lower.startsWith("download") ||
      lower.startsWith("more from")
    ) {
      continue;
    }
    lyricBlocks.push(block);
  }
  const lyrics = lyricBlocks.join("\n\n");

  // ── 3. Extract Audio URL ────────────────────────────────────────
  const audioMatch = html.match(/<audio[^>]+src="([^"]+\.mp3)"/i);
  const externalAudioUrl = audioMatch ? audioMatch[1] : null;

  // ── 4. Extract Fallback Cover Images from Page ───────────────────
  const ogImageMatch =
    html.match(/<meta\s+(?:property|name)=["']og:image["']\s+content=["']([^"']+)["']/i) ||
    html.match(/content=["']([^"']+)["']\s+(?:property|name)=["']og:image["']/i) ||
    html.match(/<meta\s+(?:property|name)=["']twitter:image["']\s+content=["']([^"']+)["']/i) ||
    html.match(/<img[^>]+class="[^"]*(?:wp-post-image|attachment-jannah-image-post)[^"]*"[^>]+src=["']([^"']+)["']/i) ||
    html.match(/<figure[^>]*class="[^"]*single-featured-image[^"]*"[^>]*><img[^>]+src=["']([^"']+)["']/i) ||
    html.match(/"thumbnailUrl"\s*:\s*"([^"]+)"/i);

  const pageCoverUrl = ogImageMatch ? ogImageMatch[1] : null;

  return { title, artist, lyrics, externalAudioUrl, pageCoverUrl };
}

/** plus.loveworldlyrics.com (where loveworldlyrics.com links now redirect). */
function parseLoveworldPlus(html: string): ParsedSong {
  let title = "";
  let artist = "Loveworld Singers";
  let externalAudioUrl: string | null = null;
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi)) {
    try {
      const data = JSON.parse(m[1]);
      if (data?.["@type"] !== "MusicRecording") continue;
      title = data.name ?? "";
      artist = data.byArtist?.name ?? artist;
      externalAudioUrl = data.audio?.contentUrl ?? null;
    } catch {
      // Not the song's structured data.
    }
  }

  // Lyrics: headings ("Verse", "Chorus") start a new section, other <p>s are lines.
  const area = html.match(/class="lyrics-scroll[^"]*"[^>]*>([\s\S]*?)<\/div>/i)?.[1] ?? "";
  const lines: string[] = [];
  for (const m of area.matchAll(/<p([^>]*)>([\s\S]*?)<\/p>/gi)) {
    const text = stripTags(m[2]);
    if (!text) continue;
    if (/uppercase/.test(m[1])) lines.push("", text);
    else lines.push(text);
  }

  return {
    title: toTitleCase(decodeHtmlEntities(title)),
    artist: toTitleCase(decodeHtmlEntities(artist)),
    lyrics: lines.join("\n").trim(),
    externalAudioUrl,
    pageCoverUrl: null,
  };
}

/** ceenaija.com song posts: "Title Lyrics by Artist" or "Lyrics: Title by Artist", then the verses. */
function parseCeeNaija(html: string): ParsedSong {
  const heading = html.match(/<h[23][^>]*>((?:(?!<\/h[23]>)[\s\S])*?Lyrics(?:(?!<\/h[23]>)[\s\S])*?)<\/h[23]>/i);
  const headingText = heading ? stripTags(heading[1]).replace(/\s+/g, " ") : "";
  const byHeading =
    headingText.match(/^(.+?)\s+Lyrics\s+by\s+(.+)$/i) ?? headingText.match(/^Lyrics:?\s+(.+?)\s+by\s+(.+)$/i);

  // Fallback: <title>DOWNLOAD SONG: Artist - Title (Mp3 & Lyrics) | CeeNaija</title>
  const pageTitle = stripTags(html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? "")
    .replace(/^[^:]*:\s*/, "")
    .replace(/\s*\(.*$/, "")
    .replace(/\s*\|.*$/, "");
  const [titleArtist, titleSong] = pageTitle.split(/\s+[-–]\s+/);

  const title = byHeading?.[1] ?? titleSong ?? pageTitle;
  const artist = byHeading?.[2] ?? titleArtist ?? "";

  let lyrics = "";
  if (heading?.index !== undefined) {
    const after = html.slice(heading.index + heading[0].length);
    const end = after.search(/Spread the word|class="sharedaddy|<footer|td-post-sharing/i);
    const area = end >= 0 ? after.slice(0, end) : after;
    const blocks = [...area.matchAll(/<p class="wp-block-paragraph"[^>]*>([\s\S]*?)<\/p>/gi)]
      .map((m) => stripTags(m[1]))
      .filter(Boolean);
    // A paragraph that is only "Chorus", "Refrain"… heads the next one.
    lyrics = blocks
      .map((b, i) => (i > 0 && /^\[?(verse|chorus|refrain|bridge|pre-chorus|tag|outro|intro)\b[^\n]{0,12}$/i.test(blocks[i - 1]) ? `\n${b}` : `\n\n${b}`))
      .join("")
      .trim();
  }

  const audio = html.match(/href="(https?:\/\/[^"]+\.mp3)"/i) ?? html.match(/(https?:\/\/[^"' ]+\.mp3)/i);
  const og = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i);

  return {
    title: decodeHtmlEntities(title).trim(),
    artist: decodeHtmlEntities(artist).trim(),
    lyrics,
    externalAudioUrl: audio?.[1] ?? null,
    pageCoverUrl: og?.[1] ?? null,
  };
}

const SUPPORTED = /(^|\.)(loveworldlyrics\.com|ceenaija\.com)$/i;

export async function POST(request: Request) {
  if (!(await songsAdmin.isValid())) {
    return NextResponse.json({ error: "Please sign in to the songs admin again." }, { status: 401 });
  }
  try {
    // cover: false skips the artwork search (Live Services use the service's cover).
    const { url, cover = true } = await request.json();

    let host = "";
    try {
      host = new URL(url).hostname;
    } catch {}
    if (!SUPPORTED.test(host)) {
      return NextResponse.json(
        { error: "Please provide a loveworldlyrics.com or ceenaija.com song link" },
        { status: 400 }
      );
    }

    // ── 1. Fetch and parse the page ──────────────────────────────────
    const pageRes = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      },
    });

    if (!pageRes.ok) {
      return NextResponse.json(
        { error: `Failed to fetch page (HTTP ${pageRes.status}). The link may have moved.` },
        { status: 502 }
      );
    }

    const html = await pageRes.text();
    // Old loveworldlyrics.com links redirect to plus.loveworldlyrics.com.
    const finalHost = new URL(pageRes.url || url).hostname;
    const { title, artist, lyrics, externalAudioUrl, pageCoverUrl } = finalHost.endsWith("ceenaija.com")
      ? parseCeeNaija(html)
      : finalHost.startsWith("plus.")
        ? parseLoveworldPlus(html)
        : parseLoveworldWordPress(html);

    if (!title) {
      return NextResponse.json({ error: "Couldn't find a song on that page." }, { status: 422 });
    }

    // ── 5. Search iTunes for High-Res Album Artwork ──────────────────
    let itunesArtworkUrl: string | null = null;
    if (cover) {
      try {
        // Tier 1: Search clean title + clean artist
        const cleanTitle = title.replace(/[^a-zA-Z0-9\s-]/g, "").trim();
        const cleanArtist = artist.replace(/[^a-zA-Z0-9\s-]/g, "").trim();
        let query = `${cleanTitle} ${cleanArtist}`;

        let itunesRes = await fetch(
          `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=5`
        );
        let itunesData = itunesRes.ok ? await itunesRes.json() : { results: [] };

        // Tier 2: Search title + Loveworld Singers
        if (!itunesData.results || itunesData.results.length === 0) {
          query = `${cleanTitle} Loveworld Singers`;
          itunesRes = await fetch(
            `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=5`
          );
          itunesData = itunesRes.ok ? await itunesRes.json() : { results: [] };
        }

        // Tier 3: Search title only
        if (!itunesData.results || itunesData.results.length === 0) {
          itunesRes = await fetch(
            `https://itunes.apple.com/search?term=${encodeURIComponent(cleanTitle)}&entity=song&limit=5`
          );
          itunesData = itunesRes.ok ? await itunesRes.json() : { results: [] };
        }

        if (itunesData.results && itunesData.results.length > 0) {
          const exactMatch = itunesData.results.find(
            (r: any) =>
              r.trackName?.toLowerCase().includes(title.toLowerCase()) ||
              r.collectionName?.toLowerCase().includes(title.toLowerCase())
          );
          const bestMatch = exactMatch || itunesData.results[0];
          if (bestMatch.artworkUrl100) {
            itunesArtworkUrl = bestMatch.artworkUrl100.replace("100x100bb", "600x600bb");
          }
        }
      } catch (e) {
        console.warn("iTunes artwork search error:", e);
      }
    }

    // ── 6. Download and store files in Cloudflare R2 ─────────────────
    // A timestamp keeps every stored URL unique, so it can be cached forever.
    const slug = `${slugify(title)}-${Date.now()}`;
    let storedAudioUrl: string | null = null;
    let storedCoverUrl: string | null = null;

    const downloadHeaders = {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    };

    // Download and upload MP3
    if (externalAudioUrl) {
      try {
        const audioRes = await fetch(externalAudioUrl, { headers: downloadHeaders });
        if (audioRes.ok) {
          const audioBuffer = Buffer.from(await audioRes.arrayBuffer());
          storedAudioUrl = await putMedia(`${slug}.mp3`, audioBuffer, "audio/mpeg");
        }
      } catch (e) {
        console.warn("Audio storage upload failed, using external URL fallback:", e);
      }
    }

    // Download and upload Cover Image
    const coverSourceUrl = cover ? itunesArtworkUrl || pageCoverUrl : null;
    if (coverSourceUrl) {
      try {
        const imgRes = await fetch(coverSourceUrl, { headers: downloadHeaders });
        if (imgRes.ok) {
          const contentType = imgRes.headers.get("content-type") || "image/jpeg";
          const ext = contentType.includes("png") ? "png" : "jpg";
          const imgBuffer = Buffer.from(await imgRes.arrayBuffer());
          storedCoverUrl = await putMedia(`${slug}.${ext}`, imgBuffer, contentType);
        }
      } catch (e) {
        console.warn("Cover image storage upload failed, using direct URL fallback:", e);
      }
    }

    return NextResponse.json({
      title,
      artist,
      lyrics,
      audio_url: storedAudioUrl || externalAudioUrl || "",
      cover_image_url: cover ? storedCoverUrl || itunesArtworkUrl || pageCoverUrl || "" : "",
      source_url: url,
    });
  } catch (err: any) {
    console.error("fetch-song route error:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}
