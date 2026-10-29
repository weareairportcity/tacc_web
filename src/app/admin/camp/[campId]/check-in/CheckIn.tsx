"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera, Check, ChevronRight, CircleAlert, CloudOff, Flashlight, HeartPulse, ScanLine, Search, Shirt, X } from "lucide-react";
import type { Arrival, RosterPerson, ScanCounts, ScanMode } from "@/lib/camp/checkin";
import { Busy } from "@/components/camp/brand";
import { shirtRefusal } from "@/lib/camp/shirts";
import { formatCedis } from "@/lib/camp/money";
import { useToast } from "@/components/camp/toast";
import { PersonCardSheet } from "@/components/camp/PersonCard";
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

// Reading a QR from the camera, in the page, on every phone: the browser's own
// BarcodeDetector where there is one (Chrome on Android), jsQR otherwise (iPhone,
// Samsung Internet, Firefox), loaded only when the camera opens.
type Detector = { detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]> };
const getDetector = (): Detector | null => {
  const D = (globalThis as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
  return D ? new D({ formats: ["qr_code"] }) : null;
};

async function qrReader(): Promise<(video: HTMLVideoElement) => Promise<string | null>> {
  const native = getDetector();
  if (native) return async (video) => (await native.detect(video).catch(() => []))[0]?.rawValue ?? null;
  const { default: jsQR } = await import("jsqr");
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  return async (video) => {
    if (!video.videoWidth) return null;
    // A smaller copy of the frame reads just as well, and fast enough for every frame.
    const scale = Math.min(1, 640 / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return jsQR(frame.data, frame.width, frame.height, { inversionAttempts: "dontInvert" })?.data ?? null;
  };
}

/** The token in a pass link (…/check-in?t=TOKEN), or the raw text. */
const tokenOf = (text: string) => {
  try {
    return new URL(text).searchParams.get("t") ?? text;
  } catch {
    return text;
  }
};

// The camera runs only while this tab is on screen: switching tabs or locking the phone stops it.
const subscribeVisible = (cb: () => void) => {
  document.addEventListener("visibilitychange", cb);
  return () => document.removeEventListener("visibilitychange", cb);
};
// Phones and tablets open the camera straight away; a laptop asks first.
const subscribePointer = (cb: () => void) => {
  const q = window.matchMedia("(pointer: coarse)");
  q.addEventListener("change", cb);
  return () => q.removeEventListener("change", cb);
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
  lists,
  initialMode,
  leader,
  shirtPaidOnly,
}: {
  campId: string;
  /** T-shirts only for people who've paid in full (the camp's setting). */
  shirtPaidOnly: boolean;
  counts: ScanCounts;
  lists: Record<ScanMode, { here: Arrival[]; notYet: Arrival[] }>;
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
  const canScan = useSyncExternalStore(
    () => () => {},
    () => !!navigator.mediaDevices?.getUserMedia,
    () => false,
  );
  const phone = useSyncExternalStore(subscribePointer, () => window.matchMedia("(pointer: coarse)").matches, () => false);
  const visible = useSyncExternalStore(subscribeVisible, () => document.visibilityState === "visible", () => true);
  // On a laptop the camera opens when asked; after that, as on a phone, it stays open until they leave.
  const [askedForCamera, setAskedForCamera] = useState(false);
  const [cameraError, setCameraError] = useState(false);
  const cameraOn = canScan && (phone || askedForCamera) && !cameraError;
  const [torch, setTorch] = useState<{ on: boolean; set: (on: boolean) => void } | null>(null);
  const search = useRef<HTMLInputElement>(null);
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
    busy.current = false;
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

  // While a result shows, the camera keeps running but nothing is read until "Scan the next person".
  const paused = useRef(false);
  // The camera loop reads the latest scan and mode from here, so it starts and stops only with the camera.
  const latest = useRef({ scan, mode });
  useEffect(() => {
    paused.current = result !== null || pending;
    latest.current = { scan, mode };
  });

  useEffect(() => {
    if (!cameraOn || !visible) return;
    let stream: MediaStream | null = null;
    let frame = 0;
    let stopped = false;
    (async () => {
      try {
        const [media, read] = await Promise.all([navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } }), qrReader()]);
        stream = media;
        if (stopped || !video.current) return media.getTracks().forEach((t) => t.stop());
        video.current.srcObject = stream;
        await video.current.play();
        const track = media.getVideoTracks()[0];
        if ((track?.getCapabilities?.() as { torch?: boolean } | undefined)?.torch) {
          const set = (on: boolean) => {
            track.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] }).catch(() => null);
            setTorch({ on, set });
          };
          setTorch({ on: false, set });
        }
        const tick = async () => {
          if (stopped) return;
          if (video.current && !busy.current && !paused.current) {
            const text = await read(video.current).catch(() => null);
            if (text && !stopped && !paused.current) {
              busy.current = true;
              latest.current.scan(tokenOf(text), latest.current.mode);
            }
          }
          frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      } catch {
        if (stopped) return;
        setCameraError(true);
        toast("The camera didn't open. Allow it in your browser settings, then tap Try again.", { tone: "error" });
      }
    })();
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((t) => t.stop());
      setTorch((t) => (t ? null : t));
    };
  }, [cameraOn, visible, toast]);

  const next = () => {
    busy.current = false;
    setResult(null);
  };

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
  const [tab, setTab] = useState<"here" | "notYet">("here");
  const [personId, setOpenedPerson] = useState<string | null>(null);

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

      {cameraOn ? (
        <section aria-label="Scanner" className="relative h-[max(380px,min(calc(100dvh-300px),620px))] overflow-hidden rounded-2xl bg-ink-black text-white">
          <video ref={video} playsInline muted className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-x-0 top-0 bg-gradient-to-b from-black/60 to-transparent px-5 pt-4 pb-8">
            <div className="flex items-center justify-between gap-3">
              <span className="flex flex-col gap-0.5" aria-live="polite">
                <span className="text-[13px] text-stone-muted">{w.title}</span>
                <span className="font-display text-[26px] leading-tight tracking-[-0.02em]">
                  <span className="tabular-nums">{done}</span> of {counts.expected} {mode === "checkin" ? "here" : "given"}
                </span>
              </span>
              {torch && (
                <button
                  type="button"
                  aria-label={torch.on ? "Torch off" : "Torch on"}
                  aria-pressed={torch.on}
                  onClick={() => torch.set(!torch.on)}
                  className={cn("cm-press flex h-11 w-11 items-center justify-center rounded-full border", torch.on ? "border-white bg-white text-ink-black" : "border-white/30 bg-black/30")}
                >
                  <Flashlight className="h-5 w-5" strokeWidth={1.7} aria-hidden="true" />
                </button>
              )}
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/20" aria-hidden="true">
              <span className="block h-full rounded-full bg-st-paid transition-[width] duration-500" style={{ width: `${counts.expected ? Math.round((done / counts.expected) * 100) : 0}%` }} />
            </div>
          </div>
          {!result && (
            <>
              <span aria-hidden="true" className="absolute top-1/2 left-1/2 h-60 w-60 -translate-x-1/2 -translate-y-[60%]">
                <span className="absolute top-0 left-0 h-10 w-10 rounded-tl-[14px] border-t-[3px] border-l-[3px] border-white" />
                <span className="absolute top-0 right-0 h-10 w-10 rounded-tr-[14px] border-t-[3px] border-r-[3px] border-white" />
                <span className="absolute bottom-0 left-0 h-10 w-10 rounded-bl-[14px] border-b-[3px] border-l-[3px] border-white" />
                <span className="absolute right-0 bottom-0 h-10 w-10 rounded-br-[14px] border-r-[3px] border-b-[3px] border-white" />
                <span className="cm-scanline absolute inset-x-3 top-3 h-0.5 bg-cyan-signal shadow-[0_0_12px_#3ba6f1] [--scan:214px]" />
              </span>
              <p className="absolute inset-x-0 bottom-6 text-center text-sm text-stone-200">
                <Busy pending={pending} text="Checking…">
                  {mode === "checkin" ? "Scan their QR" : "Scan their QR for a T-shirt"}
                </Busy>
              </p>
            </>
          )}
          {result && (
            <div className="cm-up absolute inset-x-0 bottom-0 max-h-[85%] overflow-y-auto text-ink-black">
              <ResultCard result={result} leader={leader} pending={pending} sheet onUndo={(p, m, key) => undo(p, m, key)} onNext={next} onFind={() => { next(); search.current?.focus(); }} />
            </div>
          )}
        </section>
      ) : (
        <>
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
          {result && <ResultCard result={result} leader={leader} pending={pending} onUndo={(p, m, key) => undo(p, m, key)} onNext={next} />}
          {canScan ? (
            !result && (
              <button
                type="button"
                onClick={() => {
                  setCameraError(false);
                  setAskedForCamera(true);
                }}
                className={`${primaryButtonClass} h-14 w-full text-base`}
              >
                <Camera className="h-5 w-5" strokeWidth={1.7} aria-hidden="true" />
                {cameraError ? "Try the camera again" : "Scan with this device"}
              </button>
            )
          ) : (
            <p className="flex items-start gap-2.5 rounded-[10px] border border-stone-border bg-white p-4 text-sm">
              <Camera className="mt-0.5 h-4 w-4 flex-none" strokeWidth={1.6} aria-hidden="true" />
              Scan the pass with your phone&apos;s camera. It opens here and {mode === "checkin" ? "checks them in" : "marks their T-shirt given"}.
            </p>
          )}
        </>
      )}

      {mode === "shirt" && counts.sizes.length > 0 && cameraOn && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1.5 rounded-[12px] border border-stone-border bg-white px-4 py-3 text-[13px] tabular-nums">
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

      <section className="flex flex-col gap-2">
        <label className="relative flex">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-warm-gray" strokeWidth={1.6} aria-hidden="true" />
          <input ref={search} type="search" value={term} onChange={(e) => setTerm(e.target.value)} placeholder="No pass? Type their name" aria-label="Find someone by name" className={`${inputClass} pl-10`} />
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

      <Arrivals
        mode={mode}
        lists={lists[mode]}
        tab={tab}
        onTab={setTab}
        onOpen={setOpenedPerson}
      />

      <PersonCardSheet
        campId={campId}
        personId={personId}
        onClose={() => setOpenedPerson(null)}
        leader={leader}
        actions={(p) =>
          (mode === "checkin" ? p.checked_in_at : p.shirt_given_at) && (
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setOpenedPerson(null);
                undo(p, mode);
              }}
              className="cm-press inline-flex h-11 items-center rounded-full border border-stone-border bg-white px-5 text-sm font-medium"
            >
              {mode === "checkin" ? "Undo check-in" : "Take T-shirt back"}
            </button>
          )
        }
      />
    </div>
  );
}

const timeOf = (at: string) => new Date(at).toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Africa/Accra" });
const dayOf = (at: string) => new Date(at).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Africa/Accra" });

/** Who's arrived, by day with the time (newest first), and who isn't here yet. Every name opens their details. */
function Arrivals({
  mode,
  lists,
  tab,
  onTab,
  onOpen,
}: {
  mode: ScanMode;
  lists: { here: Arrival[]; notYet: Arrival[] };
  tab: "here" | "notYet";
  onTab: (t: "here" | "notYet") => void;
  onOpen: (id: string) => void;
}) {
  const atOf = (p: Arrival) => (mode === "checkin" ? p.checked_in_at : p.shirt_given_at);
  const days: [string, Arrival[]][] = [];
  for (const p of lists.here) {
    const d = dayOf(atOf(p)!);
    const last = days[days.length - 1];
    if (last && last[0] === d) last[1].push(p);
    else days.push([d, [p]]);
  }
  const words = mode === "checkin" ? { here: "Arrived", not: "Not here yet", n: "arrived" } : { here: "Collected", not: "Not yet", n: "collected" };
  const row = (p: Arrival, right: React.ReactNode) => (
    <li key={p.id} className="border-t border-stone-border first:border-t-0">
      <button type="button" onClick={() => onOpen(p.id)} className="cm-row flex min-h-14 w-full items-center gap-3 px-4 text-left">
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[15px] font-medium">{p.full_name}</span>
          <span className="truncate text-[13px] text-warm-gray">
            {p.fellowship} · {mode === "checkin" ? (p.room_label ?? "No room") : p.shirt_size || "No size"}
          </span>
        </span>
        {right}
        <ChevronRight className="h-4 w-4 flex-none text-ash-gray" strokeWidth={1.8} aria-hidden="true" />
      </button>
    </li>
  );
  return (
    <section className="flex flex-col gap-3">
      <div role="tablist" aria-label="Who" className="grid grid-cols-2 gap-1 rounded-full border border-stone-border bg-white p-[3px]">
        {(["here", "notYet"] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => onTab(t)}
            className={cn("cm-press h-10 rounded-full text-sm font-medium", tab === t && "bg-soot text-white")}
          >
            {t === "here" ? words.here : words.not} ({t === "here" ? lists.here.length : lists.notYet.length})
          </button>
        ))}
      </div>
      {tab === "here" ? (
        days.length === 0 ? (
          <p className="rounded-[12px] border border-stone-border bg-white px-4 py-3.5 text-sm text-warm-gray">Nobody yet. Scan a pass to start.</p>
        ) : (
          days.map(([day, people]) => (
            <div key={day} className="flex flex-col gap-1.5">
              <h3 className="flex items-baseline justify-between px-1 text-sm font-semibold">
                {day}
                <span className="text-[13px] font-normal text-warm-gray">
                  {people.length} {words.n}
                </span>
              </h3>
              <ul className="overflow-hidden rounded-[12px] border border-stone-border bg-white">
                {people.map((p) => row(p, <span className="text-[13px] tabular-nums text-warm-gray">{timeOf(atOf(p)!)}</span>))}
              </ul>
            </div>
          ))
        )
      ) : lists.notYet.length === 0 ? (
        <p className="rounded-[12px] border border-stone-border bg-white px-4 py-3.5 text-sm text-warm-gray">Everyone&apos;s here.</p>
      ) : (
        <ul className="overflow-hidden rounded-[12px] border border-stone-border bg-white">{lists.notYet.map((p) => row(p, null))}</ul>
      )}
    </section>
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

/** `sheet`: slides up over the camera, which stays open behind it. */
function ResultCard({
  result,
  leader,
  onUndo,
  onNext,
  onFind,
  pending,
  sheet = false,
}: {
  result: Result;
  leader: boolean;
  onUndo: (p: Pick<Arrival, "id" | "full_name">, m: ScanMode, key?: string | null) => void;
  onNext: () => void;
  onFind?: () => void;
  pending: boolean;
  sheet?: boolean;
}) {
  const card = sheet ? "flex flex-col gap-4 rounded-t-[20px] bg-white p-5 pb-4 shadow-[0_-12px_40px_rgba(0,0,0,.25)]" : "cm-pop flex flex-col gap-4 rounded-2xl bg-white p-5 shadow-seline-hero";
  const nextLabel = sheet ? "Scan the next person" : "Next person";
  const find = onFind && (
    <button type="button" onClick={onFind} className="min-h-10 self-center text-[13px] text-warm-gray underline decoration-stone-muted underline-offset-[3px]">
      No QR? Find them by name
    </button>
  );
  if ("kept" in result) {
    const p = result.person;
    const w = WORDS[result.mode];
    return (
      <section role="status" className={card}>
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
            <ScanLine className="h-5 w-5" strokeWidth={1.7} aria-hidden="true" /> {nextLabel}
          </button>
        </div>
        {find}
      </section>
    );
  }
  if ("error" in result) {
    return (
      <section role="alert" className={sheet ? `${card} border-t-2 border-soot` : "cm-pop flex flex-col gap-4 rounded-2xl border-2 border-soot bg-white p-5"}>
        <p className="flex items-center gap-3 text-[17px] font-semibold">
          <CircleAlert className="h-6 w-6 flex-none" strokeWidth={1.8} aria-hidden="true" /> {result.error}
        </p>
        <button type="button" onClick={onNext} className={`${primaryButtonClass} h-12`}>
          {sheet ? "Scan again" : "Try again"}
        </button>
        {find}
      </section>
    );
  }
  const p = result.person;
  const owing = p.price_pesewas - p.paid_pesewas;
  const w = WORDS[result.mode];
  return (
    <section role="status" className={card}>
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
          <ScanLine className="h-5 w-5" strokeWidth={1.7} aria-hidden="true" /> {nextLabel}
        </button>
      </div>
      {find}
    </section>
  );
}
