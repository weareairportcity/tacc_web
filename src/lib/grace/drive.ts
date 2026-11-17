import { google, type drive_v3 } from "googleapis";

/**
 * Google Drive is the whole backend for Grace in Continuity — there is no
 * database. Acting as the church Gmail account through the refresh token from
 * scripts/grace-drive-token.mjs, with only the drive.file scope, so this sees
 * the "Grace in Continuity" folder and what it creates, nothing else.
 *
 * Layout inside the root folder:
 *
 *   Ama Mensah – 2026-09-28 20.15/     one folder per note, for Pastor
 *     photo-1.heic, photo-2.jpg …      untouched originals
 *     letter.txt
 *   _wall-previews/                    ~1600px JPEGs the wall and PDF use
 *
 * A note's folder carries its data so the wall can load every note in one
 * list call: `description` holds the note as JSON, `appProperties.status` says
 * whether its uploads finished. Previews point back at their note through
 * appProperties.note.
 */

const FOLDER_MIME = "application/vnd.google-apps.folder";
const PREVIEWS_FOLDER = "_wall-previews";

export type Note = { name: string; letter: string; sentAt: string };

export type NoteFolder = Note & {
  id: string;
  status: "pending" | "complete";
  photoCount: number;
};

let cached: { auth: InstanceType<typeof google.auth.OAuth2>; drive: drive_v3.Drive } | null = null;

// One client per server instance, so the access token is reused until it
// expires instead of being refreshed on every call (~0.5s each time).
function client() {
  if (!cached) {
    const auth = new google.auth.OAuth2(
      process.env.GOOGLE_DRIVE_CLIENT_ID,
      process.env.GOOGLE_DRIVE_CLIENT_SECRET,
    );
    auth.setCredentials({ refresh_token: process.env.GOOGLE_DRIVE_REFRESH_TOKEN });
    cached = { auth, drive: google.drive({ version: "v3", auth }) };
  }
  return cached;
}

function rootFolderId() {
  const id = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!id) throw new Error("GOOGLE_DRIVE_FOLDER_ID is not set");
  return id;
}

// Paged list; drive.file keeps the results to files this app made.
async function listAll(q: string, fields: string) {
  const { drive } = client();
  const files: drive_v3.Schema$File[] = [];
  let pageToken: string | undefined;
  do {
    const { data } = await drive.files.list({
      q,
      fields: `nextPageToken, files(${fields})`,
      pageSize: 1000,
      pageToken,
    });
    files.push(...(data.files ?? []));
    pageToken = data.nextPageToken ?? undefined;
  } while (pageToken);
  return files;
}

let previewsFolder: Promise<string> | null = null;

/** Finds or makes the _wall-previews folder; remembered for the process. */
function previewsFolderId() {
  previewsFolder ??= (async () => {
    const [existing] = await listAll(
      `'${rootFolderId()}' in parents and name = '${PREVIEWS_FOLDER}' and mimeType = '${FOLDER_MIME}' and trashed = false`,
      "id, createdTime",
    );
    if (existing?.id) return existing.id;
    const { data } = await client().drive.files.create({
      requestBody: { name: PREVIEWS_FOLDER, mimeType: FOLDER_MIME, parents: [rootFolderId()] },
      fields: "id",
    });
    return data.id!;
  })().catch((err) => {
    previewsFolder = null;
    throw err;
  });
  return previewsFolder;
}

function toNoteFolder(file: drive_v3.Schema$File): NoteFolder | null {
  try {
    const note = JSON.parse(file.description ?? "") as Note;
    return {
      ...note,
      id: file.id!,
      status: file.appProperties?.status === "complete" ? "complete" : "pending",
      photoCount: Number(file.appProperties?.photos ?? 0),
    };
  } catch {
    return null;
  }
}

export async function createNoteFolder(folderName: string, note: Note, photoCount: number) {
  const { data } = await client().drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: FOLDER_MIME,
      parents: [rootFolderId()],
      description: JSON.stringify(note),
      appProperties: { grace: "note", status: "pending", photos: String(photoCount) },
    },
    fields: "id",
  });
  return data.id!;
}

/** The note folder, or null if the id isn't one of our notes. */
export async function getNoteFolder(id: string) {
  try {
    const { data } = await client().drive.files.get({
      fileId: id,
      fields: "id, parents, description, appProperties, trashed",
    });
    if (data.trashed || data.appProperties?.grace !== "note") return null;
    if (!data.parents?.includes(rootFolderId())) return null;
    return toNoteFolder(data);
  } catch {
    return null;
  }
}

export async function markNoteComplete(id: string) {
  await client().drive.files.update({
    fileId: id,
    requestBody: { appProperties: { status: "complete" } },
  });
}

/**
 * Opens a resumable upload session and returns its URL. The browser PUTs the
 * file straight to that URL, so the bytes never pass through our server (or
 * Vercel's body limit) and are stored exactly as sent.
 *
 * Google only answers the browser's PUT with CORS headers when the session was
 * opened with the page's Origin, so it has to be passed through here.
 */
async function startResumableUpload(opts: {
  metadata: drive_v3.Schema$File;
  mimeType: string;
  size?: number;
  origin: string;
}) {
  const { token } = await client().auth.getAccessToken();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json; charset=UTF-8",
    "X-Upload-Content-Type": opts.mimeType,
    Origin: opts.origin,
  };
  if (opts.size) headers["X-Upload-Content-Length"] = String(opts.size);
  const res = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id",
    { method: "POST", headers, body: JSON.stringify(opts.metadata) },
  );
  const location = res.headers.get("location");
  if (!res.ok || !location) {
    throw new Error(`Drive refused the upload session (${res.status}): ${await res.text()}`);
  }
  return location;
}

export function startOriginalUpload(opts: {
  noteId: string;
  fileName: string;
  mimeType: string;
  size: number;
  origin: string;
}) {
  return startResumableUpload({
    metadata: { name: opts.fileName, parents: [opts.noteId] },
    mimeType: opts.mimeType,
    size: opts.size,
    origin: opts.origin,
  });
}

// The preview is made on the phone after the session opens, so its size isn't
// known up front; Drive takes the length from the PUT instead.
export async function startPreviewUpload(opts: { noteId: string; index: number; origin: string }) {
  return startResumableUpload({
    metadata: {
      name: `${opts.noteId}-${opts.index}.jpg`,
      parents: [await previewsFolderId()],
      appProperties: { grace: "preview", note: opts.noteId, index: String(opts.index) },
    },
    mimeType: "image/jpeg",
    origin: opts.origin,
  });
}

/** How many originals and previews have actually landed for a note. */
export async function countUploads(noteId: string) {
  const [originals, previews] = await Promise.all([
    listAll(`'${noteId}' in parents and name contains 'photo-' and trashed = false`, "id, size"),
    listAll(
      `'${await previewsFolderId()}' in parents and appProperties has { key='note' and value='${noteId}' } and trashed = false`,
      "id, size",
    ),
  ]);
  const landed = (files: drive_v3.Schema$File[]) => files.filter((f) => Number(f.size) > 0).length;
  return { originals: landed(originals), previews: landed(previews) };
}

export async function uploadText(name: string, content: string, parent: string) {
  await client().drive.files.create({
    requestBody: { name, parents: [parent] },
    media: { mimeType: "text/plain", body: content },
    fields: "id",
  });
}

// ─── The wall ────────────────────────────────────────────────────────────────

export type WallNote = Note & { id: string; previewIds: string[] };

/** Every finished note, newest first, with its preview ids in photo order. */
export async function listNotes(): Promise<WallNote[]> {
  const [folders, previews] = await Promise.all([
    listAll(
      `'${rootFolderId()}' in parents and mimeType = '${FOLDER_MIME}' and appProperties has { key='status' and value='complete' } and trashed = false`,
      "id, description, appProperties",
    ),
    previewsFolderId().then((id) =>
      listAll(`'${id}' in parents and trashed = false`, "id, appProperties"),
    ),
  ]);

  const byNote = new Map<string, { id: string; index: number }[]>();
  for (const p of previews) {
    const note = p.appProperties?.note;
    if (!note || !p.id) continue;
    const list = byNote.get(note) ?? [];
    list.push({ id: p.id, index: Number(p.appProperties?.index ?? 0) });
    byNote.set(note, list);
  }

  return folders
    .map(toNoteFolder)
    .filter((n): n is NoteFolder => n !== null)
    .map(({ id, name, letter, sentAt }) => ({
      id,
      name,
      letter,
      sentAt,
      previewIds: (byNote.get(id) ?? []).sort((a, b) => a.index - b.index).map((p) => p.id),
    }))
    .sort((a, b) => b.sentAt.localeCompare(a.sentAt));
}

/**
 * Streams a preview JPEG. Only files this app filed as previews qualify, so
 * the route can't be used to read an original or anything else.
 */
export async function fetchPreview(fileId: string) {
  const { auth, drive } = client();
  const [meta, { token }] = await Promise.all([
    drive.files.get({ fileId, fields: "appProperties, trashed" }).catch(() => null),
    auth.getAccessToken(),
  ]);
  if (!meta || meta.data.trashed || meta.data.appProperties?.grace !== "preview") return null;
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  return res.ok ? res : null;
}

/**
 * Moves a note's folder (originals + letter.txt) and its previews to the
 * Drive bin, where they stay recoverable for 30 days.
 */
export async function trashNote(noteId: string) {
  const { drive } = client();
  const previews = await listAll(
    `'${await previewsFolderId()}' in parents and appProperties has { key='note' and value='${noteId}' } and trashed = false`,
    "id",
  );
  await Promise.all(
    [noteId, ...previews.map((p) => p.id!)].map((fileId) =>
      drive.files.update({ fileId, requestBody: { trashed: true } }),
    ),
  );
}
