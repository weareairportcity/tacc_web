"use client";

import { useState } from "react";
import { Loader2, Calendar, Music } from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import Image from "next/image";

type AdminRole = "bookings" | "songs" | "both";

export default function AdminLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showChooser, setShowChooser] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      const { data: authData, error: authError } =
        await supabase.auth.signInWithPassword({ email, password });

      if (authError) {
        setError(authError.message);
        return;
      }

      if (!authData.user) {
        setError("Login failed. Please try again.");
        return;
      }

      // Look up the user's admin role
      const { data: roleData, error: roleError } = await supabase
        .from("admin_roles")
        .select("role")
        .eq("user_id", authData.user.id)
        .single();

      if (roleError || !roleData) {
        // No role assigned — allow access as "both" by default
        // (backward compatible with existing admin users who don't have a role row yet)
        setShowChooser(true);
        return;
      }

      const role = roleData.role as AdminRole;

      if (role === "bookings") {
        router.push("/admin");
        router.refresh();
      } else if (role === "songs") {
        router.push("/admin/songs");
        router.refresh();
      } else {
        // role === "both"
        setShowChooser(true);
      }
    } catch (err) {
      setError("Login failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const navigateTo = (path: string) => {
    router.push(path);
    router.refresh();
  };

  // ─── Chooser Screen ──────────────────────────────────────────────
  if (showChooser) {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 w-full max-w-md">
          <div className="text-center mb-8">
            <div className="flex justify-center mb-4">
              <Image
                src="/logo.png"
                alt="TACC Logo"
                width={48}
                height={48}
                className="object-contain"
              />
            </div>
            <h1 className="text-2xl font-bold text-slate-900">
              Welcome Back
            </h1>
            <p className="text-sm text-slate-500 mt-2">
              Choose which admin portal to open
            </p>
          </div>

          <div className="space-y-3">
            <button
              onClick={() => navigateTo("/admin")}
              className="w-full flex items-center gap-4 p-4 rounded-xl border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-all group text-left"
            >
              <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center group-hover:bg-blue-100 transition-colors">
                <Calendar className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900">
                  Manage Bookings
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Appointments, blackout dates & calendar
                </p>
              </div>
            </button>

            <button
              onClick={() => navigateTo("/admin/songs")}
              className="w-full flex items-center gap-4 p-4 rounded-xl border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-all group text-left"
            >
              <div className="w-12 h-12 rounded-xl bg-purple-50 flex items-center justify-center group-hover:bg-purple-100 transition-colors">
                <Music className="w-6 h-6 text-purple-600" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900">
                  Manage Songs
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Song of the Week catalog & uploads
                </p>
              </div>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Login Form ──────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-slate-900">Admin Portal</h1>
          <p className="text-sm text-slate-500 mt-2">
            Sign in to manage your portal
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent text-sm text-slate-900"
              placeholder="admin@theairportcitychurch.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent text-sm text-slate-900"
              placeholder="••••••••"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 rounded-lg bg-[#0f172a] text-white font-medium text-sm transition-colors hover:bg-slate-800 disabled:opacity-50 mt-4"
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin mx-auto" />
            ) : (
              "Sign In"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
