import type { AppEnv } from "./util";

/**
 * Web Push (RFC 8030) with VAPID (RFC 8292) and an encrypted payload
 * (RFC 8291, aes128gcm), on WebCrypto alone. Works for Chrome/Android,
 * Firefox, Edge and iPhone apps added to the Home Screen.
 *
 * Keys: VAPID_PUBLIC_KEY (base64url, 65-byte uncompressed point) and
 * VAPID_PRIVATE_KEY (base64url, 32-byte d). Make a pair with
 * `node scripts/vapid-keys.mjs`.
 */

export type PushSub = { endpoint: string; p256dh: string; auth: string };
export type PushMessage = { title: string; body: string; url: string; tag?: string };

const enc = new TextEncoder();

export function b64url(bytes: ArrayBuffer | Uint8Array) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromB64url(text: string) {
  const s = atob(text.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((text.length + 3) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let i = 0;
  for (const p of parts) {
    out.set(p, i);
    i += p.length;
  }
  return out;
};

export const pushConfigured = (env: AppEnv) => Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);

async function vapidHeader(env: AppEnv, endpoint: string) {
  const pub = fromB64url(env.VAPID_PUBLIC_KEY!);
  const key = await crypto.subtle.importKey(
    "jwk",
    { kty: "EC", crv: "P-256", d: env.VAPID_PRIVATE_KEY!, x: b64url(pub.slice(1, 33)), y: b64url(pub.slice(33, 65)), ext: true },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const header = b64url(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64url(
    enc.encode(
      JSON.stringify({
        aud: new URL(endpoint).origin,
        exp: Math.floor(Date.now() / 1000) + 12 * 3600,
        sub: env.VAPID_SUBJECT || "https://commune.theairportcitychurch.com",
      }),
    ),
  );
  const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(`${header}.${claims}`));
  return `vapid t=${header}.${claims}.${b64url(signature)}, k=${env.VAPID_PUBLIC_KEY}`;
}

/** The standard name is `public`; workers-types spell it `$public`. Both are passed so either reads it. */
const ecdh = (key: CryptoKey) => ({ name: "ECDH", public: key, $public: key }) as unknown as SubtleCryptoDeriveKeyAlgorithm;

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, bytes: number) {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, bytes * 8));
}

/** The aes128gcm body for one subscription (RFC 8291 §3, one record). */
export async function encrypt(sub: PushSub, plaintext: Uint8Array, salt = crypto.getRandomValues(new Uint8Array(16))) {
  const uaPublic = fromB64url(sub.p256dh);
  const authSecret = fromB64url(sub.auth);
  const local = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
  const asPublic = new Uint8Array((await crypto.subtle.exportKey("raw", local.publicKey)) as ArrayBuffer);
  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits(ecdh(uaKey), local.privateKey, 256));

  const ikm = await hkdf(authSecret, shared, concat(enc.encode("WebPush: info\0"), uaPublic, asPublic), 32);
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);
  const aes = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aes, concat(plaintext, new Uint8Array([2]))));

  const rs = new Uint8Array([0, 0, 16, 0]); // 4096
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, cipher);
}

/**
 * Sends one notification. "gone" means the browser dropped the subscription
 * (uninstalled, notifications turned off): delete it.
 */
export async function sendPush(env: AppEnv, sub: PushSub, message: PushMessage): Promise<"ok" | "gone" | "failed"> {
  try {
    const body = await encrypt(sub, enc.encode(JSON.stringify(message)));
    const res = await fetch(sub.endpoint, {
      method: "POST",
      headers: {
        Authorization: await vapidHeader(env, sub.endpoint),
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        TTL: "86400",
        Urgency: "normal",
      },
      body,
    });
    if (res.status === 404 || res.status === 410) return "gone";
    return res.ok ? "ok" : "failed";
  } catch (err) {
    console.error("push", err);
    return "failed";
  }
}
