// One-time setup for the Grace in Continuity uploads.
//
//   node scripts/grace-drive-token.mjs ~/Downloads/client_secret_XXXX.json
//
// Opens Google sign-in, creates the "Grace in Continuity" folder in your Drive,
// and writes the Drive client id/secret, refresh token and folder id into
// .env.local. Nothing secret is printed. Safe to re-run: it reuses the folder.
import { createServer } from "node:http";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import path from "node:path";
import { google } from "googleapis";

const PORT = 5555;
const REDIRECT_URI = `http://localhost:${PORT}/callback`;
const SCOPES = ["https://www.googleapis.com/auth/drive.file"];
const FOLDER_NAME = "Grace in Continuity";
const ENV_PATH = path.join(process.cwd(), ".env.local");

const jsonPath = process.argv[2];
if (!jsonPath) {
  console.error("Usage: node scripts/grace-drive-token.mjs <client_secret.json>");
  process.exit(1);
}
const { web } = JSON.parse(readFileSync(jsonPath, "utf8"));
if (!web?.client_id || !web?.client_secret) {
  console.error("That file isn't a Web application OAuth client JSON.");
  process.exit(1);
}

function readEnv() {
  return existsSync(ENV_PATH) ? readFileSync(ENV_PATH, "utf8") : "";
}

function envValue(text, key) {
  return text.match(new RegExp(`^${key}=(.*)$`, "m"))?.[1]?.trim() || null;
}

function writeEnv(values) {
  let text = readEnv();
  for (const [key, value] of Object.entries(values)) {
    const line = `${key}=${value}`;
    const re = new RegExp(`^${key}=.*$`, "m");
    text = re.test(text) ? text.replace(re, line) : `${text.replace(/\n?$/, "\n")}${line}\n`;
  }
  writeFileSync(ENV_PATH, text);
}

const oauth = new google.auth.OAuth2(web.client_id, web.client_secret, REDIRECT_URI);
const state = randomBytes(16).toString("hex");
const authUrl = oauth.generateAuthUrl({
  access_type: "offline",
  prompt: "consent", // always hand back a refresh token, even on a re-run
  scope: SCOPES,
  state,
});

async function ensureFolder(drive) {
  const existing = envValue(readEnv(), "GOOGLE_DRIVE_FOLDER_ID");
  if (existing) {
    try {
      const { data } = await drive.files.get({ fileId: existing, fields: "id, trashed" });
      if (!data.trashed) return { id: data.id, reused: true };
    } catch {
      // Not visible to this app any more; make a fresh one.
    }
  }
  const { data } = await drive.files.create({
    requestBody: { name: FOLDER_NAME, mimeType: "application/vnd.google-apps.folder" },
    fields: "id",
  });
  return { id: data.id, reused: false };
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, REDIRECT_URI);
  if (url.pathname !== "/callback") {
    res.writeHead(404).end();
    return;
  }
  const finish = (status, message) => {
    res.writeHead(status, { "Content-Type": "text/html; charset=utf-8" });
    res.end(`<p style="font:16px system-ui;padding:2rem">${message}</p>`);
    server.close();
  };

  if (url.searchParams.get("state") !== state) {
    finish(400, "State mismatch — run the script again.");
    console.error("State mismatch. Nothing was saved.");
    process.exitCode = 1;
    return;
  }
  const error = url.searchParams.get("error");
  if (error) {
    finish(400, `Google said: ${error}`);
    console.error(`Google returned an error: ${error}`);
    process.exitCode = 1;
    return;
  }

  try {
    const { tokens } = await oauth.getToken(url.searchParams.get("code"));
    if (!tokens.refresh_token) throw new Error("Google did not return a refresh token.");
    oauth.setCredentials(tokens);
    const folder = await ensureFolder(google.drive({ version: "v3", auth: oauth }));

    writeEnv({
      GOOGLE_DRIVE_CLIENT_ID: web.client_id,
      GOOGLE_DRIVE_CLIENT_SECRET: web.client_secret,
      GOOGLE_DRIVE_REFRESH_TOKEN: tokens.refresh_token,
      GOOGLE_DRIVE_FOLDER_ID: folder.id,
    });

    finish(200, "All set — you can close this tab and go back to the terminal.");
    console.log(`\n✓ ${folder.reused ? "Reused" : "Created"} the "${FOLDER_NAME}" folder in your Drive.`);
    console.log("✓ Saved GOOGLE_DRIVE_CLIENT_ID, _CLIENT_SECRET, _REFRESH_TOKEN and _FOLDER_ID to .env.local.");
    console.log("  Copy those four into Vercel → Settings → Environment Variables before deploying.");
  } catch (err) {
    finish(500, "Something went wrong — check the terminal.");
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  }
});

server.listen(PORT, () => {
  console.log("Opening Google sign-in in your browser…");
  console.log('If Google warns the app isn\'t verified, choose "Advanced" → "Go to … (unsafe)".\n');
  console.log(`If nothing opens, visit:\n${authUrl}\n`);
  execFile("open", [authUrl]);
});
