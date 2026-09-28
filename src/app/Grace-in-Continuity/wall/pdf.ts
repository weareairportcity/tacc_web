import { jsPDF } from "jspdf";

// The birthday book: a cover, then one A4 page per note with its polaroids
// across the top and the letter in handwriting underneath. Built in the
// admin's browser from the same cookie-gated previews the wall shows.

export type BookNote = { name: string; letter: string; sentAt: string; photoUrls: string[] };

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 18;
const BG: [number, number, number] = [247, 246, 243];
const INK: [number, number, number] = [47, 44, 42];
const MUTED: [number, number, number] = [138, 132, 125];
const HAND = "Caveat";
const SERIF = "Cormorant";

async function loadFont(doc: jsPDF, file: string, family: string, style: string) {
  const res = await fetch(`/grace/fonts/${file}`);
  if (!res.ok) throw new Error(`font ${file}: ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  doc.addFileToVFS(file, btoa(binary));
  doc.addFont(file, family, style);
}

/** Square, centre-cropped JPEG data URL, sized for print. */
async function squarePhoto(url: string, edge = 1000) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`photo: ${res.status}`);
  const bitmap = await createImageBitmap(await res.blob());
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = Math.min(edge, side);
  canvas
    .getContext("2d")!
    .drawImage(
      bitmap,
      (bitmap.width - side) / 2,
      (bitmap.height - side) / 2,
      side,
      side,
      0,
      0,
      canvas.width,
      canvas.height,
    );
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.85);
}

function background(doc: jsPDF) {
  doc.setFillColor(...BG);
  doc.rect(0, 0, PAGE_W, PAGE_H, "F");
}

function cover(doc: jsPDF, count: number) {
  background(doc);
  doc.setTextColor(...MUTED);
  doc.setFont(SERIF, "normal");
  doc.setFontSize(12);
  doc.text("GRACE IN CONTINUITY", PAGE_W / 2, 118, { align: "center", charSpace: 1.2 });
  doc.setTextColor(43, 39, 36);
  doc.setFontSize(46);
  doc.text("Happy Birthday,", PAGE_W / 2, 140, { align: "center" });
  doc.setFont(SERIF, "italic");
  doc.text("Pastor", PAGE_W / 2, 158, { align: "center" });
  doc.setTextColor(...MUTED);
  doc.setFont(SERIF, "normal");
  doc.setFontSize(14);
  doc.text(
    `${count === 1 ? "1 note" : `${count} notes`} from the church family`,
    PAGE_W / 2,
    176,
    { align: "center" },
  );
}

function polaroid(doc: jsPDF, image: string, name: string, x: number, y: number, w: number) {
  const pad = w * 0.06;
  const photo = w - pad * 2;
  const strip = w * 0.24;
  const h = pad + photo + strip;
  // Soft shadow, then the card.
  doc.setFillColor(226, 223, 218);
  doc.rect(x + 0.8, y + 1.2, w, h, "F");
  doc.setFillColor(253, 253, 251);
  doc.rect(x, y, w, h, "F");
  doc.addImage(image, "JPEG", x + pad, y + pad, photo, photo);
  doc.setFont(HAND, "normal");
  doc.setTextColor(74, 70, 67);
  let size = Math.min(22, w * 0.3);
  doc.setFontSize(size);
  while (doc.getTextWidth(name) > photo && size > 9) doc.setFontSize((size -= 1));
  doc.text(name, x + w / 2, y + pad + photo + strip * 0.62, { align: "center" });
  return h;
}

function notePage(doc: jsPDF, note: BookNote, images: string[]) {
  doc.addPage();
  background(doc);

  let bottom = MARGIN + 6;
  if (images.length) {
    const gap = 8;
    const w = images.length === 1 ? 88 : images.length === 2 ? 76 : 54;
    const rowW = images.length * w + (images.length - 1) * gap;
    const start = (PAGE_W - rowW) / 2;
    images.forEach((img, i) => {
      const h = polaroid(doc, img, note.name, start + i * (w + gap), MARGIN + 6, w);
      bottom = Math.max(bottom, MARGIN + 6 + h);
    });
  }

  // The letter, on a white sheet, shrinking the hand if a long note needs it.
  const sheetX = MARGIN;
  const sheetY = bottom + 12;
  const sheetW = PAGE_W - MARGIN * 2;
  const sheetH = PAGE_H - MARGIN - sheetY;
  const inset = 10;
  const textW = sheetW - inset * 2;
  doc.setFont(HAND, "normal");
  let size = 19;
  let lines: string[] = [];
  const lineH = () => size * 0.3528 * 1.35;
  for (; size >= 11; size -= 1) {
    doc.setFontSize(size);
    lines = doc.splitTextToSize(note.letter, textW);
    if ((lines.length + 2) * lineH() <= sheetH - inset * 2) break;
  }

  // Short notes get a sheet sized to the writing, not a mostly empty page.
  const usedH = Math.min(sheetH, (lines.length + 2) * lineH() + inset * 2);
  doc.setFillColor(255, 255, 255);
  doc.rect(sheetX, sheetY, sheetW, Math.max(usedH, 70), "F");
  doc.setTextColor(...INK);
  doc.text(lines, sheetX + inset, sheetY + inset + lineH() * 0.8, { lineHeightFactor: 1.35 });
  doc.setTextColor(107, 101, 96);
  doc.text(
    `— ${note.name}`,
    sheetX + sheetW - inset,
    sheetY + inset + lineH() * (lines.length + 1.3),
    { align: "right" },
  );

  const sent = new Date(note.sentAt).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Africa/Accra",
  });
  doc.setFont(SERIF, "normal");
  doc.setFontSize(10);
  doc.setTextColor(...MUTED);
  doc.text(sent, PAGE_W / 2, PAGE_H - 8, { align: "center" });
}

export async function buildBirthdayBook(notes: BookNote[], onProgress: (f: number) => void) {
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  await Promise.all([
    loadFont(doc, "Caveat-Medium.ttf", HAND, "normal"),
    loadFont(doc, "CormorantGaramond-Medium.ttf", SERIF, "normal"),
    loadFont(doc, "CormorantGaramond-MediumItalic.ttf", SERIF, "italic"),
  ]);

  cover(doc, notes.length);
  // Oldest first reads more naturally as a book than the wall's newest-first.
  const ordered = [...notes].sort((a, b) => a.sentAt.localeCompare(b.sentAt));
  for (const [i, note] of ordered.entries()) {
    const images = await Promise.all(note.photoUrls.map((url) => squarePhoto(url)));
    notePage(doc, note, images);
    onProgress((i + 1) / ordered.length);
  }
  return doc.output("blob");
}
