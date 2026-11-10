"use client";

import { useRef, useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { addReports, CHECK_CHUNK, emptyReport, type Reconciliation } from "@/lib/camp/reconciliation-shared";
import { titleClass } from "@/components/camp/ui";
import { checkWithExpressPayAction, paymentsToCheckAction } from "../../actions";

type State =
  | { phase: "idle" }
  | { phase: "running"; done: number; total: number }
  | { phase: "done"; report: Reconciliation; at: string }
  | { phase: "error"; message: string; report?: Reconciliation; done?: number; total?: number };

const time = () => new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Accra" });

/**
 * "Check all with expressPay": asks expressPay about every camp payment from
 * the last 30 days, a chunk at a time, with a live count so a long check
 * never looks stuck. Read-only. Runs only when a coordinator asks, because
 * every payment is one call to expressPay.
 */
export function ExpressPayCheck({ campId }: { campId: string }) {
  const [state, setState] = useState<State>({ phase: "idle" });
  const running = useRef(false);

  const run = async () => {
    if (running.current) return;
    running.current = true;
    setState({ phase: "running", done: 0, total: 0 });
    let report = emptyReport();
    let done = 0;
    let total = 0;
    try {
      const list = await paymentsToCheckAction(campId);
      if (!list.ok) throw new Error(list.error);
      const refs = list.data;
      total = refs.length;
      setState({ phase: "running", done: 0, total });
      for (let i = 0; i < refs.length; i += CHECK_CHUNK) {
        const chunk = refs.slice(i, i + CHECK_CHUNK);
        const r = await checkWithExpressPayAction(campId, chunk);
        if (!r.ok) throw new Error(r.error);
        report = addReports(report, r.data);
        done += chunk.length;
        setState({ phase: "running", done, total });
      }
      setState({ phase: "done", report, at: time() });
    } catch (err) {
      const message = err instanceof Error && /^[A-Z].*[.!?]$/.test(err.message) ? err.message : "Couldn't reach expressPay to check. Try again in a minute.";
      setState({ phase: "error", message, report: done ? report : undefined, done, total });
    } finally {
      running.current = false;
    }
  };

  const report = state.phase === "done" ? state.report : state.phase === "error" ? state.report : undefined;
  const problems = report?.problems ?? [];

  return (
    <>
      <section aria-live="polite" className="cm-rise flex flex-wrap items-center gap-4 rounded-2xl bg-white p-5 shadow-seline-hero">
        <Mark state={state} problems={problems.length} />
        <span className="flex min-w-[200px] flex-1 flex-col gap-1">
          <span className={`${titleClass} text-[22px]`}>
            {state.phase === "done"
              ? problems.length
                ? `${problems.length} don't match expressPay`
                : "Matches expressPay"
              : state.phase === "running"
                ? "Checking with expressPay…"
                : state.phase === "error"
                  ? "The check stopped"
                  : "Check all with expressPay"}
          </span>
          {state.phase === "running" ? (
            <Progress done={state.done} total={state.total} />
          ) : (
            <span className="text-[13px] text-warm-gray">
              {state.phase === "done"
                ? summary(state.report, state.at)
                : state.phase === "error"
                  ? `${state.message}${state.total ? ` Checked ${state.done} of ${state.total} before it stopped.` : ""}`
                  : "Asks expressPay about every payment from the last 30 days and lists any that disagree. Changes nothing."}
            </span>
          )}
        </span>
        <button
          type="button"
          onClick={run}
          disabled={state.phase === "running"}
          className={
            state.phase === "idle"
              ? "cm-press inline-flex h-11 items-center gap-2 rounded-full border border-cyan-edge bg-cyan-signal px-5 text-sm font-medium text-ink-black disabled:opacity-60"
              : "cm-press inline-flex h-10 items-center gap-2 rounded-full border border-stone-border bg-white px-4 text-sm font-medium disabled:opacity-60"
          }
        >
          <RefreshCw className={`h-4 w-4 ${state.phase === "running" ? "animate-spin motion-reduce:animate-none" : ""}`} strokeWidth={1.7} aria-hidden="true" />
          {state.phase === "idle" ? "Check now" : state.phase === "running" ? "Checking" : "Check again"}
        </button>
      </section>

      {problems.length > 0 && (
        <section className="flex flex-col gap-2.5">
          <h2 className="text-sm font-semibold">Doesn&apos;t match</h2>
          <ul className="overflow-hidden rounded-[10px] border border-stone-border bg-white shadow-seline-card">
            {problems.map((p) => (
              <li key={p.reference} className="flex flex-col gap-0.5 border-t border-stone-border px-4 py-3 text-sm first:border-t-0">
                <span className="font-medium">{p.full_name}</span>
                <span className="text-[13px] text-warm-gray">
                  {p.issue} Commune: {p.ours}. expressPay: {p.expresspay}. <span className="font-mono text-[12px]">{p.reference}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function summary(r: Reconciliation, at: string) {
  return [
    `Checked ${at}`,
    `${r.checked} ${r.checked === 1 ? "payment" : "payments"} from the last 30 days`,
    r.waiting > 0 && `${r.waiting} waiting for MoMo approval`,
    r.awaitingRefund > 0 && `${r.awaitingRefund} waiting for a refund`,
    r.unanswered > 0 && `${r.unanswered} got no answer, check again`,
  ]
    .filter(Boolean)
    .join(" · ");
}

function Progress({ done, total }: { done: number; total: number }) {
  const share = total ? done / total : 0;
  return (
    <span className="flex flex-col gap-1.5">
      <span
        role="progressbar"
        aria-label="Payments checked"
        aria-valuemin={0}
        aria-valuemax={total || 1}
        aria-valuenow={done}
        className="block h-1.5 overflow-hidden rounded-full bg-stone-border"
      >
        <span className="block h-full rounded-full bg-cyan-edge transition-[width] duration-300 ease-out" style={{ width: `${Math.max(share * 100, total ? 2 : 0)}%` }} />
      </span>
      <span className="text-[13px] tabular-nums text-warm-gray">{total ? `${done} of ${total} payments` : "Finding the payments…"}</span>
    </span>
  );
}

function Mark({ state, problems }: { state: State; problems: number }) {
  if (state.phase === "error") return <AlertTriangle className="h-11 w-11 flex-none p-2" strokeWidth={1.6} aria-hidden="true" />;
  if (state.phase !== "done") {
    return (
      <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden="true" className="flex-none">
        <circle cx="22" cy="22" r="20" fill="none" stroke="#e8e6e5" strokeWidth="2.5" />
      </svg>
    );
  }
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden="true" className="flex-none">
      <circle className="cm-ring" pathLength={1} cx="22" cy="22" r="20" fill="none" stroke={problems ? "#1c1917" : "#0ca30c"} strokeWidth="2.5" transform="rotate(-90 22 22)" />
      {problems ? (
        <g className="cm-drop">
          <path d="M22 13v11" stroke="#1c1917" strokeWidth="2.8" strokeLinecap="round" />
          <circle cx="22" cy="30" r="1.8" fill="#1c1917" />
        </g>
      ) : (
        <path className="cm-tick" pathLength={1} d="M13 22.5l6 6 12-13" fill="none" stroke="#0ca30c" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
      )}
    </svg>
  );
}
