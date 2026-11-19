"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, BookOpen, Check, ChevronLeft, ChevronRight, Copy, EllipsisVertical, Ellipsis, Lock, Megaphone, Plus, Settings, Share, Smartphone, SquarePlus } from "lucide-react";
import { Busy } from "@/components/camp/brand";
import { ErrorText, primaryButtonClass, secondaryButtonClass } from "@/components/camp/ui";
import { useOneAtATime } from "@/components/camp/useOneAtATime";
import { cn } from "@/lib/utils";
import { appKind, currentSubscription, isInstalled, platform, type AppKind } from "./push-client";
import { usePush, type PushActions } from "./usePush";

type Result = { ok: true; data: unknown } | { ok: false; error: string };

/** Which browser the page is open in, as far as setting up Commune goes. */
type Browser = "safari" | "chrome-ios" | "other-ios" | "android" | "inapp" | "desktop";

const IN_APP: [RegExp, string][] = [
  [/Instagram/i, "Instagram"],
  [/FBAN|FBAV|FB_IAB|FBIOS/i, "Facebook"],
  [/WhatsApp/i, "WhatsApp"],
  [/Snapchat/i, "Snapchat"],
  [/musical_ly|TikTok|BytedanceWebview/i, "TikTok"],
  [/Twitter/i, "X"],
  [/\bLine\//i, "LINE"],
];

/**
 * The Home Screen app this screen is for, in the words and icon the steps use.
 * Passed in from the server so attendees' pages never carry the team app's
 * name or icon.
 */
export type App = { kind: AppKind; name: string; icon: string };
const ATTENDEE_APP: App = { kind: "attendee", name: "Commune", icon: "/commune/icon-192.png" };

function whichBrowser(): { browser: Browser; app: string } {
  const ua = navigator.userAgent;
  const inApp = IN_APP.find(([re]) => re.test(ua));
  if (inApp) return { browser: "inapp", app: inApp[1] };
  const p = platform();
  if (p === "ios") {
    if (/CriOS/.test(ua)) return { browser: "chrome-ios", app: "" };
    if (/FxiOS|EdgiOS|OPiOS|OPT\/|DuckDuckGo|YaBrowser/.test(ua)) return { browser: "other-ios", app: "" };
    return { browser: "safari", app: "" };
  }
  return { browser: p === "android" ? "android" : "desktop", app: "" };
}

/**
 * Records that Commune was opened from the Home Screen (or that Android just
 * installed it), once a visit. Rendered on every attendee page, gated or not,
 * so Coordinators see who has the app.
 */
export function AppTracker({ known, installed, kind = "attendee" }: { known: boolean; installed: (platform: string) => Promise<Result>; kind?: AppKind }) {
  const router = useRouter();
  useEffect(() => {
    const record = async () => {
      try {
        if (sessionStorage.getItem("commune.app.seen") === "1") return;
        sessionStorage.setItem("commune.app.seen", "1");
      } catch {}
      const r = await installed(platform());
      if (r.ok) router.refresh();
    };
    // Only the right app counts: the attendee Commune isn't Commune Team, and the other way round.
    if (!known && isInstalled() && appKind() === kind) void record();
    const onInstalled = () => void installed(platform()).then((r) => r.ok && router.refresh());
    window.addEventListener("appinstalled", onInstalled);
    return () => window.removeEventListener("appinstalled", onInstalled);
  }, [known, installed, router, kind]);
  return null;
}

/**
 * Before their page: put Commune on the Home Screen, then turn on
 * notifications. One job per screen, drawn the way the phone shows it, so
 * nobody has to guess. "My phone can't do this" always lets them through to
 * texts instead (and tells the coordinators who they are).
 */
export function AppGate({
  app = ATTENDEE_APP,
  why,
  startUrl,
  first,
  campName,
  serverInstalled,
  serverPush,
  actions,
  textsOnly,
  noApp,
}: {
  /** Which app: attendees' Commune by default; the team's is passed in from its own pages. */
  app?: App;
  /** Why they're asked, after "So you". Defaults to the attendee's camp updates. */
  why?: string;
  /** Where the Home Screen app should start: signs them in and opens their page. */
  startUrl: string | null;
  first: string;
  campName: string;
  /** Commune has been opened from a Home Screen before (on any phone). */
  serverInstalled: boolean;
  /** A phone of theirs has notifications on. */
  serverPush: boolean;
  actions: PushActions;
  /** Attendees only: "My phone can't do this". */
  textsOnly?: () => Promise<Result>;
  /**
   * The team only: "My device can't do this", which opens the pages on this
   * device without the app. Offered on a device too old for app notifications
   * (`tooOld`), or once added if the device turns out not to support them.
   */
  noApp?: { run: () => Promise<Result>; tooOld: boolean };
}) {
  const router = useRouter();
  const push = usePush(actions);
  const variant = app.kind;
  const reason = why ?? "get updates about camp: your receipts, your room and news from the coordinators";
  const [where, setWhere] = useState<{ browser: Browser; app: string; kind: AppKind | null } | null>(null);
  const [finishing, setFinishing] = useState(false);
  const synced = useRef(false);

  useEffect(() => {
    // The browser is only known in the browser.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWhere({ ...whichBrowser(), kind: appKind() });
    // iPhones save the address on screen as the app's start: make it the one that signs them in
    // (attendees), or that marks the window as Commune Team.
    if (!isInstalled()) {
      if (startUrl) window.history.replaceState(window.history.state, "", startUrl);
      else if (variant === "team") {
        const url = new URL(window.location.href);
        url.searchParams.set("app", "team");
        window.history.replaceState(window.history.state, "", url.pathname + url.search);
      }
    }
  }, [startUrl, variant]);

  // Notifications are on in this browser but the server doesn't know yet (or just turned on): save, then open the page.
  useEffect(() => {
    if (!push.ready || !push.on || synced.current) return;
    if (serverPush && (serverInstalled || push.installed)) return;
    synced.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFinishing(true);
    void (async () => {
      const sub = await currentSubscription().catch(() => null);
      if (sub) await actions.save(sub.toJSON());
      router.refresh();
    })();
  }, [push.ready, push.on, push.installed, serverPush, serverInstalled, actions, router]);

  // In this app, from the Home Screen (not the other Commune app on the same phone).
  const installedHere = push.installed && where?.kind === app.kind;
  const installDone = serverInstalled || installedHere;
  const step: 1 | 2 = installDone ? 2 : 1;

  if (!push.ready || !where) return <Shell first={first} campName={campName} step={step} title="Setting up Commune" lead="One moment…" />;

  if (finishing || (push.on && installDone)) {
    return (
      <Shell first={first} campName={campName} step={3} title="You're all set" lead="Opening your page…">
        <p role="status" className="flex items-center gap-3 rounded-2xl bg-white p-5 text-[17px] shadow-seline-hero">
          <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-st-paid text-white">
            <Check className="h-5 w-5" strokeWidth={2.4} aria-hidden="true" />
          </span>
          Notifications will come to your phone now.
        </p>
      </Shell>
    );
  }

  const skip = noApp ? <WithoutApp run={noApp.run} /> : null;
  const escape = textsOnly ? <TextsInstead textsOnly={textsOnly} /> : noApp?.tooOld ? skip : null;

  // In the other Commune app (attendees' or the team's): this one is added separately, from the browser.
  if (push.installed && where.kind && where.kind !== app.kind) {
    const real = push.platform === "ios" ? "Safari" : "Chrome";
    // Never names the other app: an attendee page may be opened by someone who only knows Commune.
    const page = variant === "team" ? "the coordinators' or leaders' page" : "your camp page";
    return (
      <Shell first={first} campName={campName} step={1} title={`Add ${app.name} too`} lead={`You're in a different Commune app. ${app.name} is added separately: add it from ${real} so you ${reason}.`}>
        <Steps>
          <Step n={1} text={<>Copy the link below, then open <strong className="font-semibold">{real}</strong> and paste it.</>} />
          <Step n={2} text={<>On {page} in {real}, follow the steps to add <strong className="font-semibold">{app.name}</strong>.</>} art={<HomeScreenArt app={app} />} />
        </Steps>
        <CopyLink label={`Copy the link for ${real}`} />
        {escape}
      </Shell>
    );
  }

  // Opened inside WhatsApp, Instagram, Facebook…: those can't add anything to the Home Screen.
  if (where.browser === "inapp" && !installedHere) {
    const real = push.platform === "ios" ? "Safari" : "Chrome";
    return (
      <Shell first={first} campName={campName} step={1} title={`Open this in ${real}`} lead={`Add ${app.name} to your phone so you ${reason}. You opened this inside ${where.app}, and that only works from ${real}.`}>
        <WhyCard app={app} />
        <Steps>
          <Step n={1} text={<>Tap <Key><Ellipsis className="h-4 w-4" aria-label="the three dots" /></Key> at the top or bottom of the screen.</>} art={<InAppArt />} />
          <Step n={2} text={<>Tap <strong className="font-semibold">Open in {real}</strong> (or <strong className="font-semibold">Open in browser</strong>).</>} />
        </Steps>
        <CopyLink label={`Or copy the link and paste it into ${real}`} />
        {escape}
      </Shell>
    );
  }

  // Step 2: on the Home Screen (or Android, where the browser can do notifications too).
  const canNotifyHere = push.supported && !push.needsInstallFirst;
  if (installedHere || (installDone && canNotifyHere && where.browser === "android")) {
    return (
      <Shell
        first={first}
        campName={campName}
        step={2}
        title="Turn on notifications"
        lead={`So you ${reason}.`}
      >
        <NotifyStep push={push} app={app} />
        {/* In the app the phone can do this: the way out is only for phones that truly can't. */}
        {(!push.supported || push.permission === "denied") && escape}
        {!push.supported && !escape && skip}
      </Shell>
    );
  }

  // Added before, but this is the browser: open the app instead.
  if (serverInstalled && where.browser !== "android") {
    return (
      <Shell first={first} campName={campName} step={2} title={`Open ${app.name} from your Home Screen`} lead={`${app.name} is already on your phone. Open it there and turn on notifications, so you ${reason}.`}>
        <Steps>
          <Step n={1} text={<>Go to your Home Screen and tap <strong className="font-semibold">{app.name}</strong>.</>} art={<HomeScreenArt app={app} />} />
          <Step n={2} text={<>Tap <strong className="font-semibold">Turn on notifications</strong>, then <strong className="font-semibold">Allow</strong>.</>} />
        </Steps>
        <details className="group text-[15px]">
          <summary className="cm-press flex min-h-11 cursor-pointer list-none items-center gap-1.5 font-medium underline decoration-stone-muted underline-offset-[3px] [&::-webkit-details-marker]:hidden">
            Can&apos;t find it? Add it again
          </summary>
          <div className="mt-3">
            <InstallSteps browser={where.browser} push={push} app={app} />
          </div>
        </details>
        {escape}
      </Shell>
    );
  }

  // Step 1: add to the Home Screen.
  return (
    <Shell first={first} campName={campName} step={1} title={`Add ${app.name} to your phone`} lead={`So you ${reason}.`}>
      <WhyCard app={app} />
      <InstallSteps browser={where.browser} push={push} app={app} />
      {escape}
    </Shell>
  );
}

function InstallSteps({ browser, push, app }: { browser: Browser; push: ReturnType<typeof usePush>; app: App }) {
  const [pending, start] = useOneAtATime();
  const share = <Key><Share className="h-4 w-4" aria-label="Share" /></Key>;
  const add = <><strong className="font-semibold">Add</strong>, then open <strong className="font-semibold">{app.name}</strong> from your Home Screen.</>;
  if (browser === "safari" || browser === "chrome-ios")
    return (
      <OneAtATime
        steps={[
          {
            text: browser === "safari" ? <>Tap {share} at the bottom of the screen.</> : <>Tap {share} at the top right, next to the address.</>,
            note: browser === "safari" ? <>Can&apos;t see it? Tap <Key><Ellipsis className="h-4 w-4" aria-label="the three dots" /></Key> first.</> : undefined,
            art: browser === "safari" ? <SafariBarArt /> : <ChromeIosArt />,
          },
          { text: <>Tap <strong className="font-semibold">Add to Home Screen</strong>.</>, note: <>Not there? Scroll down the list.</>, art: <ShareSheetArt /> },
          { text: <>Tap {add}</>, art: <AddArt app={app} /> },
        ]}
      />
    );
  if (browser === "other-ios")
    return (
      <>
        <Steps>
          <Step n={1} text={<>Open this page in <strong className="font-semibold">Safari</strong>. Commune is added to the Home Screen from there.</>} />
        </Steps>
        <CopyLink label="Copy the link, then paste it into Safari" />
      </>
    );
  // Android: one tap when Chrome offers it; otherwise its menu.
  if (push.installable)
    return (
      <div className="flex flex-col gap-3">
        <button type="button" disabled={pending} onClick={() => start(push.install)} className={`${primaryButtonClass} cm-tap h-14 w-full text-[17px]`}>
          <Smartphone className="h-5 w-5" strokeWidth={1.7} aria-hidden="true" /> Add {app.name} to my phone
        </button>
        <p className="text-center text-[15px] text-warm-gray">Then tap <strong className="font-semibold text-ink-black">Install</strong> when your phone asks.</p>
      </div>
    );
  return (
    <OneAtATime
      steps={[
        { text: <>Tap <Key><EllipsisVertical className="h-4 w-4" aria-label="the three dots" /></Key> at the top right.</>, art: <AndroidMenuArt /> },
        {
          text: (
            <>
              Tap <strong className="font-semibold">Add to Home screen</strong> or <strong className="font-semibold">Install app</strong>, then {add}
            </>
          ),
          art: <HomeScreenArt app={app} />,
        },
      ]}
    />
  );
}

type OneStep = { text: React.ReactNode; note?: React.ReactNode; art?: React.ReactNode };

/** The install, one step per screen: a big picture, one short line, and Next. */
function OneAtATime({ steps }: { steps: OneStep[] }) {
  const [i, setI] = useState(0);
  const step = steps[i];
  const last = i === steps.length - 1;
  return (
    <section aria-label="How to add it" className="flex flex-col gap-4 rounded-2xl bg-white p-5 shadow-seline-hero">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[13px] font-medium text-warm-gray" aria-live="polite">
          Step {i + 1} of {steps.length}
        </span>
        <span className="flex gap-1.5" aria-hidden="true">
          {steps.map((_, n) => (
            <span key={n} className={cn("h-1.5 w-6 rounded-full transition-colors", n <= i ? "bg-cyan-edge" : "bg-stone-border")} />
          ))}
        </span>
      </div>
      <div key={i} className="cm-rise flex flex-col gap-4">
        {step.art && (
          <div aria-hidden="true" className="overflow-hidden rounded-[14px] bg-stone-canvas">
            {step.art}
          </div>
        )}
        <p className="flex flex-col gap-1">
          <span className="text-[19px] leading-snug">{step.text}</span>
          {step.note && <span className="text-[15px] leading-snug text-warm-gray">{step.note}</span>}
        </p>
      </div>
      <div className="flex gap-2">
        {i > 0 && (
          <button type="button" onClick={() => setI(i - 1)} className={`${secondaryButtonClass} h-12 px-5 text-[15px]`}>
            <ChevronLeft className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" /> Back
          </button>
        )}
        {!last && (
          <button type="button" onClick={() => setI(i + 1)} className={`${primaryButtonClass} h-12 flex-1 text-[15px]`}>
            Next <ChevronRight className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
          </button>
        )}
      </div>
    </section>
  );
}

/** Why we ask: camp updates come through the app. */
function WhyCard({ app }: { app: App }) {
  const team = app.kind === "team";
  return (
    <section className="cm-rise flex gap-3.5 rounded-2xl bg-cyan-tint p-5">
      <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-white text-cyan-deep">
        <Megaphone className="h-5 w-5" strokeWidth={1.7} aria-hidden="true" />
      </span>
      <span className="flex flex-col gap-1.5">
        <strong className="text-[17px] font-semibold leading-snug">{team ? "The camp runs through Commune Team" : "Camp updates come through the Commune app"}</strong>
        <span className="text-[15px] leading-relaxed text-[#44403c]">
          {team
            ? "We'll send camp updates through this app: registrations, payments and messages from the coordinators. It's free and takes about a minute."
            : "During camp, we'll send everything through this app: your receipts, your room, and updates from the coordinators. It's free, takes about a minute, and means you won't miss a thing."}
        </span>
      </span>
    </section>
  );
}

function NotifyStep({ push, app }: { push: ReturnType<typeof usePush>; app: App }) {
  const [pending, start] = useOneAtATime();
  if (!push.supported)
    return (
      <p className="rounded-2xl bg-white p-5 text-[17px] leading-relaxed shadow-seline-hero">
        This phone can&apos;t get notifications from {app.name}.
        {push.platform === "ios" ? " iPhones need iOS 16.4 or newer: update in Settings, General, Software Update." : ""} Or tap{" "}
        <strong className="font-semibold">My phone can&apos;t do this</strong> below to get texts instead.
      </p>
    );
  if (push.permission === "denied")
    return (
      <div className="flex flex-col gap-3">
        <p className="text-[17px] leading-relaxed">Notifications are switched off for Commune. Switch them on in your phone&apos;s settings:</p>
        <Steps>
          {push.platform === "ios" ? (
            <>
              <Step n={1} text={<>Open <Key><Settings className="h-4 w-4" aria-hidden="true" /></Key> <strong className="font-semibold">Settings</strong>, then <strong className="font-semibold">Notifications</strong>.</>} />
              <Step n={2} text={<>Tap <strong className="font-semibold">{app.name}</strong> and switch on <strong className="font-semibold">Allow Notifications</strong>.</>} />
              <Step n={3} text={<>Come back to Commune.</>} />
            </>
          ) : (
            <>
              <Step n={1} text={<>Press and hold the <strong className="font-semibold">{app.name}</strong> icon, then tap <strong className="font-semibold">App info</strong>.</>} />
              <Step n={2} text={<>Tap <strong className="font-semibold">Notifications</strong> and switch them on.</>} />
              <Step n={3} text={<>Come back to Commune.</>} />
            </>
          )}
        </Steps>
        <button type="button" onClick={() => window.location.reload()} className={`${secondaryButtonClass} h-12 w-full text-[15px]`}>
          I&apos;ve switched them on
        </button>
      </div>
    );
  return (
    <div className="flex flex-col gap-3">
      <button type="button" disabled={pending} aria-busy={pending} onClick={() => start(push.enable)} className={`${primaryButtonClass} cm-tap h-14 w-full text-[17px]`}>
        <Busy pending={pending} text="Turning on…">
          <Bell className="h-5 w-5" strokeWidth={1.7} aria-hidden="true" /> Turn on notifications
        </Busy>
      </button>
      <p className="text-center text-[15px] text-warm-gray">
        Then tap <strong className="font-semibold text-ink-black">Allow</strong> when your phone asks.
      </p>
      <ErrorText>{push.error}</ErrorText>
    </div>
  );
}

function TextsInstead({ textsOnly }: { textsOnly: () => Promise<Result> }) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState("");
  const [pending, start] = useOneAtATime();
  const go = useCallback(
    () =>
      start(async () => {
        const r = await textsOnly();
        if (!r.ok) return setError(r.error);
        router.refresh();
      }),
    [start, textsOnly, router],
  );
  if (!asking)
    return (
      <button type="button" onClick={() => setAsking(true)} className="cm-press mx-auto h-11 px-3 text-[15px] text-warm-gray underline decoration-stone-muted underline-offset-[3px]">
        My phone can&apos;t do this
      </button>
    );
  return (
    <div className="cm-pop flex flex-col gap-3 rounded-2xl border border-stone-border bg-white p-5">
      <p className="text-[17px] font-medium">Get texts instead?</p>
      <p className="text-[15px] leading-relaxed text-warm-gray">We&apos;ll text you your receipts and your room. You can still set up the app later from your page.</p>
      <ErrorText>{error}</ErrorText>
      <div className="flex gap-2">
        <button type="button" onClick={() => setAsking(false)} className={`${secondaryButtonClass} h-12 flex-1 text-[15px]`}>
          Keep trying
        </button>
        <button type="button" disabled={pending} onClick={go} className="cm-press h-12 flex-1 rounded-full bg-soot px-4 text-[15px] font-medium text-white disabled:opacity-60">
          <Busy pending={pending} text="One moment…">Use texts</Busy>
        </button>
      </div>
    </div>
  );
}

function WithoutApp({ run }: { run: () => Promise<Result> }) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState("");
  const [pending, start] = useOneAtATime();
  if (!asking)
    return (
      <button type="button" onClick={() => setAsking(true)} className="cm-press mx-auto h-11 px-3 text-[15px] text-warm-gray underline decoration-stone-muted underline-offset-[3px]">
        My device can&apos;t do this
      </button>
    );
  return (
    <div className="cm-pop flex flex-col gap-3 rounded-2xl border border-stone-border bg-white p-5">
      <p className="text-[17px] font-medium">Use Commune here instead?</p>
      <p className="text-[15px] leading-relaxed text-warm-gray">
        This device is too old for app notifications, so you won&apos;t get them here. Everything else works. To get notifications, update the device or use another
        phone.
      </p>
      <ErrorText>{error}</ErrorText>
      <div className="flex gap-2">
        <button type="button" onClick={() => setAsking(false)} className={`${secondaryButtonClass} h-12 flex-1 text-[15px]`}>
          Keep trying
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await run();
              if (!r.ok) return setError(r.error);
              router.refresh();
            })
          }
          className="cm-press h-12 flex-1 rounded-full bg-soot px-4 text-[15px] font-medium text-white disabled:opacity-60"
        >
          <Busy pending={pending} text="One moment…">Continue</Busy>
        </button>
      </div>
    </div>
  );
}

function CopyLink({ label }: { label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() =>
        navigator.clipboard
          ?.writeText(window.location.href.replace(/\?.*$/, ""))
          .then(() => setCopied(true))
          .catch(() => undefined)
      }
      className={`${secondaryButtonClass} h-12 w-full text-[15px]`}
    >
      {copied ? <Check className="h-4 w-4 text-st-paid" strokeWidth={2.4} aria-hidden="true" /> : <Copy className="h-4 w-4" strokeWidth={1.7} aria-hidden="true" />}
      {copied ? "Link copied" : label}
    </button>
  );
}

// ─── Layout ──────────────────────────────────────────────────────────────────

function Shell({ first, campName, step, title, lead, children }: { first: string; campName: string; step: 1 | 2 | 3; title: string; lead: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-6 pt-2">
      <div className="flex flex-col gap-3">
        <p className="text-sm text-warm-gray">
          Hi {first} · {campName}
        </p>
        <Progress step={step} />
        <h1 className="cm-rise font-display text-[34px] font-normal leading-[1.1] tracking-[-0.022em]">{title}</h1>
        <p className="text-[17px] leading-relaxed text-[#57534e]">{lead}</p>
      </div>
      {children}
      <p className="flex items-center justify-center gap-1.5 text-[13px] text-warm-gray">
        <Lock className="h-3.5 w-3.5" strokeWidth={1.7} aria-hidden="true" /> Your page opens when this is done.
      </p>
    </div>
  );
}

function Progress({ step }: { step: 1 | 2 | 3 }) {
  const items = ["Add to Home Screen", "Turn on notifications"];
  return (
    <ol aria-label="Setting up Commune" className="grid grid-cols-2 gap-2">
      {items.map((label, i) => {
        const n = i + 1;
        const done = step > n;
        const now = step === n;
        return (
          <li key={label} className="flex flex-col gap-1.5">
            <span className={cn("h-1.5 rounded-full", done ? "bg-st-paid" : now ? "bg-cyan-edge" : "bg-stone-border")} />
            <span className={cn("flex items-center gap-1 text-[13px]", now ? "font-medium text-ink-black" : "text-warm-gray")}>
              {done && <Check className="h-3.5 w-3.5 text-st-paid" strokeWidth={2.6} aria-hidden="true" />}
              {n}. {label}
              <span className="sr-only">{done ? ", done" : now ? ", now" : ""}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function Steps({ children }: { children: React.ReactNode }) {
  return <ol className="flex flex-col gap-3">{children}</ol>;
}

function Step({ n, text, note, art }: { n: number; text: React.ReactNode; note?: React.ReactNode; art?: React.ReactNode }) {
  return (
    <li className="cm-rise flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-seline-hero" style={{ animationDelay: `${n * 60}ms` }}>
      <div className="flex items-start gap-3">
        <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-soot font-display text-[16px] text-white" aria-hidden="true">
          {n}
        </span>
        <span className="flex flex-col gap-1 pt-1">
          <span className="text-[17px] leading-snug">{text}</span>
          {note && <span className="text-[14px] leading-snug text-warm-gray">{note}</span>}
        </span>
      </div>
      {art && (
        <div aria-hidden="true" className="overflow-hidden rounded-[14px] bg-stone-canvas">
          {art}
        </div>
      )}
    </li>
  );
}

/** A button drawn inside a sentence, the way it looks on the phone. */
function Key({ children }: { children: React.ReactNode }) {
  return <span className="mx-0.5 inline-flex h-7 min-w-7 items-center justify-center rounded-[8px] border border-stone-border bg-white px-1 align-[-7px] text-cyan-deep">{children}</span>;
}

// ─── Drawings: what the phone shows, with the thing to tap glowing ────────────

const Glow = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <span className={cn("cm-tap flex items-center justify-center rounded-full border-2 border-cyan-edge bg-cyan-tint text-cyan-deep", className)}>{children}</span>
);

function SafariBarArt() {
  return (
    <div className="flex flex-col gap-2 px-4 pb-4 pt-3">
      <div className="mx-auto h-8 w-full max-w-[300px] rounded-[10px] bg-white text-center text-[12px] leading-8 text-warm-gray shadow-sm">commune.theairportcitychurch.com</div>
      <div className="mx-auto flex w-full max-w-[300px] items-center justify-between rounded-[14px] bg-white px-4 py-2 text-[#8a8580] shadow-sm">
        <ChevronLeft className="h-5 w-5" strokeWidth={1.8} />
        <ChevronRight className="h-5 w-5" strokeWidth={1.8} />
        <Glow className="h-10 w-10">
          <Share className="h-5 w-5" strokeWidth={2} />
        </Glow>
        <BookOpen className="h-5 w-5" strokeWidth={1.8} />
        <span className="h-5 w-5 rounded-[5px] border-2 border-current" />
      </div>
    </div>
  );
}

function ChromeIosArt() {
  return (
    <div className="px-4 py-3">
      <div className="mx-auto flex w-full max-w-[300px] items-center gap-2 rounded-[12px] bg-white px-3 py-2 shadow-sm">
        <span className="h-7 flex-1 truncate rounded-full bg-stone-canvas px-3 text-[12px] leading-7 text-warm-gray">commune.theairportcitychurch.com</span>
        <Glow className="h-9 w-9">
          <Share className="h-[18px] w-[18px]" strokeWidth={2} />
        </Glow>
      </div>
    </div>
  );
}

function ShareSheetArt() {
  const row = "flex h-10 items-center justify-between px-3.5 text-[14px]";
  return (
    <div className="px-4 py-3">
      <div className="mx-auto w-full max-w-[300px] overflow-hidden rounded-[14px] bg-white shadow-sm">
        <div className={cn(row, "text-warm-gray")}>
          Copy <Copy className="h-4 w-4" strokeWidth={1.8} />
        </div>
        <div className={cn(row, "border-t border-stone-border text-warm-gray")}>
          Add to Reading List <BookOpen className="h-4 w-4" strokeWidth={1.8} />
        </div>
        <div className={cn(row, "cm-tap m-1 rounded-[10px] border-2 border-cyan-edge bg-cyan-tint font-medium text-ink-black")}>
          Add to Home Screen <SquarePlus className="h-[18px] w-[18px] text-cyan-deep" strokeWidth={2} />
        </div>
      </div>
    </div>
  );
}

function AddArt({ app }: { app: App }) {
  return (
    <div className="px-4 py-3">
      <div className="mx-auto w-full max-w-[300px] rounded-[14px] bg-white p-3 shadow-sm">
        <div className="flex items-center justify-between text-[14px]">
          <span className="text-cyan-deep">Cancel</span>
          <span className="font-medium">Add to Home Screen</span>
          <Glow className="h-8 px-3 text-[14px] font-semibold">Add</Glow>
        </div>
        <div className="mt-3 flex items-center gap-3 border-t border-stone-border pt-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={app.icon} alt="" width={40} height={40} className="h-10 w-10 rounded-[10px]" />
          <span className="text-[15px]">{app.name}</span>
        </div>
      </div>
    </div>
  );
}

function HomeScreenArt({ app }: { app: App }) {
  return (
    <div className="flex justify-center px-4 py-4">
      <div className="grid grid-cols-4 gap-x-4 gap-y-2">
        {[0, 1, 2].map((i) => (
          <span key={i} className="flex flex-col items-center gap-1">
            <span className="h-11 w-11 rounded-[12px] bg-stone-border" />
            <span className="h-1.5 w-8 rounded-full bg-stone-border" />
          </span>
        ))}
        <span className="flex flex-col items-center gap-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={app.icon} alt="" width={44} height={44} className="cm-tap h-11 w-11 rounded-[12px] ring-2 ring-cyan-edge" />
          <span className="text-[11px] font-medium">{app.name}</span>
        </span>
      </div>
    </div>
  );
}

function AndroidMenuArt() {
  return (
    <div className="px-4 py-3">
      <div className="mx-auto w-full max-w-[300px]">
        <div className="flex items-center gap-2 rounded-[12px] bg-white px-3 py-2 shadow-sm">
          <span className="h-7 flex-1 truncate rounded-full bg-stone-canvas px-3 text-[12px] leading-7 text-warm-gray">commune.theairportcitychurch.com</span>
          <Glow className="h-9 w-9">
            <EllipsisVertical className="h-[18px] w-[18px]" strokeWidth={2} />
          </Glow>
        </div>
        <div className="ml-auto mt-2 w-[190px] overflow-hidden rounded-[12px] bg-white text-[14px] shadow-sm">
          <div className="px-3.5 py-2.5 text-warm-gray">New tab</div>
          <div className="cm-tap m-1 flex items-center gap-2 rounded-[8px] border-2 border-cyan-edge bg-cyan-tint px-2.5 py-2 font-medium">
            <Plus className="h-4 w-4 text-cyan-deep" strokeWidth={2.2} /> Add to Home screen
          </div>
          <div className="px-3.5 py-2.5 text-warm-gray">Settings</div>
        </div>
      </div>
    </div>
  );
}

function InAppArt() {
  return (
    <div className="px-4 py-3">
      <div className="mx-auto flex w-full max-w-[300px] items-center justify-between rounded-[12px] bg-white px-3 py-2 text-[13px] text-warm-gray shadow-sm">
        <span>Done</span>
        <span className="truncate px-2">commune.theairportcitychurch.com</span>
        <Glow className="h-9 w-9">
          <Ellipsis className="h-[18px] w-[18px]" strokeWidth={2} />
        </Glow>
      </div>
    </div>
  );
}
