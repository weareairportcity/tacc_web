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

export type StoredPhoto = Blob | ArrayBuffer;

/** Safari IndexedDB often rejects a Blob/File clone. Bytes clone cleanly. */
export async function toStoredPhoto(photo: Blob): Promise<ArrayBuffer> {
  return photo.arrayBuffer();
}

export function photoAsBlob(photo: StoredPhoto): Blob {
  return photo instanceof Blob ? photo : new Blob([photo], { type: "image/jpeg" });
}

/** Object path inside the sw-photos bucket. Campaign-scoped for easy cleanup. */
export function photoPath(campaignId: string, entryId: string): string {
  return `${campaignId}/${entryId}.jpg`;
}
