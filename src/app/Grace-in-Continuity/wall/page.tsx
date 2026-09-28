import type { Metadata } from "next";
import { formatInTimeZone } from "date-fns-tz";
import { currentRole } from "@/lib/grace/auth";
import { listNotes, type WallNote } from "@/lib/grace/drive";
import { lock } from "./actions";
import { CodeGate } from "./CodeGate";
import { ExportPdfButton } from "./ExportPdfButton";
import { NoteCard } from "./NoteCard";

export const metadata: Metadata = {
  title: "Birthday Wall — Grace in Continuity",
  robots: { index: false, follow: false },
};

const photoUrl = (id: string) => `/api/grace/photo?id=${encodeURIComponent(id)}`;

/**
 * The private wall. Without a valid code cookie this renders only the code
 * form — no note, name or photo id is sent to the browser before that.
 */
export default async function WallPage() {
  const role = await currentRole();
  if (!role) return <CodeGate />;

  let notes: WallNote[];
  try {
    notes = await listNotes();
  } catch (err) {
    console.error("[grace/wall]", err);
    return (
      <main className="flex min-h-screen items-center justify-center px-6 text-center text-[15px] text-[#7a746d]">
        We could not load the notes right now. Please refresh the page in a minute.
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-24 pt-10 sm:px-8 sm:pt-14">
      <header className="flex flex-col items-center gap-5 text-center sm:flex-row sm:items-end sm:justify-between sm:text-left">
        <div>
          <p className="font-[family-name:var(--font-card-serif)] text-sm uppercase tracking-[0.3em] text-[#8a847d]">
            Grace in Continuity
          </p>
          <h1 className="mt-2 font-[family-name:var(--font-card-serif)] text-4xl font-medium text-[#2b2724] sm:text-5xl">
            Birthday wishes for <span className="italic">Pastor</span>
          </h1>
          <p className="mt-2 text-[15px] text-[#7a746d]">
            {notes.length === 1 ? "1 note" : `${notes.length} notes`} from the church family
          </p>
        </div>
        <div className="flex items-center gap-2">
          {role === "admin" && notes.length > 0 && (
            <ExportPdfButton
              notes={notes.map(({ name, letter, sentAt, previewIds }) => ({
                name,
                letter,
                sentAt,
                photoUrls: previewIds.map(photoUrl),
              }))}
            />
          )}
          <form action={lock}>
            <button
              type="submit"
              className="rounded-full border border-[#dcd7cf] bg-white/70 px-4 py-2 text-sm text-[#3a3633] transition-colors hover:bg-white"
            >
              Lock
            </button>
          </form>
        </div>
      </header>

      {notes.length === 0 ? (
        <p className="mt-24 text-center text-[15px] text-[#7a746d]">
          No notes yet. When people send their wishes, they will appear here.
        </p>
      ) : (
        <div className="mt-14 grid items-start gap-x-10 gap-y-16 md:grid-cols-2 lg:grid-cols-3">
          {notes.map((note) => (
            <NoteCard
              key={note.id}
              canDelete={role === "admin"}
              note={{
                id: note.id,
                name: note.name,
                letter: note.letter,
                sent: formatInTimeZone(note.sentAt, "Africa/Accra", "d MMM yyyy"),
                photoUrls: note.previewIds.map(photoUrl),
              }}
            />
          ))}
        </div>
      )}
    </main>
  );
}
