"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function logout() {
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
      router.refresh();
    } catch {
      setBusy(false); // on success we navigate away, so only reset on failure
    }
  }

  return (
    <button
      onClick={logout}
      disabled={busy}
      className="inline-flex items-center gap-1.5 text-ink-3 transition hover:text-ink disabled:opacity-60"
    >
      {busy && <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />}
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}
