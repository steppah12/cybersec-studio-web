"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    const redirectTo = searchParams.get("redirectTo");
    router.push(redirectTo && redirectTo.startsWith("/") ? redirectTo : "/dashboard");
  }

  return (
    <main style={{ maxWidth: 420, margin: "80px auto", fontFamily: "sans-serif" }}>
      <h1>Log In</h1>
      <form onSubmit={handleSubmit}>
        <label style={{ display: "block", marginBottom: 12 }}>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{ display: "block", width: "100%", padding: 8, marginTop: 4 }}
          />
        </label>
        <label style={{ display: "block", marginBottom: 12 }}>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={{ display: "block", width: "100%", padding: 8, marginTop: 4 }}
          />
        </label>
        {error && <p style={{ color: "crimson" }}>{error}</p>}
        <button type="submit" disabled={busy} style={{ padding: "10px 20px" }}>
          {busy ? "Logging in..." : "Log In"}
        </button>
      </form>
      <p style={{ fontSize: 14, marginTop: 16 }}>
        No account? <a href="/signup">Sign up</a>
      </p>
    </main>
  );
}

export default function LoginPage() {
  // useSearchParams requires a Suspense boundary for static prerendering —
  // this wrapper is that boundary, with a minimal fallback since the form
  // itself renders almost instantly once client JS loads.
  return (
    <Suspense fallback={<main style={{ maxWidth: 420, margin: "80px auto" }}>Loading...</main>}>
      <LoginForm />
    </Suspense>
  );
}
