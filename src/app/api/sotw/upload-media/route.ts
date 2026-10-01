import { NextResponse } from "next/server";
import { putMedia } from "@/lib/cf";
import { songsAdmin } from "@/lib/code-session";


// Allowed MIME types
const ALLOWED_TYPES: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const MAX_SIZE = 25 * 1024 * 1024; // 25 MB

export async function POST(request: Request) {
  if (!(await songsAdmin.isValid())) {
    return NextResponse.json({ error: "Please sign in to the songs admin again." }, { status: 401 });
  }
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const nameHint = (formData.get("name") as string) || "upload";

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: "File too large (max 25 MB)" },
        { status: 400 }
      );
    }

    const ext = ALLOWED_TYPES[file.type];
    if (!ext) {
      return NextResponse.json(
        { error: `Unsupported file type: ${file.type}` },
        { status: 400 }
      );
    }

    // Build a clean filename
    const slug = nameHint
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80);
    const timestamp = Date.now();
    const filePath = `${slug}-${timestamp}.${ext}`;

    const buffer = Buffer.from(await file.arrayBuffer());

    // Stored in Cloudflare R2 and served from media.theairportcitychurch.com.
    // The timestamp keeps every upload's URL unique, so it can be cached forever.
    const url = await putMedia(filePath, buffer, file.type);

    return NextResponse.json({ url, path: filePath });
  } catch (err: any) {
    console.error("upload-media error:", err);
    return NextResponse.json(
      { error: err.message || "Upload failed" },
      { status: 500 }
    );
  }
}
