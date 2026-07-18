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
    <main style={{ maxWidth: 700, margin: "40px auto", fontFamily: "sans-serif" }}>
      <h1>Dashboard</h1>
      {username && <p>Logged in as <b>{username}</b></p>}
      <p><a href="/crypto">Go to Crypto tools &rarr;</a></p>
      {publicKey && (
        <details style={{ marginBottom: 20 }}>
          <summary>My public key (share this with others so they can message you)</summary>
          <textarea readOnly value={publicKey} rows={6} style={{ width: "100%", fontFamily: "monospace", fontSize: 11 }} />
        </details>
      )}

      <p style={{ fontSize: 13, color: "#666" }}>
        Your account password is asked for below only to unlock your private key in memory for that one
        operation — it is never stored, and the unlocked key never leaves the server.
      </p>
      <label style={{ display: "block", marginBottom: 16 }}>
        Your account password (needed to sign/decrypt)
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} style={{ display: "block", width: "100%", padding: 8 }} />
      </label>

      <h2>Send a Message or File</h2>
      <label style={{ display: "block", marginBottom: 8 }}>
        Recipient username
        <input value={recipient} onChange={(e) => setRecipient(e.target.value)} style={{ display: "block", width: "100%", padding: 8 }} />
      </label>
      <label style={{ display: "block", marginBottom: 8 }}>
        Message (leave blank if only sending a file)
        <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} style={{ display: "block", width: "100%", padding: 8 }} />
      </label>
      <label style={{ display: "block", marginBottom: 8 }}>
        Attach a file instead (image, document, audio, video — encrypted the same way as text)
        <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} style={{ display: "block", marginTop: 4 }} />
      </label>
      {file && <p style={{ fontSize: 12, color: "#666" }}>Selected: {file.name} ({(file.size / 1024).toFixed(1)} KB)</p>}
      <button onClick={handleSend} style={{ padding: "8px 16px" }}>Encrypt &amp; Send</button>

      <h2 style={{ marginTop: 32 }}>Inbox</h2>
      <button onClick={handleLoadInbox} style={{ padding: "8px 16px", marginBottom: 12 }}>Decrypt Inbox</button>
      {status && <p>{status}</p>}
      {inbox.map((m) => (
        <div key={m.id} style={{ border: "1px solid #ddd", borderRadius: 6, padding: 12, marginBottom: 8 }}>
          <div style={{ fontSize: 12, color: "#666" }}>
            From <b>{m.from}</b> &middot; {new Date(m.createdAt).toLocaleString()}
          </div>
          {m.error ? (
            <p style={{ color: "crimson" }}>{m.error}</p>
          ) : m.file ? (
            <>
              <p style={{ fontSize: 13, color: "#666", marginBottom: 6 }}>Sent a file: <b>{m.file.filename}</b></p>
              {isImageFile(m.file.filename) && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={fileToDataUrl(m.file.filename, m.file.bytesBase64)} alt={m.file.filename} style={{ maxWidth: "100%", borderRadius: 6, marginBottom: 6 }} />
              )}
              <a href={fileToDataUrl(m.file.filename, m.file.bytesBase64)} download={m.file.filename} style={{ display: "inline-block", padding: "6px 12px", background: "#eee", borderRadius: 4, fontSize: 13, textDecoration: "none" }}>
                Download {m.file.filename}
              </a>
              <p style={{ fontSize: 12, color: m.signatureValid ? "green" : "crimson", marginTop: 6 }}>
                {m.signatureValid ? "\u2713 Signature verified" : "\u2717 Signature invalid"}
              </p>
            </>
          ) : (
            <>
              <p>{m.plaintext}</p>
              <p style={{ fontSize: 12, color: m.signatureValid ? "green" : "crimson" }}>
                {m.signatureValid ? "\u2713 Signature verified" : "\u2717 Signature invalid"}
              </p>
            </>
          )}
        </div>
      ))}
    </main>
  );
}
