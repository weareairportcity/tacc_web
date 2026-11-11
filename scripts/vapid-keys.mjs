// Makes a VAPID key pair for Commune's app notifications (workers/soulwinning/src/webpush.ts).
// Usage: node scripts/vapid-keys.mjs <folder>  → writes vapid-public.txt and vapid-private.txt there.
import { generateKeyPairSync } from "node:crypto";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2];
if (!dir) throw new Error("usage: node scripts/vapid-keys.mjs <folder>");
const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const jwk = privateKey.export({ format: "jwk" });
const pub = Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, "base64url"), Buffer.from(jwk.y, "base64url")]).toString("base64url");
writeFileSync(join(dir, "vapid-public.txt"), pub);
writeFileSync(join(dir, "vapid-private.txt"), jwk.d, { mode: 0o600 });
console.log(`Wrote ${join(dir, "vapid-public.txt")} and vapid-private.txt`);
