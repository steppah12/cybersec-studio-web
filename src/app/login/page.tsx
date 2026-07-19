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
    <main className="page page-narrow" style={{ paddingTop: 60 }}>
      <h1>Log in</h1>
      <div className="card">
        <form onSubmit={handleSubmit}>
          <label className="field">
            <span>Email</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label className="field">
            <span>Password</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          {error && (
            <div className="readout tone-error" style={{ marginBottom: 14 }}>
              <div className="readout-value" style={{ color: "var(--error)" }}>{error}</div>
            </div>
          )}
          <button type="submit" disabled={busy} className="btn-primary" style={{ width: "100%" }}>
            {busy ? "Logging in..." : "Log in"}
          </button>
        </form>
      </div>
      <p style={{ fontSize: 13.5, textAlign: "center" }}>
        No account? <a href="/signup">Sign up</a>
      </p>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="page page-narrow" style={{ paddingTop: 60 }}>Loading...</main>}>
      <LoginForm />
    </Suspense>
  );
}
