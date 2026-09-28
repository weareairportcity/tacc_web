import { DISPLAY_MAX_EDGE, isHeic } from "@/lib/grace/rules";

// Browser side of sending a note: make the small display copies, open the
// upload sessions, push every file straight to Google Drive, then tell the
// server we're done.

type StartResponse = {
  id: string;
  uploads: { original: string; preview: string }[];
};

export type Outgoing = { file: File; previewUrl: string };

// Everything the sender can see goes through here, so no raw browser or HTTP
// error ("Failed to fetch", "Upload failed (403)") ever reaches the page.
export const MESSAGES = {
  offline: "You seem to be offline. Please check your internet connection and tap Try again.",
  dropped: "Your internet connection dropped while sending. Please check it and tap Try again.",
  upload: "One of your photos did not upload. Please tap Try again.",
  prepare: "We could not get one of your photos ready. Please remove it, add it again and tap Try again.",
  server: "Something went wrong on our side. Please wait a moment and tap Try again.",
};

export class SendError extends Error {}

/** Downscaled JPEG for the wall and PDF. The original is left untouched. */
export async function displayCopy(previewUrl: string) {
  const img = new Image();
  img.src = previewUrl;
  await img.decode();
  const scale = Math.min(1, DISPLAY_MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/jpeg", 0.85),
  );
}

// fetch() can't report upload progress, so this uses XHR.
function put(url: string, body: Blob, contentType: string, onProgress: (loaded: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (e) => onProgress(e.loaded);
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? (onProgress(body.size), resolve())
        : reject(new SendError(MESSAGES.upload));
    xhr.onerror = () => reject(new SendError(navigator.onLine ? MESSAGES.upload : MESSAGES.dropped));
    xhr.send(body);
  });
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => {
    throw new SendError(MESSAGES.dropped);
  });
  // Our routes always answer with a plain-English { error }; anything else
  // (a timeout page, a gateway error) gets the generic message.
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new SendError(typeof data.error === "string" ? data.error : MESSAGES.server);
  return data as T;
}

export async function sendNote(
  note: { name: string; letter: string; photos: Outgoing[] },
  onProgress: (fraction: number) => void,
) {
  if (!navigator.onLine) throw new SendError(MESSAGES.offline);

  const copies = await Promise.all(note.photos.map((p) => displayCopy(p.previewUrl))).catch(() => {
    throw new SendError(MESSAGES.prepare);
  });

  const { id, uploads } = await postJson<StartResponse>("/api/grace/start", {
    name: note.name,
    letter: note.letter,
    photos: note.photos.map(({ file }) => ({
      name: file.name,
      type: file.type || (isHeic(file) ? "image/heic" : ""),
      size: file.size,
    })),
  });

  const bodies = note.photos.flatMap((p, i) => [
    { url: uploads[i].original, blob: p.file as Blob, type: p.file.type || "image/heic" },
    { url: uploads[i].preview, blob: copies[i], type: "image/jpeg" },
  ]);
  const total = bodies.reduce((sum, b) => sum + b.blob.size, 0);
  const loaded = bodies.map(() => 0);
  await Promise.all(
    bodies.map((b, i) =>
      put(b.url, b.blob, b.type, (n) => {
        loaded[i] = n;
        onProgress(loaded.reduce((a, c) => a + c, 0) / total);
      }),
    ),
  );

  await postJson("/api/grace/finish", { id });
}
