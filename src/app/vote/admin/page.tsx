"use client";

import { useState, useEffect } from "react";
import Image from "next/image";

const GROUPS = ["Group 1", "Group 2", "Group 3", "Group 4", "Pastors Group"];
const WEEK_LABELS: Record<string, string> = {
  "Group 1": "Week 1",
  "Group 2": "Week 2",
  "Group 3": "Week 3",
  "Group 4": "Week 4",
  "Pastors Group": "Week 5",
};
const CATEGORIES = [
  { key: "avgActing", label: "Acting", color: "#a78bfa" },
  { key: "avgConcept", label: "Concept", color: "#60a5fa" },
  { key: "avgQuality", label: "Quality", color: "#34d399" },
] as const;

type Film = { id: string; title: string; director: string; group: string; added_at: number };
type FilmResult = {
  id: string; title: string; director: string; group: string;
  voteCount: number; avgActing: string | null; avgConcept: string | null;
  avgQuality: string | null; avgTotal: string | null;
};

// ─── Login ───────────────────────────────────────────────────────────────────
function Login({ onLogin }: { onLogin: () => void }) {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true); setErr("");
    const r = await fetch("/api/vote/admin-auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: pw }),
    });
    if (r.ok) { onLogin(); }
    else { setErr("Wrong password."); }
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <Image src="/logo.png" alt="Airport City Church" width={140} height={52} className="object-contain mb-6" />
          <h1 className="text-2xl font-bold text-slate-900">Admin Login</h1>
          <p className="text-slate-500 text-sm mt-1">Film Voting Dashboard</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Password</label>
          <input
            className="w-full h-10 px-3 rounded-md border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="Enter admin password"
          />
          {err && (
            <div className="mt-3 px-3 py-2 rounded-md bg-red-50 border border-red-200 text-sm text-red-700">{err}</div>
          )}
          <button
            className="mt-4 w-full h-10 rounded-md bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            onClick={submit}
            disabled={loading || !pw}
          >
            {loading ? "Checking…" : "Login"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Films Tab ───────────────────────────────────────────────────────────────
function FilmsTab({ films, setFilms }: { films: Film[]; setFilms: (f: Film[]) => void }) {
  const [title, setTitle] = useState("");
  const [director, setDirector] = useState("");
  const [group, setGroup] = useState("Group 1");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  async function addFilm() {
    if (!title.trim()) return;
    setSaving(true);
    const newFilm: Film = {
      id: `film_${Date.now()}`,
      title: title.trim(),
      director: director.trim(),
      group,
      added_at: Date.now(),
    };
    await fetch("/api/vote/films", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newFilm),
    });
    setFilms([...films, newFilm]);
    setTitle(""); setDirector("");
    setMsg("Film added!"); setTimeout(() => setMsg(""), 2000);
    setSaving(false);
  }

  async function removeFilm(id: string) {
    if (!confirm("Remove this film?")) return;
    await fetch("/api/vote/films", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setFilms(films.filter((f) => f.id !== id));
  }

  const grouped = GROUPS.map((g) => ({ group: g, films: films.filter((f) => f.group === g) }));

  return (
    <div>
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm mb-6">
        <div className="font-semibold text-slate-900 mb-4">Add Film</div>
        <div className="grid gap-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Film Title *</label>
            <input
              className="w-full h-10 px-3 rounded-md border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter film title"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Director (optional)</label>
            <input
              className="w-full h-10 px-3 rounded-md border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
              value={director}
              onChange={(e) => setDirector(e.target.value)}
              placeholder="Director name"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Group</label>
            <select
              className="w-full h-10 px-3 rounded-md border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300 bg-white"
              value={group}
              onChange={(e) => setGroup(e.target.value)}
            >
              {GROUPS.map((g) => (
                <option key={g} value={g}>{g} — {WEEK_LABELS[g]}</option>
              ))}
            </select>
          </div>
        </div>
        {msg && (
          <div className="mt-3 px-3 py-2 rounded-md bg-green-50 border border-green-200 text-sm text-green-700">{msg}</div>
        )}
        <button
          className="mt-4 h-10 px-5 rounded-md bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          onClick={addFilm}
          disabled={saving || !title.trim()}
        >
          {saving ? "Adding…" : "Add Film"}
        </button>
      </div>

      {grouped.map(({ group: g, films: gFilms }) =>
        gFilms.length === 0 ? null : (
          <div key={g} className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <div>
                <span className="font-bold text-slate-900">{g}</span>
                <span className="text-slate-400 text-sm font-normal ml-1">— {WEEK_LABELS[g]}</span>
              </div>
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                {gFilms.length} film{gFilms.length !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="space-y-2">
              {gFilms.map((film) => (
                <div
                  key={film.id}
                  className="flex items-center justify-between bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm"
                >
                  <div>
                    <div className="font-medium text-slate-900 text-sm">{film.title}</div>
                    {film.director && <div className="text-xs text-slate-500">Dir. {film.director}</div>}
                  </div>
                  <button
                    onClick={() => removeFilm(film.id)}
                    className="h-7 px-3 text-xs rounded-md border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>
        )
      )}
    </div>
  );
}

// ─── Voting Control Tab ───────────────────────────────────────────────────────
function VotingTab({
  activeGroups,
  setActiveGroups,
}: {
  activeGroups: string[];
  setActiveGroups: (g: string[]) => void;
}) {
  const [saving, setSaving] = useState<string | null>(null);

  async function toggle(group: string) {
    setSaving(group);
    const updated = activeGroups.includes(group)
      ? activeGroups.filter((g) => g !== group)
      : [...activeGroups, group];
    await fetch("/api/vote/active-groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ groups: updated }),
    });
    setActiveGroups(updated);
    setSaving(null);
  }

  return (
    <div>
      <div className="mb-4 px-4 py-3 rounded-lg bg-blue-50 border border-blue-100 text-sm text-blue-800">
        Toggle each group&apos;s voting on or off. Voters can only rate films in active groups.
      </div>
      <div className="space-y-3">
        {GROUPS.map((group) => {
          const isActive = activeGroups.includes(group);
          return (
            <div
              key={group}
              className="flex items-center justify-between bg-white border border-slate-200 rounded-xl px-5 py-4 shadow-sm"
            >
              <div>
                <div className="font-semibold text-slate-900">{group}</div>
                <div className="text-xs text-slate-500">{WEEK_LABELS[group]}</div>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-medium border ${
                    isActive
                      ? "bg-green-100 text-green-700 border-green-200"
                      : "bg-slate-100 text-slate-500 border-slate-200"
                  }`}
                >
                  {isActive ? "Open" : "Closed"}
                </span>
                <button
                  onClick={() => !saving && toggle(group)}
                  disabled={saving === group}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                    isActive ? "bg-slate-900" : "bg-slate-200"
                  } ${saving === group ? "opacity-50" : ""}`}
                  role="switch"
                  aria-checked={isActive}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                      isActive ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Weekly Codes Tab ─────────────────────────────────────────────────────────
function CodesTab() {
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  async function load() {
    const r = await fetch("/api/vote/weekly-codes");
    setCodes(await r.json());
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function generate(group: string) {
    setGenerating(group);
    const r = await fetch("/api/vote/weekly-codes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "generate", group }),
    });
    const d = await r.json();
    setCodes((prev) => ({ ...prev, [group]: d.code }));
    setGenerating(null);
  }

  function copy(code: string, group: string) {
    navigator.clipboard.writeText(code);
    setCopied(group);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div>
      <div className="mb-4 px-4 py-3 rounded-lg bg-blue-50 border border-blue-100 text-sm text-blue-800">
        One code per week. Announce the code at the event — everyone uses the same code to access voting.
      </div>
      {loading ? (
        <div className="text-center py-12 text-slate-400">Loading…</div>
      ) : (
        <div className="space-y-3">
          {GROUPS.map((group) => {
            const code = codes[group];
            return (
              <div
                key={group}
                className="flex items-center justify-between bg-white border border-slate-200 rounded-xl px-5 py-4 shadow-sm"
              >
                <div>
                  <div className="font-semibold text-slate-900">{group}</div>
                  <div className="text-xs text-slate-500">{WEEK_LABELS[group]}</div>
                </div>
                <div className="flex items-center gap-2">
                  {code ? (
                    <span className="font-mono text-sm font-bold tracking-widest text-slate-800 bg-slate-100 px-3 py-1.5 rounded-md border border-slate-200">
                      {code}
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400 italic">No code set</span>
                  )}
                  {code && (
                    <button
                      onClick={() => copy(code, group)}
                      className="h-8 px-3 text-xs border border-slate-200 rounded-md text-slate-600 hover:bg-slate-50 transition-colors"
                    >
                      {copied === group ? "Copied!" : "Copy"}
                    </button>
                  )}
                  <button
                    onClick={() => generate(group)}
                    disabled={generating === group}
                    className="h-8 px-3 text-xs rounded-md bg-slate-900 text-white hover:bg-slate-800 transition-colors disabled:opacity-40"
                  >
                    {generating === group ? "…" : code ? "Regenerate" : "Generate"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Results Tab ──────────────────────────────────────────────────────────────
function ResultsTab() {
  const [data, setData] = useState<{ results: FilmResult[]; activeGroups: string[] } | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    const r = await fetch("/api/vote/results");
    setData(await r.json());
    setLoading(false);
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, []);

  const grouped = GROUPS.map((g) => ({
    group: g,
    films: (data?.results || []).filter((f) => f.group === g),
    isActive: (data?.activeGroups || []).includes(g),
  })).filter((g) => g.films.length > 0);

  if (loading) return <div className="text-center py-12 text-slate-400">Loading…</div>;

  return (
    <div>
      <p className="text-xs text-slate-400 mb-4">Auto-refreshes every 10 seconds.</p>
      {grouped.map(({ group: g, films, isActive }) => (
        <div key={g} className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-slate-900">{g}</h2>
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-medium border ${
                isActive
                  ? "bg-green-100 text-green-700 border-green-200"
                  : "bg-slate-100 text-slate-500 border-slate-200"
              }`}
            >
              {isActive ? "Voting Open" : "Closed"}
            </span>
          </div>
          <div className="space-y-3">
            {films.map((film) => (
              <div key={film.id} className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="font-semibold text-slate-900">{film.title}</div>
                    {film.director && <div className="text-xs text-slate-500">Dir. {film.director}</div>}
                  </div>
                  <div className="text-right shrink-0 ml-3">
                    <div className="text-2xl font-extrabold text-slate-900 leading-none">
                      {film.avgTotal ?? "—"}
                    </div>
                    <div className="text-xs text-slate-400">/ 30</div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      {film.voteCount} vote{film.voteCount !== 1 ? "s" : ""}
                    </div>
                  </div>
                </div>
                {CATEGORIES.map(({ key, label, color }) => (
                  <div key={key} className="mb-2">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-500">{label}</span>
                      <span className="font-semibold" style={{ color }}>
                        {film[key] ?? "—"} / 10
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${(parseFloat(film[key] || "0") || 0) * 10}%`,
                          background: color,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      ))}
      {grouped.length === 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
          <p className="text-slate-400">No films with votes yet.</p>
        </div>
      )}
    </div>
  );
}

// ─── Main Admin Page ──────────────────────────────────────────────────────────
export default function AdminPage() {
  const [authed, setAuthed] = useState(false);
  const [tab, setTab] = useState("films");
  const [films, setFilms] = useState<Film[]>([]);
  const [activeGroups, setActiveGroups] = useState<string[]>([]);

  useEffect(() => {
    if (sessionStorage.getItem("vote_admin_authed") === "1") setAuthed(true);
  }, []);

  async function loadBase() {
    const [fr, ar] = await Promise.all([
      fetch("/api/vote/films"),
      fetch("/api/vote/active-groups"),
    ]);
    setFilms(await fr.json());
    setActiveGroups(await ar.json());
  }

  useEffect(() => {
    if (authed) loadBase();
  }, [authed]);

  function handleLogin() {
    sessionStorage.setItem("vote_admin_authed", "1");
    setAuthed(true);
  }

  function handleLogout() {
    sessionStorage.removeItem("vote_admin_authed");
    setAuthed(false);
  }

  if (!authed) return <Login onLogin={handleLogin} />;

  const TABS = [
    { id: "films", label: "Films" },
    { id: "voting", label: "Voting" },
    { id: "codes", label: "Weekly Codes" },
    { id: "results", label: "Results" },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Image src="/logo.png" alt="Airport City Church" width={100} height={38} className="object-contain" />
            <span className="text-sm font-semibold text-slate-700 border-l border-slate-200 pl-3">
              Admin
            </span>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="/vote"
              target="_blank"
              className="h-8 px-3 inline-flex items-center text-sm text-slate-600 border border-slate-200 rounded-md hover:bg-slate-50 transition-colors"
            >
              Voter View ↗
            </a>
            <button
              onClick={handleLogout}
              className="h-8 px-3 text-sm text-slate-600 border border-slate-200 rounded-md hover:bg-slate-50 transition-colors"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-6">
        <div className="flex gap-1 mb-6 border-b border-slate-200 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                tab === t.id
                  ? "border-slate-900 text-slate-900"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "films" && <FilmsTab films={films} setFilms={setFilms} />}
        {tab === "voting" && <VotingTab activeGroups={activeGroups} setActiveGroups={setActiveGroups} />}
        {tab === "codes" && <CodesTab />}
        {tab === "results" && <ResultsTab />}
      </div>
    </div>
  );
}
