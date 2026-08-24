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
      headers: { "User-Agent": "Mozilla/5.0" },
    });

    if (!pageRes.ok) {
      return NextResponse.json(
        { error: `Failed to fetch page (HTTP ${pageRes.status})` },
        { status: 502 }
      );
    }

    const html = await pageRes.text();

    // Extract title from <h1 class="post-title entry-title">
    const h1Match = html.match(
      /<h1[^>]*class="[^"]*post-title[^"]*"[^>]*>([\s\S]*?)<\/h1>/i
    );
    let rawTitle = h1Match
      ? h1Match[1].replace(/<[^>]+>/g, "").trim()
      : "";

    // Parse title + artist from pattern: "TITLE BY ARTIST ..."
    let title = rawTitle;
    let artist = "";
    const byMatch = rawTitle.match(/^(.+?)\s+BY\s+(.+?)(?:\s+PRAISE\s+NIGHT.*)?$/i);
    if (byMatch) {
      title = byMatch[1].trim();
      artist = byMatch[2].trim();
      // Clean trailing "PRAISE NIGHT ..." from artist
      artist = artist.replace(/\s+PRAISE\s+NIGHT.*$/i, "").trim();
    }

    // Title case conversion
    title = title
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase());
    artist = artist
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase());
    // Fix common patterns like "Eli-j" → "Eli-J"
    artist = artist.replace(/-([a-z])/g, (_, c) => `-${c.toUpperCase()}`);

    // Extract lyrics from entry-content area
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
        .replace(/&nbsp;/g, " ")
        .replace(/&#160;/g, " ")
        .replace(/&#(\d+);/g, (_, code) => {
          const n = Number(code);
          return !isNaN(n) ? String.fromCharCode(n) : "";
        });
    }

    const entryContentMatch =
      html.match(/<div[^>]*class="[^"]*entry-content[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<!--\s*\.entry-content/i) ||
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
      // Filter out unwanted blocks, loading placeholders, download buttons
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

    // Extract audio URL from <audio ... src="...">
    const audioMatch = html.match(
      /<audio[^>]+src="([^"]+\.mp3)"/i
    );
    const externalAudioUrl = audioMatch ? audioMatch[1] : null;

    // Extract og:image as fallback cover
    const ogImageMatch = html.match(
      /<meta\s+property="og:image"\s+content="([^"]+)"/i
    );
    const ogImageUrl = ogImageMatch ? ogImageMatch[1] : null;

    // ── 2. Search iTunes for high-res album artwork ──────────────────
    let itunesArtworkUrl: string | null = null;
    try {
      const searchTerms = `${title} ${artist}`.replace(
        /[^a-zA-Z0-9\s-]/g,
        ""
      );
      const itunesRes = await fetch(
        `https://itunes.apple.com/search?term=${encodeURIComponent(
          searchTerms
        )}&entity=song&limit=10`
      );
      if (itunesRes.ok) {
        const itunesData = await itunesRes.json();
        if (itunesData.results && itunesData.results.length > 0) {
          // Try to find exact track match first
          const exactMatch = itunesData.results.find(
            (r: any) =>
              r.trackName?.toLowerCase().includes(title.toLowerCase()) ||
              r.collectionName
                ?.toLowerCase()
                .includes(title.toLowerCase())
          );
          const bestMatch = exactMatch || itunesData.results[0];
          // Get high-res artwork (600x600)
          if (bestMatch.artworkUrl100) {
            itunesArtworkUrl = bestMatch.artworkUrl100.replace(
              "100x100bb",
              "600x600bb"
            );
          }
        }
      }
    } catch {
      // iTunes lookup is best-effort, continue without it
    }

    // ── 3. Download and upload files to Supabase Storage ─────────────
    const slug = slugify(title);
    const bucket = "sotw-media";
    let storedAudioUrl: string | null = null;
    let storedCoverUrl: string | null = null;

    // Download and upload MP3
    if (externalAudioUrl) {
      try {
        const audioRes = await fetch(externalAudioUrl);
        if (audioRes.ok) {
          const audioBuffer = Buffer.from(await audioRes.arrayBuffer());
          const audioPath = `${slug}.mp3`;

          // Remove existing file first (ignore errors)
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
      } catch {
        // Audio download failed, keep external URL as fallback
      }
    }

    // Download and upload cover image
    const coverSourceUrl = itunesArtworkUrl || ogImageUrl;
    if (coverSourceUrl) {
      try {
        const imgRes = await fetch(coverSourceUrl);
        if (imgRes.ok) {
          const contentType =
            imgRes.headers.get("content-type") || "image/jpeg";
          const ext = contentType.includes("png") ? "png" : "jpg";
          const imgBuffer = Buffer.from(await imgRes.arrayBuffer());
          const imgPath = `${slug}.${ext}`;

          // Remove existing file first (ignore errors)
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
      } catch {
        // Image download failed, keep external URL as fallback
      }
    }

    return NextResponse.json({
      title,
      artist,
      lyrics,
      audio_url: storedAudioUrl || externalAudioUrl || "",
      cover_image_url:
        storedCoverUrl || itunesArtworkUrl || ogImageUrl || "",
      source_url: url,
    });
  } catch (err: any) {
    console.error("fetch-song error:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}
