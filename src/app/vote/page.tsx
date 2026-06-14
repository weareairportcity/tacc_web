"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";

const CATEGORIES = [
  { key: "acting", label: "Acting" },
  { key: "concept", label: "Concept" },
  { key: "quality", label: "Quality" },
] as const;

type Film = { id: string; title: string; director: string; group: string };

function getOrCreateSessionId(): string {
  let id = localStorage.getItem("vote_session_id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("vote_session_id", id);
  }
  return id;
}

function ScoreSelector({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (n: number) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5 mt-1">
      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
        <button
          key={n}
          onClick={() => onChange(n)}
          className={`w-8 h-8 rounded-md text-sm font-semibold border transition-colors ${
            value === n
              ? "bg-slate-900 text-white border-slate-900"
              : "bg-white text-slate-600 border-slate-200 hover:border-slate-400 hover:bg-slate-50"
          }`}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

function FilmCard({
  film,
  sessionId,
  weeklyCode,
  onVoted,
  alreadyVoted,
}: {
  film: Film;
  sessionId: string;
  weeklyCode: string;
  onVoted: (id: string) => void;
  alreadyVoted: boolean;
}) {
  const [scores, setScores] = useState<{
    acting: number | null;
    concept: number | null;
    quality: number | null;
  }>({ acting: null, concept: null, quality: null });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const allSelected = scores.acting && scores.concept && scores.quality;
  const done = alreadyVoted || success;

  async function submit() {
    if (!allSelected) return;
    setSubmitting(true);
    setError("");
    try {
      const r = await fetch("/api/vote/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          weeklyCode,
          filmId: film.id,
          ...scores,
        }),
      });
      const data = await r.json();
      if (!r.ok) { setError(data.error); return; }
      setSuccess(true);
      onVoted(film.id);
    } catch {
      setError("Network error, please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="font-semibold text-slate-900">{film.title}</div>
          {film.director && (
            <div className="text-sm text-slate-500 mt-0.5">Dir. {film.director}</div>
          )}
        </div>
        {done && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 border border-green-200 shrink-0 ml-2">
            Voted
          </span>
        )}
      </div>

      {done ? (
        <p className="text-sm text-slate-500">Your vote has been recorded. Thank you!</p>
      ) : (
        <>
          {CATEGORIES.map(({ key, label }) => (
            <div key={key} className="mb-4">
              <div className="text-sm font-medium text-slate-700">{label}</div>
              <ScoreSelector
                value={scores[key]}
                onChange={(v) => setScores((s) => ({ ...s, [key]: v }))}
              />
            </div>
          ))}
          {error && (
            <div className="mb-3 px-3 py-2 rounded-md bg-red-50 border border-red-200 text-sm text-red-700">
              {error}
            </div>
          )}
          <button
            onClick={submit}
            disabled={!allSelected || submitting}
            className="w-full h-10 rounded-md bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting ? "Submitting…" : allSelected ? "Submit Vote" : "Select all scores to vote"}
          </button>
        </>
      )}
    </div>
  );
}

export default function VoterPage() {
  const [inputCode, setInputCode] = useState("");
  const [weeklyCode, setWeeklyCode] = useState("");
  const [group, setGroup] = useState("");
  const [films, setFilms] = useState<Film[]>([]);
  const [votedFilms, setVotedFilms] = useState<string[]>([]);
  const [sessionId, setSessionId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const sid = getOrCreateSessionId();
    setSessionId(sid);

    const saved = localStorage.getItem("vote_weekly_code");
    if (saved) loadCode(saved, sid);
  }, []);

  async function loadCode(code: string, sid: string) {
    setLoading(true);
    try {
      const r = await fetch("/api/vote/weekly-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify", code }),
      });
      if (!r.ok) { localStorage.removeItem("vote_weekly_code"); setLoading(false); return; }
      const data = await r.json();

      const [fr, sessionRes] = await Promise.all([
        fetch("/api/vote/films"),
        fetch(`/api/vote/session-votes?sessionId=${sid}`),
      ]);
      const allFilms: Film[] = await fr.json();
      const voted: string[] = await sessionRes.json();

      setGroup(data.group);
      setWeeklyCode(code);
      setFilms(allFilms.filter((f) => f.group === data.group));
      setVotedFilms(voted);
    } catch {
      localStorage.removeItem("vote_weekly_code");
    } finally {
      setLoading(false);
    }
  }

  async function enterCode() {
    const trimmed = inputCode.trim().toUpperCase();
    if (!trimmed || !sessionId) return;
    setLoading(true);
    setError("");
    try {
      const r = await fetch("/api/vote/weekly-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify", code: trimmed }),
      });
      const data = await r.json();
      if (!r.ok) { setError("Invalid code. Please check and try again."); setLoading(false); return; }

      const [fr, sessionRes] = await Promise.all([
        fetch("/api/vote/films"),
        fetch(`/api/vote/session-votes?sessionId=${sessionId}`),
      ]);
      const allFilms: Film[] = await fr.json();
      const voted: string[] = await sessionRes.json();

      localStorage.setItem("vote_weekly_code", trimmed);
      setGroup(data.group);
      setWeeklyCode(trimmed);
      setFilms(allFilms.filter((f) => f.group === data.group));
      setVotedFilms(voted);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (!weeklyCode) {
    if (loading) {
      return (
        <div className="min-h-screen bg-white flex items-center justify-center">
          <div className="text-slate-400 text-sm">Loading…</div>
        </div>
      );
    }
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex flex-col items-center text-center">
            <Image
              src="/logo.png"
              alt="Airport City Church"
              width={140}
              height={52}
              className="object-contain mb-6"
            />
            <h1 className="text-2xl font-bold text-slate-900">Film Voting</h1>
            <p className="text-slate-500 text-sm mt-1">Enter this week&apos;s code to begin</p>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Weekly Code
            </label>
            <input
              className="w-full h-11 px-3 rounded-md border border-slate-200 text-center text-lg font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-slate-300"
              placeholder="e.g. W3XK9A"
              value={inputCode}
              onChange={(e) => setInputCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && enterCode()}
            />
            {error && (
              <div className="mt-3 px-3 py-2 rounded-md bg-red-50 border border-red-200 text-sm text-red-700">
                {error}
              </div>
            )}
            <button
              onClick={enterCode}
              disabled={loading || !inputCode.trim()}
              className="mt-4 w-full h-10 rounded-md bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loading ? "Checking…" : "Enter"}
            </button>
          </div>

          <p className="text-center text-xs text-slate-400 mt-4">
            The code is announced at the event each week.
          </p>

          <div className="mt-6 flex justify-center">
            <Link
              href="/vote/results"
              className="text-sm text-slate-600 underline underline-offset-2 hover:text-slate-900"
            >
              View live results
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Image
              src="/logo.png"
              alt="Airport City Church"
              width={100}
              height={38}
              className="object-contain"
            />
            <span className="text-sm font-semibold text-slate-700 border-l border-slate-200 pl-3">
              {group}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/vote/results"
              className="h-8 px-3 inline-flex items-center text-sm text-slate-600 border border-slate-200 rounded-md hover:bg-slate-50 transition-colors"
            >
              Results
            </Link>
            <button
              onClick={() => { localStorage.removeItem("vote_weekly_code"); setWeeklyCode(""); setGroup(""); setInputCode(""); }}
              className="h-8 px-3 text-sm text-slate-600 border border-slate-200 rounded-md hover:bg-slate-50 transition-colors"
            >
              Exit
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        {films.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-12 text-center shadow-sm">
            <div className="text-4xl mb-3">🕐</div>
            <p className="text-slate-600 font-medium">No films added for this week yet.</p>
            <p className="text-slate-400 text-sm mt-1">Check back soon.</p>
          </div>
        ) : (
          <>
            <div className="mb-6 px-4 py-3 rounded-lg bg-blue-50 border border-blue-100 text-sm text-blue-800">
              Rate each film on <strong>Acting</strong>, <strong>Concept</strong>, and{" "}
              <strong>Quality</strong> — each score out of 10.
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {films.map((film) => (
                <FilmCard
                  key={film.id}
                  film={film}
                  sessionId={sessionId}
                  weeklyCode={weeklyCode}
                  alreadyVoted={votedFilms.includes(film.id)}
                  onVoted={(id) => setVotedFilms((v) => [...v, id])}
                />
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
