/**
 * Shrinks a photo on the phone before it's sent: at most 1280 px on the long
 * side, as a JPEG, under about 300 KB (a phone photo is several MB). Falls
 * back to smaller sizes until it fits. Resolves null if the browser can't read it.
 */
const MAX_SIDE = 1280;
const TARGET = 300 * 1024;

async function bitmapOf(file: File): Promise<ImageBitmap | HTMLImageElement | null> {
  try {
    if ("createImageBitmap" in window) return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    // Fall through to an <img>.
  }
  try {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } catch {
    return null;
  }
}

const toJpeg = (canvas: HTMLCanvasElement, quality: number) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));

export async function downsizePhoto(file: File): Promise<Blob | null> {
  const src = await bitmapOf(file);
  if (!src) return null;
  const w = "naturalWidth" in src ? src.naturalWidth : src.width;
  const h = "naturalHeight" in src ? src.naturalHeight : src.height;
  if (!w || !h) return null;
  let scale = Math.min(1, MAX_SIDE / Math.max(w, h));
  for (let round = 0; round < 4; round++) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.72, 0.6, 0.5]) {
      const blob = await toJpeg(canvas, quality);
      if (blob && blob.size <= TARGET) return blob;
      if (blob && round === 3 && quality === 0.5) return blob;
    }
    scale *= 0.75;
  }
  return null;
}
