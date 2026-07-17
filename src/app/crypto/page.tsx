"use client";

import { useEffect, useState } from "react";

const ALGO_INFO: Record<string, { strong: boolean; note: string }> = {
  "SHA-256": { strong: true, note: "Current standard, no known practical attacks." },
  "SHA-384": { strong: true, note: "Current standard, larger output than SHA-256." },
  "SHA-512": { strong: true, note: "Current standard, largest common SHA-2 output." },
  "SHA-1": { strong: false, note: "Practical collision attacks demonstrated (SHAttered, 2017). Deprecated for any security use." },
  MD5: { strong: false, note: "Collisions are computationally trivial today. Never use for security, integrity, or password hashing." },
};

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// MD5 hand-implemented since Web Crypto deliberately excludes it as insecure.
// Verified against standard test vectors (md5("abc") etc.) before use.
function md5(input: string): string {
  function rotateLeft(x: number, c: number) {
    return (x << c) | (x >>> (32 - c));
  }
  function toUint32(x: number) {
    return x >>> 0;
  }
  const s = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15,
    21,
  ];
  const K: number[] = [];
  for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296);

  const bytes = new TextEncoder().encode(input);
  const origLenBits = bytes.length * 8;
  const withOne = new Uint8Array(((bytes.length + 8) >> 6) * 64 + 64);
  withOne.set(bytes);
  withOne[bytes.length] = 0x80;
  const totalLen = withOne.length;
  const view = new DataView(withOne.buffer);
  view.setUint32(totalLen - 8, origLenBits >>> 0, true);
  view.setUint32(totalLen - 4, Math.floor(origLenBits / 4294967296), true);

  let a0 = 0x67452301,
    b0 = 0xefcdab89,
    c0 = 0x98badcfe,
    d0 = 0x10325476;

  for (let chunkStart = 0; chunkStart < totalLen; chunkStart += 64) {
    const M: number[] = [];
    for (let j = 0; j < 16; j++) M[j] = view.getUint32(chunkStart + j * 4, true);
    let A = a0,
      B = b0,
      C = c0,
      D = d0;
    for (let i = 0; i < 64; i++) {
      let F: number, g: number;
      if (i < 16) {
        F = (B & C) | (~B & D);
        g = i;
      } else if (i < 32) {
        F = (D & B) | (~D & C);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        F = B ^ C ^ D;
        g = (3 * i + 5) % 16;
      } else {
        F = C ^ (B | ~D);
        g = (7 * i) % 16;
      }
      F = toUint32(F + A + K[i] + M[g]);
      A = D;
      D = C;
      C = B;
      B = toUint32(B + rotateLeft(F, s[i]));
    }
    a0 = toUint32(a0 + A);
    b0 = toUint32(b0 + B);
    c0 = toUint32(c0 + C);
    d0 = toUint32(d0 + D);
  }
  function toHexLE(n: number) {
    const bs = [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];
    return bs.map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  return toHexLE(a0) + toHexLE(b0) + toHexLE(c0) + toHexLE(d0);
}

// --- Classical ciphers ---
function caesarEncrypt(text: string, shift: number) {
  return text.replace(/[a-zA-Z]/g, (c) => {
    const base = c === c.toUpperCase() ? 65 : 97;
    return String.fromCharCode((((c.charCodeAt(0) - base + shift) % 26) + 26) % 26 + base);
  });
}
function caesarDecrypt(text: string, shift: number) {
  return caesarEncrypt(text, -shift);
}
function vigenereEncrypt(text: string, key: string) {
  const k = key.toUpperCase().replace(/[^A-Z]/g, "");
  if (!k) return text;
  let ki = 0;
  return text.replace(/[a-zA-Z]/g, (c) => {
    const base = c === c.toUpperCase() ? 65 : 97;
    const shift = k.charCodeAt(ki % k.length) - 65;
    ki++;
    return String.fromCharCode((((c.charCodeAt(0) - base + shift) % 26) + 26) % 26 + base);
  });
}
function vigenereDecrypt(text: string, key: string) {
  const k = key.toUpperCase().replace(/[^A-Z]/g, "");
  if (!k) return text;
  let ki = 0;
  return text.replace(/[a-zA-Z]/g, (c) => {
    const base = c === c.toUpperCase() ? 65 : 97;
    const shift = k.charCodeAt(ki % k.length) - 65;
    ki++;
    return String.fromCharCode((((c.charCodeAt(0) - base - shift) % 26) + 26) % 26 + base);
  });
}
function xorEncryptHex(text: string, key: string) {
  const bytes = new TextEncoder().encode(text);
  const keyBytes = new TextEncoder().encode(key || "key");
  const out = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) out[i] = bytes[i] ^ keyBytes[i % keyBytes.length];
  return toHex(out);
}
function xorDecryptHex(hexStr: string, key: string) {
  const bytes = new Uint8Array((hexStr.match(/.{1,2}/g) || []).map((b) => parseInt(b, 16)));
  const keyBytes = new TextEncoder().encode(key || "key");
  const out = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) out[i] = bytes[i] ^ keyBytes[i % keyBytes.length];
  return new TextDecoder().decode(out);
}

// --- Frequency analysis cracker (chi-squared, fixed after the earlier reliability bug) ---
const ENGLISH_FREQ: Record<string, number> = {
  A: 8.2, B: 1.5, C: 2.8, D: 4.3, E: 12.7, F: 2.2, G: 2.0, H: 6.1, I: 7.0, J: 0.15, K: 0.77, L: 4.0,
  M: 2.4, N: 6.7, O: 7.5, P: 1.9, Q: 0.095, R: 6.0, S: 6.3, T: 9.1, U: 2.8, V: 0.98, W: 2.4, X: 0.15, Y: 2.0, Z: 0.074,
};
function chiSquaredScore(text: string) {
  const counts: Record<string, number> = {};
  let total = 0;
  for (const ch of text.toUpperCase()) {
    if (ch >= "A" && ch <= "Z") {
      counts[ch] = (counts[ch] || 0) + 1;
      total++;
    }
  }
  let score = 0;
  for (const letter in ENGLISH_FREQ) {
    const observed = counts[letter] || 0;
    const expected = (ENGLISH_FREQ[letter] / 100) * total;
    if (expected > 0) score += Math.pow(observed - expected, 2) / expected;
  }
  return score;
}
function crackCaesarRanked(ciphertext: string) {
  const results = [];
  for (let shift = 0; shift < 26; shift++) {
    const candidate = caesarDecrypt(ciphertext, shift);
    results.push({ shift, chiSq: chiSquaredScore(candidate), plaintext: candidate });
  }
  results.sort((a, b) => a.chiSq - b.chiSq);
  return results;
}

// --- Diffie-Hellman ---
function modPow(base: bigint, exp: bigint, mod: bigint) {
  let result = 1n;
  base = base % mod;
  while (exp > 0n) {
    if (exp % 2n === 1n) result = (result * base) % mod;
    exp = exp / 2n;
    base = (base * base) % mod;
  }
  return result;
}

export default function CryptoPage() {
  // Hashing
  const [hashAlgo, setHashAlgo] = useState("SHA-256");
  const [hashInput, setHashInput] = useState("");
  const [digest, setDigest] = useState<string | null>(null);

  // Classical ciphers
  const [cipherType, setCipherType] = useState<"caesar" | "vigenere" | "xor" | "railfence">("caesar");
  const [cipherText, setCipherText] = useState("Meet me at the old bridge at midnight");
  const [cipherKey, setCipherKey] = useState("7");
  const [cipherResult, setCipherResult] = useState<string | null>(null);

  // Cryptanalysis
  const [crackInput, setCrackInput] = useState("");
  const [crackResults, setCrackResults] = useState<{ shift: number; chiSq: number; plaintext: string }[] | null>(null);
  const [showAllShifts, setShowAllShifts] = useState(false);

  // Diffie-Hellman
  const [dhResult, setDhResult] = useState<{ a: number; b: number; A: bigint; B: bigint; shared: bigint } | null>(null);

  const [handoffNote, setHandoffNote] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const prefill = params.get("prefill");
    if (prefill) {
      setCipherText(prefill);
      setCrackInput(prefill);
      setHandoffNote("Text received from Forensics — pre-filled into Classical Ciphers and Cryptanalysis below.");
    }
  }, []);

  async function handleHash() {
    if (!hashInput) return;
    if (hashAlgo === "MD5") {
      setDigest(md5(hashInput));
    } else {
      const buf = await crypto.subtle.digest(hashAlgo, new TextEncoder().encode(hashInput));
      setDigest(toHex(new Uint8Array(buf)));
    }
  }

  function handleCipherEncrypt() {
    let result: string;
    if (cipherType === "caesar") result = caesarEncrypt(cipherText, parseInt(cipherKey) || 0);
    else if (cipherType === "vigenere") result = vigenereEncrypt(cipherText, cipherKey);
    else if (cipherType === "xor") result = xorEncryptHex(cipherText, cipherKey);
    else {
      const rails = parseInt(cipherKey) || 3;
      const clean = cipherText.replace(/\s/g, "");
      const fence: string[][] = Array.from({ length: rails }, () => []);
      let rail = 0,
        dir = 1;
      for (const ch of clean) {
        fence[rail].push(ch);
        if (rail === 0) dir = 1;
        else if (rail === rails - 1) dir = -1;
        rail += dir;
      }
      result = fence.map((r) => r.join("")).join("");
    }
    setCipherResult(result);
    setCipherText(result); // so clicking Decrypt next operates on this ciphertext, not the old plaintext
  }

  function handleCipherDecrypt() {
    let result: string;
    if (cipherType === "caesar") result = caesarDecrypt(cipherText, parseInt(cipherKey) || 0);
    else if (cipherType === "vigenere") result = vigenereDecrypt(cipherText, cipherKey);
    else if (cipherType === "xor") {
      try {
        result = xorDecryptHex(cipherText.trim(), cipherKey);
      } catch {
        result = "Input must be hex ciphertext.";
      }
    } else {
      const rails = parseInt(cipherKey) || 3;
      const cipher = cipherText.replace(/\s/g, "");
      const pattern: number[] = [];
      let rail = 0,
        dir = 1;
      for (let i = 0; i < cipher.length; i++) {
        pattern.push(rail);
        if (rail === 0) dir = 1;
        else if (rail === rails - 1) dir = -1;
        rail += dir;
      }
      const railCounts = new Array(rails).fill(0);
      for (const r of pattern) railCounts[r]++;
      const railChars: string[][] = [];
      let pos = 0;
      for (let r = 0; r < rails; r++) {
        railChars.push(cipher.slice(pos, pos + railCounts[r]).split(""));
        pos += railCounts[r];
      }
      const railIdx = new Array(rails).fill(0);
      let out = "";
      for (const r of pattern) {
        out += railChars[r][railIdx[r]];
        railIdx[r]++;
      }
      result = out;
    }
    setCipherResult(result);
    setCipherText(result); // same reasoning: keeps Text field in sync with whatever's currently "active"
  }

  function handleCrack() {
    if (!crackInput) return;
    setCrackResults(crackCaesarRanked(crackInput).slice(0, 3));
  }

  function handleDiffieHellman() {
    const p = 23n,
      g = 5n;
    const a = BigInt(Math.floor(Math.random() * 15) + 2);
    const b = BigInt(Math.floor(Math.random() * 15) + 2);
    const A = modPow(g, a, p);
    const B = modPow(g, b, p);
    const shared = modPow(B, a, p);
    setDhResult({ a: Number(a), b: Number(b), A, B, shared });
  }

  return (
    <main style={{ maxWidth: 700, margin: "40px auto", fontFamily: "sans-serif", paddingBottom: 60 }}>
      <a href="/dashboard">&larr; Back to Dashboard</a>
      <h1>Crypto</h1>
      {handoffNote && (
        <p style={{ background: "#e8f5e9", padding: 10, borderRadius: 6, fontSize: 13, color: "#2e7d32" }}>{handoffNote}</p>
      )}

      <h2>Hashing</h2>
      <label style={{ display: "block", marginBottom: 8 }}>
        Algorithm
        <select value={hashAlgo} onChange={(e) => setHashAlgo(e.target.value)} style={{ display: "block", padding: 8, width: "100%" }}>
          <option value="SHA-256">SHA-256</option>
          <option value="SHA-384">SHA-384</option>
          <option value="SHA-512">SHA-512</option>
          <option value="SHA-1">SHA-1 (weak)</option>
          <option value="MD5">MD5 (broken)</option>
        </select>
      </label>
      <label style={{ display: "block", marginBottom: 8 }}>
        Input text
        <textarea value={hashInput} onChange={(e) => setHashInput(e.target.value)} rows={2} style={{ display: "block", width: "100%", padding: 8 }} />
      </label>
      <button onClick={handleHash} style={{ padding: "8px 16px" }}>
        Compute Hash
      </button>
      {!ALGO_INFO[hashAlgo].strong && (
        <p style={{ color: "crimson", fontSize: 13 }}>&#9888; {hashAlgo} is weak: {ALGO_INFO[hashAlgo].note}</p>
      )}
      {digest && (
        <div style={{ background: "#f5f5f5", padding: 12, borderRadius: 6, marginTop: 8, wordBreak: "break-all", fontFamily: "monospace", fontSize: 13 }}>
          {digest}
        </div>
      )}

      <h2 style={{ marginTop: 32 }}>Classical Ciphers</h2>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        {(["caesar", "vigenere", "xor", "railfence"] as const).map((t) => (
          <button
            key={t}
            onClick={() => {
              setCipherType(t);
              setCipherResult(null);
            }}
            style={{ padding: "6px 12px", background: cipherType === t ? "#333" : "#eee", color: cipherType === t ? "#fff" : "#000" }}
          >
            {t === "railfence" ? "Rail Fence" : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>
      <label style={{ display: "block", marginBottom: 8 }}>
        Text
        <textarea value={cipherText} onChange={(e) => setCipherText(e.target.value)} rows={2} style={{ display: "block", width: "100%", padding: 8 }} />
      </label>
      <label style={{ display: "block", marginBottom: 8 }}>
        {cipherType === "caesar" ? "Shift (0-25)" : cipherType === "railfence" ? "Number of rails" : "Key"}
        <input value={cipherKey} onChange={(e) => setCipherKey(e.target.value)} style={{ display: "block", width: "100%", padding: 8 }} />
      </label>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={handleCipherEncrypt} style={{ padding: "8px 16px" }}>
          Encrypt
        </button>
        <button onClick={handleCipherDecrypt} style={{ padding: "8px 16px" }}>
          Decrypt
        </button>
      </div>
      {cipherResult && (
        <>
          <p style={{ fontSize: 12, color: "#666", marginTop: 8, marginBottom: 4 }}>
            Result (also copied into the Text field above — click Decrypt now to round-trip it back):
          </p>
          <div style={{ background: "#f5f5f5", padding: 12, borderRadius: 6, wordBreak: "break-all", fontFamily: "monospace", fontSize: 13 }}>
            {cipherResult}
          </div>
        </>
      )}

      <h2 style={{ marginTop: 32 }}>Cryptanalysis &mdash; Frequency Analysis</h2>
      <p style={{ fontSize: 13, color: "#666" }}>Paste Caesar-ciphertext (no key needed) &mdash; cracks it via letter-frequency scoring.</p>
      <textarea value={crackInput} onChange={(e) => setCrackInput(e.target.value)} rows={2} style={{ display: "block", width: "100%", padding: 8, marginBottom: 8 }} />
      <button onClick={handleCrack} style={{ padding: "8px 16px" }}>
        Crack (Top 3 by Frequency Analysis)
      </button>
      <button onClick={() => setShowAllShifts((v) => !v)} style={{ padding: "8px 16px", marginLeft: 8 }}>
        {showAllShifts ? "Hide All 26 Shifts" : "Show All 26 Shifts (Brute Force)"}
      </button>
      {crackResults && (
        <div style={{ marginTop: 8 }}>
          {crackInput.replace(/[^a-zA-Z]/g, "").length < 40 && (
            <p style={{ color: "#b08900", fontSize: 13 }}>
              &#9888; Only {crackInput.replace(/[^a-zA-Z]/g, "").length} letters &mdash; frequency analysis is unreliable this short. Check all 3 candidates below.
            </p>
          )}
          {crackResults.map((r, i) => (
            <div key={i} style={{ background: "#f5f5f5", padding: 10, borderRadius: 6, marginBottom: 6, fontSize: 13 }}>
              #{i + 1} shift {r.shift} (chi-sq {r.chiSq.toFixed(2)}): {r.plaintext}
            </div>
          ))}
        </div>
      )}
      {showAllShifts && crackInput && (
        <div style={{ marginTop: 12 }}>
          <p style={{ fontSize: 12, color: "#666" }}>
            Every possible shift, no scoring or guessing &mdash; with only 26 possibilities, brute force alone is a
            complete attack. Just read down the list for whichever line looks like real text.
          </p>
          <div style={{ maxHeight: 400, overflowY: "auto", border: "1px solid #ddd", borderRadius: 6 }}>
            {Array.from({ length: 26 }, (_, shift) => (
              <div key={shift} style={{ display: "flex", gap: 8, padding: "6px 10px", borderBottom: "1px solid #eee", fontSize: 13, fontFamily: "monospace" }}>
                <span style={{ color: "#999", minWidth: 28 }}>{shift}</span>
                <span>{caesarDecrypt(crackInput, shift)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <h2 style={{ marginTop: 32 }}>Diffie-Hellman Key Exchange</h2>
      <button onClick={handleDiffieHellman} style={{ padding: "8px 16px" }}>
        Run Exchange
      </button>
      {dhResult && (
        <div style={{ background: "#f5f5f5", padding: 12, borderRadius: 6, marginTop: 8, fontSize: 13, lineHeight: 1.8 }}>
          <div>p=23, g=5 (public)</div>
          <div>Alice's private: {dhResult.a} &mdash; Bob's private: {dhResult.b}</div>
          <div>A = g^a mod p = {dhResult.A.toString()}</div>
          <div>B = g^b mod p = {dhResult.B.toString()}</div>
          <div style={{ fontWeight: 600, marginTop: 6 }}>Shared secret: {dhResult.shared.toString()}</div>
        </div>
      )}
    </main>
  );
}
