"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";

const GROUPS = ["Group 1", "Group 2", "Group 3", "Group 4", "Pastors Group"];
const CATEGORIES = [
  { key: "avgActing", label: "Acting", color: "#a78bfa" },
  { key: "avgConcept", label: "Concept", color: "#60a5fa" },
  { key: "avgQuality", label: "Quality", color: "#34d399" },
] as const;

type FilmResult = {
  id: string;
  title: string;
  director: string;
  group: string;
  voteCount: number;
  avgActing: string | null;
  avgConcept: string | null;
  avgQuality: string | null;
  avgTotal: string | null;
};

function ScoreBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${(value / 10) * 100}%`, background: color }}
      />
    </div>
  );
}

export default function ResultsPage() {
  const [data, setData] = useState<{ results: FilmResult[]; activeGroups: string[] } | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    const r = await fetch("/api/vote/results");
    const d = await r.json();
    setData(d);
    setLoading(false);
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);

  const grouped = GROUPS.map((g) => ({
    group: g,
    films: (data?.results || []).filter((f) => f.group === g),
    isActive: (data?.activeGroups || []).includes(g),
  })).filter((g) => g.films.length > 0);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Image src="/logo.png" alt="Airport City Church" width={100} height={38} className="object-contain" />
            <span className="text-sm font-semibold text-slate-700 border-l border-slate-200 pl-3">
              Live Results
            </span>
          </div>
          <Link
            href="/vote"
            className="h-8 px-3 inline-flex items-center text-sm text-slate-600 border border-slate-200 rounded-md hover:bg-slate-50 transition-colors"
          >
            ← Vote
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        <p className="text-xs text-slate-400 mb-6">Auto-refreshes every 15 seconds.</p>

        {loading ? (
          <div className="text-center py-16 text-slate-400">Loading results…</div>
        ) : grouped.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-12 text-center shadow-sm">
            <div className="text-4xl mb-3">🎬</div>
            <p className="text-slate-500">No films with votes yet.</p>
          </div>
        ) : (
          grouped.map(({ group, films, isActive }) => (
            <div key={group} className="mb-8">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-bold text-slate-900 text-lg">{group}</h2>
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${
                    isActive
                      ? "bg-green-100 text-green-700 border-green-200"
                      : "bg-slate-100 text-slate-500 border-slate-200"
                  }`}
                >
                  {isActive ? "Voting Open" : "Closed"}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {films.map((film) => (
                  <div key={film.id} className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <div className="font-semibold text-slate-900">{film.title}</div>
                        {film.director && (
                          <div className="text-sm text-slate-500 mt-0.5">Dir. {film.director}</div>
                        )}
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
                      <div key={key} className="mb-3">
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-slate-500">{label}</span>
                          <span className="font-semibold" style={{ color }}>
                            {film[key] ?? "—"} / 10
                          </span>
                        </div>
                        <ScoreBar value={parseFloat(film[key] || "0") || 0} color={color} />
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </main>
    </div>
  );
}
