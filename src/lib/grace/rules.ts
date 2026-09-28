// Limits for Grace in Continuity submissions, shared by the form and the API
// so the browser and the server always agree on what's allowed.

export const MAX_PHOTOS = 3;
export const MAX_WORDS = 200;
export const MAX_NAME_LENGTH = 40;
// Originals only; Drive itself has no practical limit. This just stops a
// mis-picked video or RAW file from tying up someone's phone for an hour.
export const MAX_PHOTO_BYTES = 50 * 1024 * 1024;
// Longest edge of the JPEG copy the wall and PDF use.
export const DISPLAY_MAX_EDGE = 1600;

export const countWords = (text: string) => text.match(/\S+/g)?.length ?? 0;

export const isHeic = (file: { type: string; name: string }) =>
  /hei[cf]/i.test(file.type) || /\.(heic|heif)$/i.test(file.name);

export const isImage = (file: { type: string; name: string }) =>
  file.type.startsWith("image/") || isHeic(file);
