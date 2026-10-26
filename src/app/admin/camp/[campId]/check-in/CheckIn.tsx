"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera, Check, CircleAlert, HeartPulse, ScanLine, Search, Shirt } from "lucide-react";
import type { Arrival, ScanCounts, ScanMode } from "@/lib/camp/checkin";
import { formatCedis } from "@/lib/camp/money";
import { useToast } from "@/components/camp/toast";
import { RegistrationStatus, StackedBar, headlineClass, inputClass, primaryButtonClass } from "@/components/camp/ui";
import { cn } from "@/lib/utils";
import { findArrivalsAction, scanAction, undoScanAction } from "../../actions";

type Result = { person: Arrival; already: boolean; mode: ScanMode } | { error: string };

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
  token,
  initialMode,
  leader,
}: {
  campId: string;
  counts: ScanCounts;
  recent: Record<ScanMode, Arrival[]>;
  token: string | null;
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
  const [found, setFound] = useState<Arrival[]>([]);
  const [pending, start] = useTransition();
  const video = useRef<HTMLVideoElement>(null);
  const busy = useRef(false);
  const w = WORDS[mode];

  const pick = (m: ScanMode) => {
    setChosen(m);
    setResult(null);
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch {}
  };

  const scan = useCallback(
    (value: string, m: ScanMode) =>
      start(async () => {
        const r = await scanAction(campId, value, m);
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
    [campId, router],
  );

  // Opened from a phone camera scanning a pass: do this phone's job straight away.
  useEffect(() => {
    if (token) {
      scan(token, initialMode ?? savedMode());
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, [token, scan, initialMode]);

  // The counts keep themselves current while the page is open.
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), 20_000);
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
      const r = await findArrivalsAction(campId, term);
      if (r.ok) setFound(r.data);
    }, 200);
    return () => clearTimeout(timer);
  }, [term, campId]);

  const undo = (person: Arrival, m: ScanMode) =>
    start(async () => {
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
          onUndo={(p, m) => undo(p, m)}
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

function ResultCard({ result, leader, onUndo, onNext, pending }: { result: Result; leader: boolean; onUndo: (p: Arrival, m: ScanMode) => void; onNext: () => void; pending: boolean }) {
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
