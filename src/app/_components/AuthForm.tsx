"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AuthForm() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "something went wrong");
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "something went wrong");
      setBusy(false);
    }
  }

  return (
    <div className="rounded-card border border-border bg-surface p-6 shadow-card">
      <h1 className="font-display text-[1.6rem] font-semibold tracking-tight text-ink">
        {mode === "login" ? "Sign in" : "Create your account"}
      </h1>
      <p className="mt-1.5 text-[14px] text-ink-2">
        {mode === "login" ? "Welcome back to your prep kits." : "Start building tailored interview prep."}
      </p>

      <form onSubmit={submit} className="mt-5 space-y-3">
        <input
          type="email"
          required
          autoComplete="email"
          placeholder="you@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-[10px] border border-border bg-surface p-3 text-sm text-ink outline-none transition placeholder:text-ink-3 focus:border-accent focus:ring-4 focus:ring-accent-soft"
        />
        <input
          type="password"
          required
          minLength={8}
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          placeholder={mode === "login" ? "Password" : "Password (8+ characters)"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-[10px] border border-border bg-surface p-3 text-sm text-ink outline-none transition placeholder:text-ink-3 focus:border-accent focus:ring-4 focus:ring-accent-soft"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="btn-gradient flex w-full items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium text-white disabled:opacity-70"
        >
          {busy && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/70 border-t-transparent" />}
          {busy
            ? mode === "login"
              ? "Signing in…"
              : "Creating account…"
            : mode === "login"
              ? "Sign in"
              : "Create account"}
        </button>
      </form>

      <p className="mt-4 text-center text-[13px] text-ink-3">
        {mode === "login" ? "New here?" : "Already have an account?"}{" "}
        <button
          onClick={() => {
            setMode(mode === "login" ? "signup" : "login");
            setError(null);
          }}
          className="font-medium text-accent transition hover:text-accent-hover"
        >
          {mode === "login" ? "Create an account" : "Sign in"}
        </button>
      </p>
    </div>
  );
}
