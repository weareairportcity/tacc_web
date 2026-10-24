"use client";

import { createContext, useContext, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, X } from "lucide-react";
import { ErrorText, buttonClass, inputClass } from "@/components/camp/ui";
import { assignGroupAction, assignPersonAction, sendRoomSmsAction, unassignAction } from "../../actions";

/**
 * The last assignment's warning (a partly filled room, an open group). Kept
 * here, above the lists, because the row that raised it disappears once the
 * group or person is placed.
 */
const NoticeContext = createContext<(notice: string) => void>(() => {});

export function Notices({ children }: { children: React.ReactNode }) {
  const [notice, setNotice] = useState("");
  return (
    <NoticeContext.Provider value={setNotice}>
      {notice && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" />
          <span className="flex-1">{notice}</span>
          <button type="button" aria-label="Dismiss" onClick={() => setNotice("")}>
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      {children}
    </NoticeContext.Provider>
  );
}

export type RoomOption = { id: string; label: string; free: number };

/** A room picker listing only rooms with enough free beds, and an Assign button. */
export function AssignPicker({
  kind,
  id,
  need,
  rooms,
}: {
  kind: "group" | "person";
  id: string;
  need: number;
  rooms: RoomOption[];
}) {
  const router = useRouter();
  const setNotice = useContext(NoticeContext);
  const fits = rooms.filter((r) => r.free >= need);
  const [roomId, setRoomId] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  if (!fits.length) {
    return <p className="text-xs text-amber-700">No room has {need} free bed{need === 1 ? "" : "s"}.</p>;
  }

  const assign = () => {
    setError("");
    setNotice("");
    startTransition(async () => {
      const result = kind === "group" ? await assignGroupAction(roomId, id) : await assignPersonAction(roomId, id);
      if (!result.ok) return setError(result.error);
      if (result.data) setNotice(result.data);
      setRoomId("");
      router.refresh();
    });
  };

  return (
    <div className="space-y-1">
      <div className="flex gap-2">
        <select
          aria-label="Room"
          className={`${inputClass} py-1.5`}
          value={roomId}
          onChange={(e) => setRoomId(e.target.value)}
        >
          <option value="">Choose a room…</option>
          {fits.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label} · {r.free} free
            </option>
          ))}
        </select>
        <button type="button" disabled={!roomId || pending} onClick={assign} className={`${buttonClass} py-1.5`}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          Assign
        </button>
      </div>
      <ErrorText>{error}</ErrorText>
    </div>
  );
}

/** Two clicks, like cancelling a registration. The person keeps their roommate group. */
export function RemoveFromRoom({ registrationId, name }: { registrationId: string; name: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const click = () => {
    if (!confirming) return setConfirming(true);
    setConfirming(false);
    startTransition(async () => {
      const result = await unassignAction(registrationId);
      if (!result.ok) return setError(result.error);
      router.refresh();
    });
  };

  return (
    <span className="inline-flex flex-col items-end">
      <button
        type="button"
        disabled={pending}
        onClick={click}
        onBlur={() => setConfirming(false)}
        aria-label={`Remove ${name} from the room`}
        className={
          confirming
            ? "rounded-md bg-red-600 px-2 py-1 text-xs font-medium text-white"
            : "rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-900"
        }
      >
        {confirming ? "Remove?" : "Remove"}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}

/** Two clicks: each press costs one SMS per person. Shows what was sent and what's left. */
export function SendRoomSms({ campId, pending }: { campId: string; pending: number }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const [busy, startTransition] = useTransition();

  const click = () => {
    if (!confirming) return setConfirming(true);
    setConfirming(false);
    setError("");
    setResult("");
    startTransition(async () => {
      const r = await sendRoomSmsAction(campId);
      if (!r.ok) return setError(r.error);
      const { sent, failedRooms, remaining } = r.data;
      setResult(
        `Texted ${sent} ${sent === 1 ? "person" : "people"}.` +
          (failedRooms ? ` ${failedRooms} room(s) failed; press again to retry.` : "") +
          (remaining ? ` ${remaining} still to text: press again.` : ""),
      );
      router.refresh();
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 text-sm">
      <span className="flex-1 text-slate-600">
        {pending
          ? `${pending} placed ${pending === 1 ? "person hasn't" : "people haven't"} been texted their room yet.`
          : "Everyone placed has been texted their room."}
      </span>
      {pending > 0 && (
        <button
          type="button"
          disabled={busy}
          onClick={click}
          onBlur={() => setConfirming(false)}
          className={confirming ? "rounded-lg bg-red-600 px-3 py-1.5 font-medium text-white" : `${buttonClass} py-1.5`}
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {confirming ? `Send ${Math.min(pending, 250)} texts?` : "Text everyone their room"}
        </button>
      )}
      {result && <p className="w-full text-emerald-700">{result}</p>}
      <ErrorText>{error}</ErrorText>
    </div>
  );
}
