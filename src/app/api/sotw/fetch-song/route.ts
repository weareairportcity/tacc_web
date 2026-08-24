import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

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

export async function POST(request: Request) {
  try {
    const { url } = await request.json();

    if (!url || !url.includes("loveworldlyrics.com")) {
      return NextResponse.json(
        { error: "Please provide a valid loveworldlyrics.com URL" },
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
        { error: `Failed to fetch page (HTTP ${pageRes.status})` },
        { status: 502 }
      );
    }

    const html = await pageRes.text();

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

    // ── 5. Search iTunes for High-Res Album Artwork ──────────────────
    let itunesArtworkUrl: string | null = null;
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

    // ── 6. Download and Upload Files to Supabase Storage ─────────────
    const slug = slugify(title);
    const bucket = "sotw-media";
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
          const audioPath = `${slug}.mp3`;

          await supabaseAdmin.storage.from(bucket).remove([audioPath]);

          const { error: uploadError } = await supabaseAdmin.storage
            .from(bucket)
            .upload(audioPath, audioBuffer, {
              contentType: "audio/mpeg",
              upsert: true,
            });

          if (!uploadError) {
            const { data: publicUrl } = supabaseAdmin.storage
              .from(bucket)
              .getPublicUrl(audioPath);
            storedAudioUrl = publicUrl.publicUrl;
          }
        }
      } catch (e) {
        console.warn("Audio storage upload failed, using external URL fallback:", e);
      }
    }

    // Download and upload Cover Image
    const coverSourceUrl = itunesArtworkUrl || pageCoverUrl;
    if (coverSourceUrl) {
      try {
        const imgRes = await fetch(coverSourceUrl, { headers: downloadHeaders });
        if (imgRes.ok) {
          const contentType = imgRes.headers.get("content-type") || "image/jpeg";
          const ext = contentType.includes("png") ? "png" : "jpg";
          const imgBuffer = Buffer.from(await imgRes.arrayBuffer());
          const imgPath = `${slug}.${ext}`;

          await supabaseAdmin.storage.from(bucket).remove([imgPath]);

          const { error: uploadError } = await supabaseAdmin.storage
            .from(bucket)
            .upload(imgPath, imgBuffer, {
              contentType,
              upsert: true,
            });

          if (!uploadError) {
            const { data: publicUrl } = supabaseAdmin.storage
              .from(bucket)
              .getPublicUrl(imgPath);
            storedCoverUrl = publicUrl.publicUrl;
          }
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
      cover_image_url: storedCoverUrl || itunesArtworkUrl || pageCoverUrl || "",
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
