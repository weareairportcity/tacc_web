/**
 * Photos are compressed on the device before they ever touch the queue: a
 * modern phone camera produces 3-5MB files, and a member on a weak signal
 * cannot afford to push that. Long edge 1024px at JPEG 0.65 lands around
 * 100-160KB: roughly 7,000 photos inside a free-tier Supabase bucket, still
 * sharp on a projector card, and quick to push over a weak connection.
 */

const MAX_EDGE = 1024;
const QUALITY = 0.65;

export async function compressPhoto(file: File | Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file);

  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    return file;
  }

  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", QUALITY)
  );

  return blob ?? file;
}

const THUMB_EDGE = 320;
const THUMB_QUALITY = 0.7;

/**
 * The small copy the counter's marquee shows (~20-30KB). Made on the phone at
 * upload time, because the tiles are tiny and every open screen downloads
 * them: 1909 sent the full photo to every screen, over and over.
 */
export async function makeThumbnail(photo: Blob): Promise<Blob | null> {
  try {
    const bitmap = await createImageBitmap(photo);
    const scale = Math.min(1, THUMB_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext("2d");
    if (!context) {
      bitmap.close();
      return null;
    }
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", THUMB_QUALITY));
  } catch {
    return null;
  }
}

export const thumbPath = (path: string) => path.replace(/\.jpg$/, "-t.jpg");

export type StoredPhoto = Blob | ArrayBuffer;

/** Safari IndexedDB often rejects a Blob/File clone. Bytes clone cleanly. */
export async function toStoredPhoto(photo: Blob): Promise<ArrayBuffer> {
  return photo.arrayBuffer();
}

export function photoAsBlob(photo: StoredPhoto): Blob {
  return photo instanceof Blob ? photo : new Blob([photo], { type: "image/jpeg" });
}

/** Object key in the photos bucket. Campaign-scoped for easy cleanup. */
export function photoPath(campaignId: string, entryId: string): string {
  return `${campaignId}/${entryId}.jpg`;
}
