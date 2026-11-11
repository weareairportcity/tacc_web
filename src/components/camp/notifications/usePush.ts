"use client";

import { useCallback, useEffect, useState } from "react";
import type { NotifyPrefs } from "@/lib/camp/push";
import { canPromptInstall, currentSubscription, isInstalled, onInstallChange, platform, promptInstall, pushSupported, subscribe, type Platform } from "./push-client";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

/** The server actions for one side (attendee or coordinator). */
export type PushActions = {
  save: (subscription: unknown) => Promise<Result<boolean>>;
  remove: (endpoint: string) => Promise<Result<boolean>>;
  prefs: (off?: string[]) => Promise<Result<NotifyPrefs>>;
};

const SYNCED = "commune.push.synced";

export type PushState = {
  /** False until the browser has been looked at (first render on the server). */
  ready: boolean;
  platform: Platform;
  installed: boolean;
  /** The browser can show its own "Install" dialog (Android, Chrome on computers). */
  installable: boolean;
  supported: boolean;
  permission: NotificationPermission | "unsupported";
  on: boolean;
  /** iPhone: notifications need the Home Screen app first. */
  needsInstallFirst: boolean;
};

export function usePush(actions: PushActions) {
  const [state, setState] = useState<PushState>({
    ready: false,
    platform: "desktop",
    installed: false,
    installable: false,
    supported: false,
    permission: "unsupported",
    on: false,
    needsInstallFirst: false,
  });
  const [error, setError] = useState("");

  const look = useCallback(async () => {
    const p = platform();
    const installed = isInstalled();
    const supported = pushSupported();
    const sub = supported ? await currentSubscription().catch(() => null) : null;
    setState({
      ready: true,
      platform: p,
      installed,
      installable: canPromptInstall(),
      supported,
      permission: supported ? Notification.permission : "unsupported",
      on: Boolean(sub) && supported && Notification.permission === "granted",
      needsInstallFirst: p === "ios" && !installed,
    });
    // Once a visit, tell the server again who this phone belongs to (it may have changed hands).
    try {
      if (sub && !sessionStorage.getItem(SYNCED)) {
        sessionStorage.setItem(SYNCED, "1");
        void actions.save(sub.toJSON());
      }
    } catch {}
  }, [actions]);

  useEffect(() => {
    // Browser-only facts, read after the first render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void look();
    const off = onInstallChange(() => void look());
    const media = window.matchMedia("(display-mode: standalone)");
    const onMedia = () => void look();
    media.addEventListener("change", onMedia);
    return () => {
      off();
      media.removeEventListener("change", onMedia);
    };
  }, [look]);

  const enable = useCallback(async () => {
    setError("");
    try {
      const prefs = await actions.prefs();
      const key = prefs.ok ? prefs.data.key : null;
      if (!key) return setError("Notifications aren't ready yet. Try again later.");
      const sub = await subscribe(key);
      if (sub === "denied") {
        await look();
        return setError("Notifications are blocked for Commune. Allow them in your phone's settings, then try again.");
      }
      const saved = await actions.save(sub);
      if (!saved.ok) return setError(saved.error);
      await look();
    } catch {
      setError("Couldn't turn on notifications on this phone. Try again.");
    }
  }, [actions, look]);

  const disable = useCallback(async () => {
    setError("");
    const sub = await currentSubscription().catch(() => null);
    if (sub) {
      await actions.remove(sub.endpoint);
      await sub.unsubscribe().catch(() => false);
    }
    await look();
  }, [actions, look]);

  const install = useCallback(async () => {
    await promptInstall();
    await look();
  }, [look]);

  return { ...state, error, enable, disable, install };
}
