"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

interface InboxMessage {
  id: string;
  from: string;
  createdAt: string;
  plaintext?: string;
  file?: { filename: string; bytesBase64: string };
  signatureValid?: boolean;
  error?: string;
}

function fileToDataUrl(filename: string, bytesBase64: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  const mimeMap: Record<string, string> = {
    png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp",
    mp3: "audio/mpeg", wav: "audio/wav", mp4: "video/mp4", pdf: "application/pdf",
  };
  const mime = mimeMap[ext] || "application/octet-stream";
  return `data:${mime};base64,${bytesBase64}`;
}
function isImageFile(filename: string): boolean {
  return /\.(png|jpe?g|gif|webp)$/i.test(filename);
}

export default function DashboardPage() {
  const [username, setUsername] = useState<string | null>(null);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [recipient, setRecipient] = useState("");
  const [message, setMessage] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [inbox, setInbox] = useState<InboxMessage[]>([]);
  const router = useRouter();

  useEffect(() => {
    (async () => {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login?redirectTo=/dashboard");
        return;
      }
      const { data: profile } = await supabase.from("profiles").select("username, public_key_armored").eq("id", user.id).single();
      if (profile) {
        setUsername(profile.username);
        setPublicKey(profile.public_key_armored);
      }
    })();
  }, [router]);

  async function handleSend() {
    if (!message && !file) {
      setStatus("Write a message or attach a file first.");
      return;
    }
    setStatus(file ? "Encrypting file + sending..." : "Encrypting + sending...");

    let fileBase64: string | undefined;
    let fileName: string | undefined;
    if (file) {
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      fileBase64 = btoa(binary);
      fileName = file.name;
    }

    const res = await fetch("/api/messages/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipientUsername: recipient, message, password, fileBase64, fileName }),
    });
    const data = await res.json();
    setStatus(res.ok ? "Sent." : "Error: " + data.error);
    if (res.ok) {
      setMessage("");
      setFile(null);
    }
  }

  async function handleLoadInbox() {
    setStatus("Decrypting inbox...");
    const res = await fetch("/api/messages/inbox", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const data = await res.json();
    if (res.ok) {
      setInbox(data.messages);
      setStatus(null);
    } else {
      setStatus("Error: " + data.error);
    }
  }

  return (
    <main className="page" style={{ paddingTop: 40, maxWidth: 700 }}>
      <h1>Dashboard</h1>
      {username && (
        <p style={{ fontSize: 13.5 }}>
          Logged in as <b style={{ color: "var(--text-primary)" }}>{username}</b> &middot;{" "}
          <a href="/crypto">Go to Crypto tools &rarr;</a> &middot; <a href="/vault">Password Vault &rarr;</a>
        </p>
      )}

      {publicKey && (
        <details className="card">
          <summary style={{ cursor: "pointer", fontSize: 13.5, fontWeight: 500 }}>
            My public key (share this with others so they can message you)
          </summary>
          <textarea readOnly value={publicKey} rows={6} className="mono" style={{ fontSize: 11, marginTop: 10 }} />
        </details>
      )}

      <div className="note">
        Your account password is asked for below only to unlock your private key in memory for that one operation —
        it is never stored, and the unlocked key never leaves the server.
      </div>
      <label className="field">
        <span>Your account password (needed to sign/decrypt)</span>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>

      <h2>Send a message or file</h2>
      <div className="card">
        <label className="field">
          <span>Recipient username</span>
          <input value={recipient} onChange={(e) => setRecipient(e.target.value)} />
        </label>
        <label className="field">
          <span>Message (leave blank if only sending a file)</span>
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} />
        </label>
        <label className="field">
          <span>Attach a file instead (image, document, audio, video — encrypted the same way as text)</span>
          <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        </label>
        {file && <p style={{ fontSize: 12 }}>Selected: {file.name} ({(file.size / 1024).toFixed(1)} KB)</p>}
        <button onClick={handleSend} className="btn-primary">Encrypt &amp; send</button>
      </div>

      <h2>Inbox</h2>
      <button onClick={handleLoadInbox} className="btn-secondary" style={{ marginBottom: 14 }}>
        Decrypt inbox
      </button>
      {status && <p style={{ fontSize: 13 }}>{status}</p>}
      {inbox.map((m) => (
        <div key={m.id} className="card">
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>
            From <b style={{ color: "var(--text-secondary)" }}>{m.from}</b> &middot; {new Date(m.createdAt).toLocaleString()}
          </div>
          {m.error ? (
            <div className="readout tone-error">
              <div className="readout-value" style={{ color: "var(--error)" }}>{m.error}</div>
            </div>
          ) : m.file ? (
            <>
              <p style={{ fontSize: 13 }}>
                Sent a file: <b style={{ color: "var(--text-primary)" }}>{m.file.filename}</b>
              </p>
              {isImageFile(m.file.filename) && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={fileToDataUrl(m.file.filename, m.file.bytesBase64)}
                  alt={m.file.filename}
                  style={{ maxWidth: "100%", borderRadius: 6, marginBottom: 10, border: "1px solid var(--border)" }}
                />
              )}
              <a href={fileToDataUrl(m.file.filename, m.file.bytesBase64)} download={m.file.filename} className="btn-secondary" style={{ display: "inline-block" }}>
                Download {m.file.filename}
              </a>
              <div style={{ marginTop: 10 }}>
                <span className={`badge ${m.signatureValid ? "badge-success" : "badge-error"}`}>
                  {m.signatureValid ? "Signature verified" : "Signature invalid"}
                </span>
              </div>
            </>
          ) : (
            <>
              <div className="readout">
                <div className="readout-value">{m.plaintext}</div>
              </div>
              <div style={{ marginTop: 10 }}>
                <span className={`badge ${m.signatureValid ? "badge-success" : "badge-error"}`}>
                  {m.signatureValid ? "Signature verified" : "Signature invalid"}
                </span>
              </div>
            </>
          )}
        </div>
      ))}
    </main>
  );
}
