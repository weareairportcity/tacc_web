import Link from "next/link";

export default function ResultsPage() {
  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-4">
      <div className="text-center">
        <p className="text-slate-500 text-sm">Results are not publicly available.</p>
        <Link
          href="/vote"
          className="mt-4 inline-block text-sm text-slate-900 underline underline-offset-2"
        >
          Back to voting
        </Link>
      </div>
    </div>
  );
}
