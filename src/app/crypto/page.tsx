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
    <main className="page" style={{ paddingTop: 40 }}>
      <a href="/">&larr; Back</a>
      <h1>Crypto</h1>
      {handoffNote && (
        <div className="readout tone-success" style={{ marginBottom: 16 }}>
          <div className="readout-value" style={{ color: "var(--success)" }}>{handoffNote}</div>
        </div>
      )}

      <h2>Hashing</h2>
      <div className="card">
        <label className="field">
          <span>Algorithm</span>
          <select value={hashAlgo} onChange={(e) => setHashAlgo(e.target.value)}>
            <option value="SHA-256">SHA-256</option>
            <option value="SHA-384">SHA-384</option>
            <option value="SHA-512">SHA-512</option>
            <option value="SHA-1">SHA-1 (weak)</option>
            <option value="MD5">MD5 (broken)</option>
          </select>
        </label>
        <label className="field">
          <span>Input text</span>
          <textarea value={hashInput} onChange={(e) => setHashInput(e.target.value)} rows={2} />
        </label>
        <button onClick={handleHash} className="btn-primary">
          Compute hash
        </button>
        {!ALGO_INFO[hashAlgo].strong && (
          <div className="note note-warm" style={{ borderLeftColor: "var(--error)" }}>
            &#9888; {hashAlgo} is weak: {ALGO_INFO[hashAlgo].note}
          </div>
        )}
        {digest && (
          <div className="readout">
            <div className="readout-label"><span className="readout-dot" />Digest</div>
            <div className="readout-value">{digest}</div>
          </div>
        )}
      </div>

      <h2>Classical Ciphers</h2>
      <div className="card">
        <div className="btn-row">
          {(["caesar", "vigenere", "xor", "railfence"] as const).map((t) => (
            <button
              key={t}
              onClick={() => {
                setCipherType(t);
                setCipherResult(null);
              }}
              className={`btn-toggle${cipherType === t ? " active" : ""}`}
            >
              {t === "railfence" ? "Rail Fence" : t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
        <label className="field">
          <span>Text</span>
          <textarea value={cipherText} onChange={(e) => setCipherText(e.target.value)} rows={2} />
        </label>
        <label className="field">
          <span>{cipherType === "caesar" ? "Shift (0-25)" : cipherType === "railfence" ? "Number of rails" : "Key"}</span>
          <input value={cipherKey} onChange={(e) => setCipherKey(e.target.value)} />
        </label>
        <div className="btn-row">
          <button onClick={handleCipherEncrypt} className="btn-primary">
            Encrypt
          </button>
          <button onClick={handleCipherDecrypt} className="btn-secondary">
            Decrypt
          </button>
        </div>
        {cipherResult && (
          <div className="readout">
            <div className="readout-label"><span className="readout-dot" />Result &mdash; also copied into the Text field above, click Decrypt to round-trip it back</div>
            <div className="readout-value">{cipherResult}</div>
          </div>
        )}
      </div>

      <h2>Cryptanalysis &mdash; Frequency Analysis</h2>
      <div className="card">
        <p className="section-intro" style={{ marginBottom: 12 }}>Paste Caesar-ciphertext (no key needed) &mdash; cracks it via letter-frequency scoring.</p>
        <textarea value={crackInput} onChange={(e) => setCrackInput(e.target.value)} rows={2} style={{ marginBottom: 10 }} />
        <div className="btn-row">
          <button onClick={handleCrack} className="btn-primary">
            Crack (top 3 by frequency analysis)
          </button>
          <button onClick={() => setShowAllShifts((v) => !v)} className="btn-secondary">
            {showAllShifts ? "Hide all 26 shifts" : "Show all 26 shifts (brute force)"}
          </button>
        </div>
        {crackResults && (
          <>
            {crackInput.replace(/[^a-zA-Z]/g, "").length < 40 && (
              <div className="note note-warm">
                &#9888; Only {crackInput.replace(/[^a-zA-Z]/g, "").length} letters &mdash; frequency analysis is unreliable this short. Check all 3 candidates below.
              </div>
            )}
            {crackResults.map((r, i) => (
              <div key={i} className="readout">
                <div className="readout-label"><span className="readout-dot" />#{i + 1} &mdash; shift {r.shift} (chi-sq {r.chiSq.toFixed(2)})</div>
                <div className="readout-value">{r.plaintext}</div>
              </div>
            ))}
          </>
        )}
        {showAllShifts && crackInput && (
          <div style={{ marginTop: 12 }}>
            <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
              Every possible shift, no scoring or guessing &mdash; with only 26 possibilities, brute force alone is a
              complete attack. Just read down the list for whichever line looks like real text.
            </p>
            <div style={{ maxHeight: 320, overflowY: "auto", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)" }}>
              {Array.from({ length: 26 }, (_, shift) => (
                <div key={shift} className="mono" style={{ display: "flex", gap: 10, padding: "6px 12px", borderBottom: "1px solid var(--border)", fontSize: 12.5 }}>
                  <span style={{ color: "var(--text-muted)", minWidth: 22 }}>{shift}</span>
                  <span>{caesarDecrypt(crackInput, shift)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <h2>Diffie-Hellman Key Exchange</h2>
      <div className="card">
        <button onClick={handleDiffieHellman} className="btn-primary">
          Run exchange
        </button>
        {dhResult && (
          <div className="readout" style={{ lineHeight: 1.8 }}>
            <div className="readout-value">
              p=23, g=5 (public)<br />
              Alice&apos;s private: {dhResult.a} &mdash; Bob&apos;s private: {dhResult.b}<br />
              A = g^a mod p = {dhResult.A.toString()}<br />
              B = g^b mod p = {dhResult.B.toString()}<br />
              <span style={{ color: "var(--success)", fontWeight: 600 }}>Shared secret: {dhResult.shared.toString()}</span>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
