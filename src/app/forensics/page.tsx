"use client";

import { useState } from "react";

// --- Scoring helpers (chi-squared already proven reliable on longer text, unreliable under ~40 letters — same lesson from the Crypto module's Caesar cracker) ---
const ENGLISH_FREQ: Record<string, number> = {
  A: 8.2, B: 1.5, C: 2.8, D: 4.3, E: 12.7, F: 2.2, G: 2.0, H: 6.1, I: 7.0, J: 0.15, K: 0.77, L: 4.0,
  M: 2.4, N: 6.7, O: 7.5, P: 1.9, Q: 0.095, R: 6.0, S: 6.3, T: 9.1, U: 2.8, V: 0.98, W: 2.4, X: 0.15, Y: 2.0, Z: 0.074,
};
function chiSquared(text: string): number {
  const counts: Record<string, number> = {};
  let total = 0;
  for (const ch of text.toUpperCase()) {
    if (ch >= "A" && ch <= "Z") {
      counts[ch] = (counts[ch] || 0) + 1;
      total++;
    }
  }
  if (total === 0) return 999999;
  let score = 0;
  for (const letter in ENGLISH_FREQ) {
    const observed = counts[letter] || 0;
    const expected = (ENGLISH_FREQ[letter] / 100) * total;
    if (expected > 0) score += Math.pow(observed - expected, 2) / expected;
  }
  return score;
}
function printableRatio(text: string): number {
  if (text.length === 0) return 0;
  let printable = 0;
  for (const ch of text) {
    const c = ch.charCodeAt(0);
    if (c >= 32 && c <= 126) printable++;
  }
  return printable / text.length;
}
function confidenceLabel(score: number): { label: string; color: string } {
  if (score < 20) return { label: "High confidence", color: "#2e7d32" };
  if (score < 60) return { label: "Medium confidence", color: "#b08900" };
  return { label: "Low confidence", color: "#999" };
}

// --- Deterministic decoders (single output, no keyspace search) ---
function rot13(text: string): string {
  return text.replace(/[a-zA-Z]/g, (c) => {
    const base = c === c.toUpperCase() ? 65 : 97;
    return String.fromCharCode((((c.charCodeAt(0) - base + 13) % 26) + 26) % 26 + base);
  });
}
function atbashDecode(text: string): string {
  return text.replace(/[a-zA-Z]/g, (c) => {
    const base = c === c.toUpperCase() ? 65 : 97;
    return String.fromCharCode(base + (25 - (c.charCodeAt(0) - base)));
  });
}
function tryBase64Decode(text: string): string | null {
  const clean = text.trim();
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(clean) || clean.length % 4 !== 0 || clean.length === 0) return null;
  try {
    const binary = atob(clean);
    return binary;
  } catch {
    return null;
  }
}
function tryHexDecode(text: string): string | null {
  const clean = text.trim().replace(/\s+/g, "");
  if (!/^[0-9a-fA-F]+$/.test(clean) || clean.length % 2 !== 0 || clean.length === 0) return null;
  let out = "";
  for (let i = 0; i < clean.length; i += 2) out += String.fromCharCode(parseInt(clean.slice(i, i + 2), 16));
  return out;
}
function tryBinaryDecode(text: string): string | null {
  const clean = text.trim().replace(/\s+/g, "");
  if (!/^[01]+$/.test(clean) || clean.length % 8 !== 0 || clean.length === 0) return null;
  let out = "";
  for (let i = 0; i < clean.length; i += 8) out += String.fromCharCode(parseInt(clean.slice(i, i + 8), 2));
  return out;
}
const MORSE_MAP: Record<string, string> = {
  ".-": "A", "-...": "B", "-.-.": "C", "-..": "D", ".": "E", "..-.": "F", "--.": "G", "....": "H", "..": "I",
  ".---": "J", "-.-": "K", ".-..": "L", "--": "M", "-.": "N", "---": "O", ".--.": "P", "--.-": "Q", ".-.": "R", "...": "S",
  "-": "T", "..-": "U", "...-": "V", ".--": "W", "-..-": "X", "-.--": "Y", "--..": "Z",
  "-----": "0", ".----": "1", "..---": "2", "...--": "3", "....-": "4", ".....": "5", "-....": "6", "--...": "7", "---..": "8", "----.": "9",
};
function tryMorseDecode(text: string): string | null {
  if (!/^[.\-\s/]+$/.test(text.trim()) || !/[.\-]/.test(text)) return null;
  const words = text.trim().split(/\s*\/\s*|\s{2,}/);
  return words.map((w) => w.trim().split(/\s+/).map((code) => MORSE_MAP[code] || "?").join("")).join(" ");
}
const BACON_ALPHABET = "ABCDEFGHIKLMNOPQRSTUWXYZ";
function tryBaconDecode(text: string): string | null {
  const clean = text.toUpperCase().replace(/[^AB]/g, "");
  if (clean.length < 5 || clean.length % 5 !== 0) return null;
  let out = "";
  for (let i = 0; i + 5 <= clean.length; i += 5) {
    const bits = clean.slice(i, i + 5).replace(/A/g, "0").replace(/B/g, "1");
    const idx = parseInt(bits, 2);
    out += BACON_ALPHABET[idx] || "?";
  }
  return out;
}
function identifyHashLength(text: string): string | null {
  const clean = text.trim();
  if (!/^[0-9a-fA-F]+$/.test(clean)) return null;
  const lengths: Record<number, string> = { 32: "MD5 or MD4", 40: "SHA-1", 56: "SHA-224", 64: "SHA-256", 96: "SHA-384", 128: "SHA-512" };
  return lengths[clean.length] || null;
}

// --- Keyspace-search decoders (brute force + chi-squared ranking) ---
interface RankedCandidate {
  label: string;
  candidate: string;
  score: number;
}
function caesarDecrypt(text: string, shift: number): string {
  return text.replace(/[a-zA-Z]/g, (c) => {
    const base = c === c.toUpperCase() ? 65 : 97;
    return String.fromCharCode((((c.charCodeAt(0) - base - shift) % 26) + 26) % 26 + base);
  });
}
function caesarBruteForce(ciphertext: string): RankedCandidate[] {
  const results: RankedCandidate[] = [];
  for (let shift = 0; shift < 26; shift++) {
    const candidate = caesarDecrypt(ciphertext, shift);
    results.push({ label: `Caesar shift ${shift}`, candidate, score: chiSquared(candidate) });
  }
  return results.sort((a, b) => a.score - b.score);
}
function modInverse(a: number, m: number): number | null {
  a = ((a % m) + m) % m;
  for (let x = 1; x < m; x++) if ((a * x) % m === 1) return x;
  return null;
}
function affineDecode(text: string, a: number, b: number): string | null {
  const aInv = modInverse(a, 26);
  if (aInv === null) return null;
  return text.replace(/[a-zA-Z]/g, (c) => {
    const base = c === c.toUpperCase() ? 65 : 97;
    const y = c.charCodeAt(0) - base;
    return String.fromCharCode(base + (aInv * (y - b + 26 * 26)) % 26);
  });
}
function affineBruteForce(ciphertext: string): RankedCandidate[] {
  const validA = [1, 3, 5, 7, 9, 11, 15, 17, 19, 21, 23, 25];
  const results: RankedCandidate[] = [];
  for (const a of validA) {
    for (let b = 0; b < 26; b++) {
      const candidate = affineDecode(ciphertext, a, b);
      if (candidate) results.push({ label: `Affine a=${a} b=${b}`, candidate, score: chiSquared(candidate) });
    }
  }
  return results.sort((x, y) => x.score - y.score);
}
function xorBruteForce(text: string): RankedCandidate[] {
  const bytes = new TextEncoder().encode(text);
  const results: RankedCandidate[] = [];
  for (let key = 0; key < 256; key++) {
    const out = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) out[i] = bytes[i] ^ key;
    const candidate = new TextDecoder("latin1").decode(out);
    const ratio = printableRatio(candidate);
    if (ratio > 0.8) results.push({ label: `XOR key 0x${key.toString(16).padStart(2, "0")}`, candidate, score: chiSquared(candidate) });
  }
  return results.sort((a, b) => a.score - b.score);
}
function railFenceDecrypt(cipher: string, rails: number): string {
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
  let result = "";
  for (const r of pattern) {
    result += railChars[r][railIdx[r]];
    railIdx[r]++;
  }
  return result;
}
function railFenceBruteForce(ciphertext: string): RankedCandidate[] {
  const results: RankedCandidate[] = [];
  for (let rails = 2; rails <= 10; rails++) {
    const candidate = railFenceDecrypt(ciphertext, rails);
    results.push({ label: `Rail Fence, ${rails} rails`, candidate, score: chiSquared(candidate) });
  }
  return results.sort((a, b) => a.score - b.score);
}

interface DeterministicResult {
  method: string;
  candidate: string;
  confidence: number; // 0-100, higher is better
  note?: string;
}

function shannonEntropyBytes(bytes: Uint8Array): number {
  const counts = new Array(256).fill(0);
  for (let i = 0; i < bytes.length; i++) counts[bytes[i]]++;
  let h = 0;
  for (let c = 0; c < 256; c++) {
    if (counts[c] > 0) {
      const p = counts[c] / bytes.length;
      h -= p * Math.log2(p);
    }
  }
  return h;
}
function detectSignature(bytes: Uint8Array): string | null {
  const sigs: { magic: number[]; type: string }[] = [
    { magic: [0x89, 0x50, 0x4e, 0x47], type: "PNG" },
    { magic: [0xff, 0xd8, 0xff], type: "JPEG" },
    { magic: [0x25, 0x50, 0x44, 0x46], type: "PDF" },
    { magic: [0x50, 0x4b, 0x03, 0x04], type: "ZIP" },
    { magic: [0x7f, 0x45, 0x4c, 0x46], type: "ELF" },
    { magic: [0x52, 0x49, 0x46, 0x46], type: "WAV/AVI (RIFF)" },
  ];
  for (const sig of sigs) {
    if (bytes.length >= sig.magic.length && sig.magic.every((b, i) => bytes[i] === b)) return sig.type;
  }
  return null;
}

export default function ForensicsPage() {
  const [textInput, setTextInput] = useState("");
  const [deterministicResults, setDeterministicResults] = useState<DeterministicResult[]>([]);
  const [caesarResults, setCaesarResults] = useState<RankedCandidate[] | null>(null);
  const [affineResults, setAffineResults] = useState<RankedCandidate[] | null>(null);
  const [xorResults, setXorResults] = useState<RankedCandidate[] | null>(null);
  const [railFenceResults, setRailFenceResults] = useState<RankedCandidate[] | null>(null);
  const [showAllCaesar, setShowAllCaesar] = useState(false);
  const [showAllAffine, setShowAllAffine] = useState(false);
  const [analyzed, setAnalyzed] = useState(false);

  const [fileBytes, setFileBytes] = useState<Uint8Array | null>(null);
  const [fileAnalysis, setFileAnalysis] = useState<{ size: number; entropy: number; signature: string | null } | null>(null);

  const letterCount = textInput.replace(/[^a-zA-Z]/g, "").length;
  const shortTextWarning = letterCount > 0 && letterCount < 40;

  function handleAnalyzeText() {
    setAnalyzed(true);
    const results: DeterministicResult[] = [];

    const b64 = tryBase64Decode(textInput);
    if (b64 !== null) {
      const ratio = printableRatio(b64);
      results.push({ method: "Base64", candidate: b64, confidence: Math.round(ratio * 100), note: ratio < 0.5 ? "Decoded, but result doesn't look like text — may be binary data or a false match." : undefined });
    }
    const hex = tryHexDecode(textInput);
    if (hex !== null) {
      const ratio = printableRatio(hex);
      results.push({ method: "Hex", candidate: hex, confidence: Math.round(ratio * 100), note: ratio < 0.5 ? "Decoded, but result doesn't look like text — may be binary data." : undefined });
    }
    const bin = tryBinaryDecode(textInput);
    if (bin !== null) {
      const ratio = printableRatio(bin);
      results.push({ method: "Binary", candidate: bin, confidence: Math.round(ratio * 100) });
    }
    const morse = tryMorseDecode(textInput);
    if (morse !== null && !morse.includes("?")) {
      results.push({ method: "Morse Code", candidate: morse, confidence: 90 });
    }
    const bacon = tryBaconDecode(textInput);
    if (bacon !== null && !bacon.includes("?")) {
      results.push({ method: "Bacon Cipher", candidate: bacon, confidence: Math.max(0, 100 - chiSquared(bacon)) });
    }
    const hashGuess = identifyHashLength(textInput);
    if (hashGuess) {
      results.push({ method: "Hash identification", candidate: `Looks like ${hashGuess} (hashes can't be reversed — this only identifies the likely algorithm by length)`, confidence: 70 });
    }
    if (/[a-zA-Z]/.test(textInput)) {
      const r13 = rot13(textInput);
      results.push({ method: "ROT13", candidate: r13, confidence: Math.max(0, 100 - chiSquared(r13)) });
      const atb = atbashDecode(textInput);
      results.push({ method: "Atbash", candidate: atb, confidence: Math.max(0, 100 - chiSquared(atb)) });
    }

    setDeterministicResults(results.sort((a, b) => b.confidence - a.confidence));

    if (/[a-zA-Z]/.test(textInput)) {
      setCaesarResults(caesarBruteForce(textInput));
      setAffineResults(affineBruteForce(textInput));
      setRailFenceResults(railFenceBruteForce(textInput.replace(/\s/g, "")));
    } else {
      setCaesarResults(null);
      setAffineResults(null);
      setRailFenceResults(null);
    }
    setXorResults(xorBruteForce(textInput));
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const bytes = new Uint8Array(reader.result as ArrayBuffer);
      setFileBytes(bytes);
      setFileAnalysis({ size: bytes.length, entropy: shannonEntropyBytes(bytes), signature: detectSignature(bytes) });
    };
    reader.readAsArrayBuffer(file);
  }

  return (
    <main className="page" style={{ paddingTop: 40, maxWidth: 860 }}>
      <a href="/">&larr; Back</a>
      <h1>Forensics</h1>
      <p className="section-intro">
        Paste unknown text and this tries every common decoding/cipher method at once, ranks the results by how
        much each candidate looks like real language, and shows its work rather than silently discarding failed
        attempts.
      </p>

      <h2>Text Analysis</h2>
      <div className="card">
        <textarea
          value={textInput}
          onChange={(e) => setTextInput(e.target.value)}
          rows={3}
          placeholder="Paste unknown/encoded/encrypted text here"
          style={{ marginBottom: 10 }}
        />
        <button onClick={handleAnalyzeText} className="btn-primary">
          Analyze
        </button>

        {analyzed && shortTextWarning && (
          <div className="note note-warm" style={{ borderLeftColor: "var(--warm)" }}>
            &#9888; Only {letterCount} letters &mdash; statistical ranking (used for Caesar/Affine/XOR/Rail Fence) is
            unreliable this short. The correct answer may not be ranked #1 &mdash; check several candidates, or use
            &quot;show all&quot; where available.
          </div>
        )}
      </div>

      {analyzed && deterministicResults.length > 0 && (
        <>
          <h3>Direct decodings</h3>
          {deterministicResults.map((r, i) => {
            const conf = confidenceLabel(100 - r.confidence);
            return (
              <div key={i} className="readout">
                <div className="readout-label" style={{ justifyContent: "space-between" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <span className="readout-dot" />
                    <b style={{ color: "var(--text-primary)", textTransform: "none", letterSpacing: 0 }}>{r.method}</b>
                  </span>
                  <span style={{ color: conf.color }}>{conf.label}</span>
                </div>
                <div className="readout-value">{r.candidate}</div>
                {r.note && <div style={{ color: "var(--text-muted)", fontSize: 12, marginTop: 6 }}>{r.note}</div>}
                <a href={`/crypto?prefill=${encodeURIComponent(r.candidate)}`} style={{ fontSize: 12, display: "inline-block", marginTop: 6 }}>
                  Send to Crypto &rarr;
                </a>
              </div>
            );
          })}
        </>
      )}

      {analyzed && caesarResults && (
        <>
          <h3>Caesar cipher (26 possible shifts)</h3>
          {caesarResults.slice(0, 3).map((r, i) => (
            <div key={i} className="readout">
              <div className="readout-label"><span className="readout-dot" />#{i + 1} &mdash; {r.label} (score {r.score.toFixed(1)})</div>
              <div className="readout-value">{r.candidate}</div>
              <a href={`/crypto?prefill=${encodeURIComponent(r.candidate)}`} style={{ fontSize: 12, display: "inline-block", marginTop: 6 }}>
                Send to Crypto &rarr;
              </a>
            </div>
          ))}
          <button onClick={() => setShowAllCaesar((v) => !v)} className="btn-secondary">
            {showAllCaesar ? "Hide all 26" : "Show all 26 shifts"}
          </button>
          {showAllCaesar && (
            <div style={{ maxHeight: 280, overflowY: "auto", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", marginTop: 10 }}>
              {caesarResults.map((r, i) => (
                <div key={i} className="mono" style={{ padding: "6px 12px", borderBottom: "1px solid var(--border)", fontSize: 12.5 }}>
                  {r.label}: {r.candidate}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {analyzed && affineResults && (
        <>
          <h3>Affine cipher (312 valid key combinations)</h3>
          {affineResults.slice(0, 5).map((r, i) => (
            <div key={i} className="readout">
              <div className="readout-label"><span className="readout-dot" />#{i + 1} &mdash; {r.label} (score {r.score.toFixed(1)})</div>
              <div className="readout-value">{r.candidate}</div>
              <a href={`/crypto?prefill=${encodeURIComponent(r.candidate)}`} style={{ fontSize: 12, display: "inline-block", marginTop: 6 }}>
                Send to Crypto &rarr;
              </a>
            </div>
          ))}
          <button onClick={() => setShowAllAffine((v) => !v)} className="btn-secondary">
            {showAllAffine ? "Hide all 312" : "Show all 312 combinations"}
          </button>
          {showAllAffine && (
            <div style={{ maxHeight: 280, overflowY: "auto", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", marginTop: 10 }}>
              {affineResults.map((r, i) => (
                <div key={i} className="mono" style={{ padding: "6px 12px", borderBottom: "1px solid var(--border)", fontSize: 12.5 }}>
                  {r.label}: {r.candidate}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {analyzed && xorResults && xorResults.length > 0 && (
        <>
          <h3>Single-byte XOR</h3>
          {xorResults.slice(0, 5).map((r, i) => (
            <div key={i} className="readout">
              <div className="readout-label"><span className="readout-dot" />#{i + 1} &mdash; {r.label} (score {r.score.toFixed(1)})</div>
              <div className="readout-value">{r.candidate}</div>
              <a href={`/crypto?prefill=${encodeURIComponent(r.candidate)}`} style={{ fontSize: 12, display: "inline-block", marginTop: 6 }}>
                Send to Crypto &rarr;
              </a>
            </div>
          ))}
        </>
      )}

      {analyzed && railFenceResults && (
        <>
          <h3>Rail Fence (2&ndash;10 rails)</h3>
          {railFenceResults.slice(0, 3).map((r, i) => (
            <div key={i} className="readout">
              <div className="readout-label"><span className="readout-dot" />#{i + 1} &mdash; {r.label} (score {r.score.toFixed(1)})</div>
              <div className="readout-value">{r.candidate}</div>
              <a href={`/crypto?prefill=${encodeURIComponent(r.candidate)}`} style={{ fontSize: 12, display: "inline-block", marginTop: 6 }}>
                Send to Crypto &rarr;
              </a>
            </div>
          ))}
        </>
      )}

      <h2>File Analysis</h2>
      <div className="card">
        <label className="field">
          <span>Upload a file</span>
          <input type="file" onChange={handleFileUpload} />
        </label>
        {fileAnalysis && (
          <div className="stat-grid">
            <div className="stat-card">
              <div className="stat-label">Size</div>
              <div className="stat-value">{fileAnalysis.size} B</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Entropy</div>
              <div className="stat-value">{fileAnalysis.entropy.toFixed(2)} bits/B</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Signature</div>
              <div className="stat-value" style={{ fontSize: 14 }}>{fileAnalysis.signature ?? "unrecognized"}</div>
            </div>
          </div>
        )}
      </div>

      <div className="note">
        <b style={{ color: "var(--text-primary)" }}>Not implemented yet, and why:</b> Vigen&egrave;re auto-cracking
        (needs Kasiski examination or index-of-coincidence key-length detection, not just brute force &mdash; the
        keyspace is too large to search directly), and deep image/audio forensics (EXIF metadata, bit-plane
        analysis, histogram visualization beyond the basic entropy/signature check here) need dedicated parsing
        libraries. Planned as follow-up modules rather than approximated here.
      </div>
    </main>
  );
}
