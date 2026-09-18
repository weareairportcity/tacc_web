"use client";

export function LoginCodeBadge({ code }: { code: string }) {
  if (!code) return null;

  return (
    <div className="rounded-lg bg-[#fafaf9] px-4 py-3 text-center" data-login-code={code}>
      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-[#a8a29e]">Your login code</p>
      <p className="mt-1 font-roobert text-3xl font-medium leading-none tracking-[0.28em] text-[#0c0a09]">
        {code}
      </p>
      <p className="mt-2 text-xs text-[#78716c]">On another phone, tap I have a code and type this.</p>
    </div>
  );
}
