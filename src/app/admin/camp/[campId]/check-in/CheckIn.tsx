"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera, Check, CircleAlert, CloudOff, HeartPulse, ScanLine, Search, Shirt, X } from "lucide-react";
import type { Arrival, RosterPerson, ScanCounts, ScanMode } from "@/lib/camp/checkin";
import { Busy } from "@/components/camp/brand";
import { shirtRefusal } from "@/lib/camp/shirts";
import { formatCedis } from "@/lib/camp/money";
import { useToast } from "@/components/camp/toast";
import { RegistrationStatus, StackedBar, headlineClass, inputClass, primaryButtonClass } from "@/components/camp/ui";
import { cn } from "@/lib/utils";
import { findArrivalsAction, scanAction, undoScanAction } from "../../actions";
import { idOf, useOfflineScans, type Problem } from "./offline";

type Result =
  | { person: Arrival; already: boolean; mode: ScanMode }
  // Kept on the phone with no signal. `person` is from the phone's copy of the list, if it knows them.
  | { kept: true; person: RosterPerson | null; already: boolean; key: string | null; mode: ScanMode }
  | { error: string };
type Found = Pick<Arrival, "id" | "full_name" | "fellowship" | "room_label" | "shirt_size" | "checked_in_at" | "shirt_given_at">;

// BarcodeDetector is in Chrome on Android; elsewhere the phone's camera app opens the pass link instead.
type Detector = { detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]> };
const getDetector = (): Detector | null => {
  const D = (globalThis as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
  return D ? new D({ formats: ["qr_code"] }) : null;
};

/** The token in a pass link (…/check-in?t=TOKEN), or the raw text. */
const tokenOf = (text: string) => {
  try {
    return new URL(text).searchParams.get("t") ?? text;
  } catch {
    return text;
  }
};

// The mode stays as it was on this phone, so a pass opened by the camera app does the same job.
const MODE_KEY = "commune.scanMode";
const savedMode = (): ScanMode => {
  try {
    return localStorage.getItem(MODE_KEY) === "shirt" ? "shirt" : "checkin";
  } catch {
    return "checkin";
  }
};

const WORDS = {
  checkin: { title: "Check-in", done: "Checked in", already: "Already checked in", undo: "is no longer checked in", list: "Just arrived", scan: "Scan a pass" },
  shirt: { title: "T-shirts", done: "T-shirt given", already: "Already has a T-shirt", undo: "T-shirt taken back", list: "Just collected", scan: "Scan for a T-shirt" },
} as const;

export function CheckIn({
  campId,
  counts: initial,
  recent,
  initialMode,
  leader,
  shirtPaidOnly,
}: {
  campId: string;
  /** T-shirts only for people who've paid in full (the camp's setting). */
  shirtPaidOnly: boolean;
  counts: ScanCounts;
  recent: Record<ScanMode, Arrival[]>;
  initialMode: ScanMode | null;
  leader: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const stored = useSyncExternalStore(() => () => {}, savedMode, () => "checkin" as ScanMode);
  const [chosen, setChosen] = useState<ScanMode | null>(initialMode);
  const mode = chosen ?? stored;
  const [counts, setCounts] = useState(initial);
  // Fresh counts from the server (every 20 s) replace the local ones.
  const [seen, setSeen] = useState(initial);
  if (seen !== initial) {
    setSeen(initial);
    setCounts(initial);
  }
  const [result, setResult] = useState<Result | null>(null);
  const [scanning, setScanning] = useState(false);
  const canScan = useSyncExternalStore(
    () => () => {},
    () => !!getDetector() && !!navigator.mediaDevices?.getUserMedia,
    () => false,
  );
  const [term, setTerm] = useState("");
  const [found, setFound] = useState<Found[]>([]);
  const [pending, start] = useTransition();
  const video = useRef<HTMLVideoElement>(null);
  const busy = useRef(false);
  const w = WORDS[mode];
  const bump = (m: ScanMode, by: number) => setCounts((c) => (m === "checkin" ? { ...c, here: Math.max(0, c.here + by) } : { ...c, shirts: Math.max(0, c.shirts + by) }));
  const offline = useOfflineScans(campId, (fresh, results) => {
    setCounts(fresh);
    const failed = results.filter((r) => r.error).length;
    const sent = results.length - failed;
    if (sent) toast(`Sent ${sent} ${sent === 1 ? "scan" : "scans"} kept on this phone`);
    if (failed) toast(`${failed} couldn't be saved. See the list above.`, { tone: "error" });
    router.refresh();
  });
  const { keep } = offline;

  const pick = (m: ScanMode) => {
    setChosen(m);
    setResult(null);
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch {}
  };

  // No signal: the scan stays on the phone and goes up later.
  const keepScan = useCallback(
    (value: string, m: ScanMode) => {
      if (!idOf(value)) {
        setResult({ error: "That QR isn't a Commune pass." });
        navigator.vibrate?.([80, 60, 80]);
        return;
      }
      const k = keep(value, m);
      if (k.person?.status === "cancelled") {
        if (k.key) offline.drop(k.key);
        setResult({ error: `${k.person.full_name}'s registration is cancelled.` });
        return;
      }
      if (k.person && m === "shirt" && shirtPaidOnly && !k.already && k.person.status !== "fully_paid") {
        if (k.key) offline.drop(k.key);
        setResult({ error: shirtRefusal(k.person.full_name, k.person.price_pesewas - k.person.paid_pesewas) });
        navigator.vibrate?.([80, 60, 80]);
        return;
      }
      setResult({ kept: true, person: k.person, already: k.already, key: k.key, mode: m });
      if (!k.already) bump(m, 1);
      navigator.vibrate?.(k.already ? [40, 60, 40] : 60);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [keep],
  );

  const scan = useCallback(
    (value: string, m: ScanMode) =>
      start(async () => {
        if (!navigator.onLine) return keepScan(value, m);
        let r;
        try {
          r = await scanAction(campId, value, m);
        } catch {
          // The request never got through.
          return keepScan(value, m);
        }
        if (!r.ok) {
          setResult({ error: r.error });
          navigator.vibrate?.([80, 60, 80]);
          return;
        }
        setResult({ person: r.data.person, already: r.data.already, mode: m });
        setCounts(r.data.counts);
        navigator.vibrate?.(r.data.already ? [40, 60, 40] : 60);
        router.refresh();
      }),
    [campId, router, keepScan],
  );

  // Opened from a phone camera scanning a pass: do this phone's job straight away. Read from the
  // address itself, since with no signal this page can be the phone's saved copy.
  const opened = useRef(false);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const t = q.get("t");
    if (!t || opened.current) return;
    opened.current = true;
    scan(t, q.get("mode") === "shirt" ? "shirt" : (initialMode ?? savedMode()));
    window.history.replaceState(null, "", window.location.pathname);
  }, [scan, initialMode]);

  // The counts keep themselves current while the page is open (and there's signal).
  useEffect(() => {
    const timer = setInterval(() => navigator.onLine && router.refresh(), 20_000);
    return () => clearInterval(timer);
  }, [router]);

  useEffect(() => {
    if (!scanning) return;
    const detector = getDetector();
    let stream: MediaStream | null = null;
    let frame = 0;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (!video.current) return;
        video.current.srcObject = stream;
        await video.current.play();
        const tick = async () => {
          if (video.current && detector && !busy.current) {
            const codes = await detector.detect(video.current).catch(() => []);
            if (codes[0]) {
              busy.current = true;
              setScanning(false);
              scan(tokenOf(codes[0].rawValue), mode);
              return;
            }
          }
          frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      } catch {
        setScanning(false);
        toast("The camera didn't open. Allow it in your browser settings.", { tone: "error" });
      }
    })();
    return () => {
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((t) => t.stop());
      busy.current = false;
    };
  }, [scanning, scan, toast, mode]);

  useEffect(() => {
    if (term.trim().length < 2) return;
    const timer = setTimeout(async () => {
      if (!navigator.onLine) return setFound(offline.find(term));
      const r = await findArrivalsAction(campId, term).catch(() => null);
      setFound(r?.ok ? r.data : offline.find(term));
    }, 200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term, campId, offline.find]);

  const undo = (person: Pick<Arrival, "id" | "full_name">, m: ScanMode, key?: string | null) =>
    start(async () => {
      // Not sent yet: it's just taken off the phone.
      if (key && offline.drop(key)) {
        bump(m, -1);
        setResult(null);
        toast(`${person.full_name.split(" ")[0]}: ${WORDS[m].undo}`);
        return;
      }
      const r = await undoScanAction(campId, person.id, m);
      if (!r.ok) return toast(r.error, { tone: "error" });
      setCounts(r.data);
      setResult(null);
      toast(`${person.full_name.split(" ")[0]}: ${WORDS[m].undo}`);
      router.refresh();
    });

  const done = mode === "checkin" ? counts.here : counts.shirts;
  const list = recent[mode];

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <h1 className={`${headlineClass} text-[34px]`}>{w.title}</h1>
        <div role="tablist" aria-label="What you're doing" className="flex gap-1 rounded-full border border-stone-border bg-white p-[3px]">
          {(["checkin", "shirt"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => pick(m)}
              className={cn("cm-press flex h-9 items-center gap-1.5 rounded-full px-4 text-sm font-medium", mode === m ? "bg-soot text-white" : "")}
            >
              {m === "checkin" ? <ScanLine className="h-4 w-4" strokeWidth={1.7} aria-hidden="true" /> : <Shirt className="h-4 w-4" strokeWidth={1.7} aria-hidden="true" />}
              {m === "checkin" ? "Check-in" : "T-shirts"}
            </button>
          ))}
        </div>
      </header>

      <OfflineStrip online={offline.online} waiting={offline.queue.length} sending={offline.sending} problems={offline.problems} onClear={offline.clearProblems} />

      <section className="flex flex-col gap-3 rounded-2xl bg-white p-5 shadow-seline-hero" aria-live="polite">
        <span className="flex items-baseline gap-2.5">
          <span className="font-display text-[44px] leading-none tracking-[-0.03em] tabular-nums">{done}</span>
          <span className="text-[15px] text-warm-gray">
            of {counts.expected} {mode === "checkin" ? "here" : "given"}
          </span>
        </span>
        <StackedBar
          parts={[
            { key: "done", value: done, color: "bg-st-paid", label: mode === "checkin" ? "Here" : "Given" },
            { key: "not", value: Math.max(0, counts.expected - done), color: "bg-stone-border", label: "Not yet" },
          ]}
        />
        {mode === "shirt" && counts.sizes.length > 0 && (
          <ul className="flex flex-wrap gap-x-4 gap-y-1.5 border-t border-stone-border pt-3 text-[13px] tabular-nums">
            {counts.sizes.map((s) => (
              <li key={s.size || "none"} className="flex items-center gap-1.5">
                <strong className="font-semibold">{s.size || "No size"}</strong>
                <span className="text-warm-gray">
                  {s.given}/{s.total}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {result && (
        <ResultCard
          result={result}
          leader={leader}
          pending={pending}
          onUndo={(p, m, key) => undo(p, m, key)}
          onNext={() => {
            setResult(null);
            if (canScan) setScanning(true);
          }}
        />
      )}

      {scanning ? (
        <div className="relative overflow-hidden rounded-2xl bg-ink-black">
          <video ref={video} playsInline muted className="aspect-[3/4] w-full object-cover sm:aspect-video" />
          <span aria-hidden="true" className="absolute inset-[18%] rounded-2xl border-2 border-white/80">
            <span className="cm-scanline absolute inset-x-3 top-3 h-0.5 bg-cyan-signal shadow-[0_0_12px_#3ba6f1] [--scan:180px]" />
          </span>
          <button type="button" onClick={() => setScanning(false)} className="cm-press absolute bottom-4 left-1/2 h-11 -translate-x-1/2 rounded-full bg-white px-5 text-sm font-medium">
            Stop
          </button>
        </div>
      ) : (
        !result &&
        (canScan ? (
          <button type="button" onClick={() => setScanning(true)} className={`${primaryButtonClass} h-14 w-full text-base`}>
            {mode === "checkin" ? <ScanLine className="h-5 w-5" strokeWidth={1.7} aria-hidden="true" /> : <Shirt className="h-5 w-5" strokeWidth={1.7} aria-hidden="true" />}
            {w.scan}
          </button>
        ) : (
          <p className="flex items-start gap-2.5 rounded-[10px] border border-stone-border bg-white p-4 text-sm">
            <Camera className="mt-0.5 h-4 w-4 flex-none" strokeWidth={1.6} aria-hidden="true" />
            Scan the pass with your phone&apos;s camera. It opens here and {mode === "checkin" ? "checks them in" : "marks their T-shirt given"}.
          </p>
        ))
      )}

      <section className="flex flex-col gap-2">
        <label className="relative flex">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-warm-gray" strokeWidth={1.6} aria-hidden="true" />
          <input type="search" value={term} onChange={(e) => setTerm(e.target.value)} placeholder="No pass? Type their name" aria-label="Find someone by name" className={`${inputClass} pl-10`} />
        </label>
        {term.trim().length >= 2 && found.length > 0 && (
          <ul className="overflow-hidden rounded-[10px] border border-stone-border bg-white">
            {found.map((p) => {
              const already = mode === "checkin" ? p.checked_in_at : p.shirt_given_at;
              return (
                <li key={p.id} className="flex min-h-14 items-center gap-3 border-t border-stone-border px-4 first:border-t-0">
                  <span className="flex flex-1 flex-col">
                    <span className="text-[15px] font-medium">{p.full_name}</span>
                    <span className="text-xs text-warm-gray">
                      {p.fellowship}
                      {mode === "shirt" ? ` · ${p.shirt_size || "no size"}` : p.room_label ? ` · ${p.room_label}` : ""}
                    </span>
                  </span>
                  {already ? (
                    <span className="flex items-center gap-1 text-[13px]">
                      <Check className="h-4 w-4 text-st-paid" strokeWidth={2.4} aria-hidden="true" /> {mode === "checkin" ? "Here" : "Has it"}
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => {
                        setTerm("");
                        setFound([]);
                        scan(p.id, mode);
                      }}
                      className="cm-press h-10 rounded-full bg-soot px-4 text-sm font-medium text-white"
                    >
                      {mode === "checkin" ? "Check in" : "Give T-shirt"}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {list.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold">{w.list}</h2>
          <ul className="overflow-hidden rounded-[10px] border border-stone-border bg-white">
            {list.map((p) => {
              const at = mode === "checkin" ? p.checked_in_at : p.shirt_given_at;
              return (
                <li key={p.id} className="flex min-h-12 items-center gap-3 border-t border-stone-border px-4 text-sm first:border-t-0">
                  <span className="h-2 w-2 flex-none rounded-full bg-st-paid" aria-hidden="true" />
                  <span className="flex-1">{p.full_name}</span>
                  <span className="text-warm-gray">{mode === "checkin" ? (p.room_label ?? "No room") : p.shirt_size || "No size"}</span>
                  <span className="w-12 text-right text-xs tabular-nums text-warm-gray">
                    {at && new Date(at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Accra" })}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

/** No signal, scans waiting to go up, or scans the server turned down. Nothing shows when all is well. */
function OfflineStrip({ online, waiting, sending, problems, onClear }: { online: boolean; waiting: number; sending: boolean; problems: Problem[]; onClear: () => void }) {
  if (online && !waiting && !problems.length) return null;
  const scans = (n: number) => `${n} ${n === 1 ? "scan" : "scans"}`;
  return (
    <div className="flex flex-col gap-2" aria-live="polite">
      {(!online || waiting > 0) && (
        <p className={cn("flex min-h-12 items-center gap-2.5 rounded-[12px] px-4 py-2.5 text-sm", online ? "bg-white shadow-seline-card" : "bg-soot text-white")}>
          {online ? (
            <Busy pending={sending} text={`Sending ${scans(waiting)}…`}>
              {`${scans(waiting)} waiting to send`}
            </Busy>
          ) : (
            <>
              <CloudOff className="h-[18px] w-[18px] flex-none" strokeWidth={1.7} aria-hidden="true" />
              <span className="flex-1">
                <strong className="font-semibold">No signal.</strong> Keep scanning: scans stay on this phone and send when signal is back.
              </span>
              {waiting > 0 && <span className="tabular-nums text-stone-muted">{waiting} kept</span>}
            </>
          )}
        </p>
      )}
      {problems.length > 0 && (
        <section role="alert" className="flex flex-col gap-2 rounded-[12px] border-2 border-soot bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[15px] font-semibold">{problems.length === 1 ? "1 scan wasn't saved" : `${problems.length} scans weren't saved`}</h2>
            <button type="button" onClick={onClear} aria-label="Dismiss" className="flex h-9 w-9 items-center justify-center rounded-full text-warm-gray">
              <X className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
            </button>
          </div>
          <ul className="flex flex-col text-sm">
            {problems.map((p) => (
              <li key={p.key} className="border-t border-stone-border py-2 first:border-t-0">
                <span className="font-medium">{p.name ?? "A pass"}</span>
                <span className="text-warm-gray"> · {p.mode === "shirt" ? "T-shirt" : "check-in"} · {p.error}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function ResultCard({
  result,
  leader,
  onUndo,
  onNext,
  pending,
}: {
  result: Result;
  leader: boolean;
  onUndo: (p: Pick<Arrival, "id" | "full_name">, m: ScanMode, key?: string | null) => void;
  onNext: () => void;
  pending: boolean;
}) {
  if ("kept" in result) {
    const p = result.person;
    const w = WORDS[result.mode];
    return (
      <section role="status" className="cm-pop flex flex-col gap-4 rounded-2xl bg-white p-5 shadow-seline-hero">
        <div className="flex items-center gap-3.5">
          <span className={cn("flex h-[52px] w-[52px] flex-none items-center justify-center rounded-full", result.already ? "bg-soot" : "bg-st-paid")}>
            <CloudOff className="h-6 w-6 text-white" strokeWidth={1.8} aria-hidden="true" />
          </span>
          <span className="flex flex-col gap-0.5">
            <span className="font-display text-[24px] leading-tight tracking-[-0.017em]">{p?.full_name ?? "Pass kept"}</span>
            <span className="text-sm">{result.already ? w.already : p ? `${w.done}. Sends when there's signal.` : "Not on this phone's list yet. It's checked when there's signal."}</span>
          </span>
        </div>
        {p &&
          (result.mode === "shirt" ? (
            <div className="flex items-center justify-between rounded-[12px] bg-stone-canvas px-4 py-3">
              <span className="text-sm text-warm-gray">Size</span>
              <span className="font-display text-[40px] leading-none">{p.shirt_size || "Not given"}</span>
            </div>
          ) : (
            <dl className="grid grid-cols-2 gap-2.5 text-sm">
              <div className="rounded-[10px] bg-stone-canvas p-3">
                <dt className="text-xs text-warm-gray">Room</dt>
                <dd className="font-display text-[22px]">{p.room_label ?? "None yet"}</dd>
              </div>
              <div className="rounded-[10px] bg-stone-canvas p-3">
                <dt className="text-xs text-warm-gray">Fellowship</dt>
                <dd className="leading-snug">{p.fellowship}</dd>
              </div>
            </dl>
          ))}
        <div className="flex gap-2">
          {!result.already && result.key && (
            <button
              type="button"
              disabled={pending}
              onClick={() => onUndo({ id: p?.id ?? "", full_name: p?.full_name ?? "Pass" }, result.mode, result.key)}
              className="cm-press h-12 rounded-full border border-stone-border bg-white px-5 text-sm font-medium"
            >
              Undo
            </button>
          )}
          <button type="button" onClick={onNext} className={`${primaryButtonClass} h-12 flex-1`}>
            <ScanLine className="h-5 w-5" strokeWidth={1.7} aria-hidden="true" /> Next person
          </button>
        </div>
      </section>
    );
  }
  if ("error" in result) {
    return (
      <section role="alert" className="cm-pop flex flex-col gap-4 rounded-2xl border-2 border-soot bg-white p-5">
        <p className="flex items-center gap-3 text-[17px] font-semibold">
          <CircleAlert className="h-6 w-6 flex-none" strokeWidth={1.8} aria-hidden="true" /> {result.error}
        </p>
        <button type="button" onClick={onNext} className={`${primaryButtonClass} h-12`}>
          Try again
        </button>
      </section>
    );
  }
  const p = result.person;
  const owing = p.price_pesewas - p.paid_pesewas;
  const w = WORDS[result.mode];
  return (
    <section role="status" className="cm-pop flex flex-col gap-4 rounded-2xl bg-white p-5 shadow-seline-hero">
      <div className="flex items-center gap-3.5">
        <span className={cn("flex h-[52px] w-[52px] flex-none items-center justify-center rounded-full", result.already ? "bg-soot" : "bg-st-paid")}>
          <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true">
            <path className="cm-tick" pathLength={1} d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" style={{ animationDelay: "80ms" }} />
          </svg>
        </span>
        <span className="flex flex-col gap-0.5">
          <span className="font-display text-[24px] leading-tight tracking-[-0.017em]">{p.full_name}</span>
          <span className="text-sm">{result.already ? w.already : w.done}</span>
        </span>
      </div>
      {result.mode === "shirt" ? (
        <div className="flex items-center justify-between rounded-[12px] bg-stone-canvas px-4 py-3">
          <span className="text-sm text-warm-gray">Size</span>
          <span className="font-display text-[40px] leading-none">{p.shirt_size || "Not given"}</span>
        </div>
      ) : (
        <dl className="grid grid-cols-2 gap-2.5 text-sm">
          <div className="rounded-[10px] bg-stone-canvas p-3">
            <dt className="text-xs text-warm-gray">Room</dt>
            <dd className="font-display text-[22px]">{p.room_label ?? "None yet"}</dd>
          </div>
          <div className="rounded-[10px] bg-stone-canvas p-3">
            <dt className="text-xs text-warm-gray">{leader ? "Fellowship" : "With"}</dt>
            <dd className="leading-snug">{leader ? p.fellowship : (p.roommates ?? "—")}</dd>
          </div>
        </dl>
      )}
      <p className="flex flex-wrap items-center gap-2 text-sm">
        <RegistrationStatus status={p.status} />
        {owing > 0 && p.status !== "cancelled" && <strong className="font-semibold">· {formatCedis(owing)} outstanding</strong>}
      </p>
      {!leader && p.health_notes && result.mode === "checkin" && (
        <p className="flex items-start gap-2 text-sm">
          <HeartPulse className="mt-0.5 h-4 w-4 flex-none" strokeWidth={1.6} aria-hidden="true" /> {p.health_notes}
        </p>
      )}
      <div className="flex gap-2">
        {!result.already && (
          <button type="button" disabled={pending} onClick={() => onUndo(p, result.mode)} className="cm-press h-12 rounded-full border border-stone-border bg-white px-5 text-sm font-medium">
            Undo
          </button>
        )}
        <button type="button" onClick={onNext} className={`${primaryButtonClass} h-12 flex-1`}>
          <ScanLine className="h-5 w-5" strokeWidth={1.7} aria-hidden="true" /> Next person
        </button>
      </div>
    </section>
  );
}
