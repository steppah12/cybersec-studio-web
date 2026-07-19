"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, username, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Signup failed");
        return;
      }
      router.push("/login?justSignedUp=1");
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page page-narrow" style={{ paddingTop: 60 }}>
      <h1>Create your account</h1>
      <p className="section-intro">
        Signing up generates your permanent public/private key pair automatically. Your private key is encrypted
        with a key derived from your password and never leaves the server in unlocked form.
      </p>
      <div className="card">
        <form onSubmit={handleSubmit}>
          <label className="field">
            <span>Email</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label className="field">
            <span>Username (how others find you)</span>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              pattern="[a-zA-Z0-9_.-]{3,32}"
              title="3-32 characters: letters, numbers, underscore, dot, or hyphen"
            />
          </label>
          <label className="field">
            <span>Password</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
          </label>
          {error && (
            <div className="readout tone-error" style={{ marginBottom: 14 }}>
              <div className="readout-value" style={{ color: "var(--error)" }}>{error}</div>
            </div>
          )}
          <button type="submit" disabled={busy} className="btn-primary" style={{ width: "100%" }}>
            {busy ? "Creating account + keys..." : "Sign up"}
          </button>
        </form>
      </div>
      <p style={{ fontSize: 13.5, textAlign: "center" }}>
        Already have an account? <a href="/login">Log in</a>
      </p>
    </main>
  );
}
