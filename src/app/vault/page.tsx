"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

interface VaultEntry {
  id: string;
  siteName: string;
  siteUsername: string | null;
  password?: string;
  error?: string;
  createdAt?: string;
}

export default function VaultPage() {
  const [accountPassword, setAccountPassword] = useState("");
  const [siteName, setSiteName] = useState("");
  const [siteUsername, setSiteUsername] = useState("");
  const [sitePassword, setSitePassword] = useState("");
  const [entries, setEntries] = useState<VaultEntry[]>([]);
  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    (async () => {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) router.push("/login?redirectTo=/vault");
    })();
  }, [router]);

  async function handleAdd() {
    if (!siteName || !sitePassword || !accountPassword) {
      setStatus("Site name, password to store, and your account password are all required.");
      return;
    }
    setStatus("Encrypting + storing...");
    const res = await fetch("/api/vault/add", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ siteName, siteUsername, password: sitePassword, accountPassword }),
    });
    const data = await res.json();
    setStatus(res.ok ? "Stored." : "Error: " + data.error);
    if (res.ok) {
      setSiteName("");
      setSiteUsername("");
      setSitePassword("");
      handleLoad();
    }
  }

  async function handleLoad() {
    if (!accountPassword) {
      setStatus("Enter your account password first to decrypt entries.");
      return;
    }
    setStatus("Decrypting vault...");
    const res = await fetch("/api/vault/list", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountPassword }),
    });
    const data = await res.json();
    if (res.ok) {
      setEntries(data.entries);
      setStatus(null);
    } else {
      setStatus("Error: " + data.error);
    }
  }

  async function handleDelete(entryId: string) {
    const res = await fetch("/api/vault/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entryId }),
    });
    if (res.ok) setEntries((prev) => prev.filter((e) => e.id !== entryId));
  }

  function toggleReveal(id: string) {
    setRevealedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setStatus("Copied to clipboard.");
      setTimeout(() => setStatus(null), 1500);
    } catch {
      setStatus("Could not copy — your browser may be blocking clipboard access.");
    }
  }

  return (
    <main className="page" style={{ paddingTop: 40, maxWidth: 700 }}>
      <a href="/dashboard">&larr; Back to Dashboard</a>
      <h1>Password Vault</h1>
      <p className="section-intro">
        Stored passwords are encrypted (AES-256-GCM), not hashed &mdash; a vault has to give you the real password
        back, which hashing can never do. Your account password unlocks the encryption key in memory only for the
        operation you&apos;re running; it is never stored, and neither is the unlocked key.
      </p>

      <label className="field">
        <span>Your account password (needed to encrypt/decrypt vault entries)</span>
        <input type="password" value={accountPassword} onChange={(e) => setAccountPassword(e.target.value)} />
      </label>

      <h2>Add an Entry</h2>
      <div className="card">
        <label className="field">
          <span>Site / service name</span>
          <input value={siteName} onChange={(e) => setSiteName(e.target.value)} placeholder="e.g. GitHub" />
        </label>
        <label className="field">
          <span>Username on that site (optional)</span>
          <input value={siteUsername} onChange={(e) => setSiteUsername(e.target.value)} />
        </label>
        <label className="field">
          <span>Password to store</span>
          <input type="password" value={sitePassword} onChange={(e) => setSitePassword(e.target.value)} />
        </label>
        <button onClick={handleAdd} className="btn-primary">
          Encrypt &amp; store
        </button>
      </div>

      <h2>Your Vault</h2>
      <button onClick={handleLoad} className="btn-secondary" style={{ marginBottom: 14 }}>
        Decrypt &amp; load entries
      </button>
      {status && <p style={{ fontSize: 13 }}>{status}</p>}

      {entries.map((entry) => (
        <div key={entry.id} className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <b style={{ color: "var(--text-primary)" }}>{entry.siteName}</b>
              {entry.siteUsername && <div style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>{entry.siteUsername}</div>}
            </div>
            <button onClick={() => handleDelete(entry.id)} className="btn-secondary" style={{ fontSize: 12 }}>
              Delete
            </button>
          </div>
          {entry.error ? (
            <div className="readout tone-error" style={{ marginTop: 10 }}>
              <div className="readout-value" style={{ color: "var(--error)" }}>{entry.error}</div>
            </div>
          ) : (
            <div className="readout" style={{ marginTop: 10 }}>
              <div className="readout-value" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>{revealedIds.has(entry.id) ? entry.password : "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022"}</span>
                <span style={{ display: "flex", gap: 10 }}>
                  <button onClick={() => toggleReveal(entry.id)} className="btn-secondary" style={{ fontSize: 11, padding: "4px 8px" }}>
                    {revealedIds.has(entry.id) ? "Hide" : "Reveal"}
                  </button>
                  <button onClick={() => entry.password && copyToClipboard(entry.password)} className="btn-secondary" style={{ fontSize: 11, padding: "4px 8px" }}>
                    Copy
                  </button>
                </span>
              </div>
            </div>
          )}
        </div>
      ))}

      <p style={{ textAlign: "center" }}>
        <a href="/password-tools">Test your master password&apos;s strength &rarr;</a>
      </p>
    </main>
  );
}
