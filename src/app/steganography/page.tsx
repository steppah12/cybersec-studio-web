"use client";

import { useRef, useState } from "react";

// --- Shared bit helpers (tested previously against known values) ---
function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
function fromHex(hex: string): Uint8Array {
  return new Uint8Array((hex.match(/.{1,2}/g) || []).map((b) => parseInt(b, 16)));
}
function bytesToBits(bytes: Uint8Array): number[] {
  const bits: number[] = [];
  for (let i = 0; i < bytes.length; i++) for (let b = 7; b >= 0; b--) bits.push((bytes[i] >> b) & 1);
  return bits;
}
function bitsToBytes(bits: number[]): Uint8Array {
  const bytes = new Uint8Array(Math.floor(bits.length / 8));
  for (let i = 0; i < bytes.length; i++) {
    let byte = 0;
    for (let b = 0; b < 8; b++) byte = (byte << 1) | bits[i * 8 + b];
    bytes[i] = byte;
  }
  return bytes;
}

// --- Optional AES-GCM encryption of the hidden payload (standalone, passphrase-based — this is a public tool, no login required, so it deliberately does not touch the user's PGP identity from the messaging system) ---
async function deriveAesKey(passphrase: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(passphrase), { name: "PBKDF2" }, false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: enc.encode("cybersec-studio-stego-salt"), iterations: 100000, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}
async function buildPayload(message: string, encrypt: boolean, passphrase: string): Promise<Uint8Array> {
  let payloadBytes: Uint8Array;
  if (encrypt) {
    const key = await deriveAesKey(passphrase);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(message));
    payloadBytes = new Uint8Array(12 + ciphertext.byteLength);
    payloadBytes.set(iv, 0);
    payloadBytes.set(new Uint8Array(ciphertext), 12);
  } else {
    payloadBytes = new TextEncoder().encode(message);
  }
  const lengthHeader = new Uint8Array(4);
  lengthHeader[0] = (payloadBytes.length >>> 24) & 0xff;
  lengthHeader[1] = (payloadBytes.length >>> 16) & 0xff;
  lengthHeader[2] = (payloadBytes.length >>> 8) & 0xff;
  lengthHeader[3] = payloadBytes.length & 0xff;
  const full = new Uint8Array(4 + payloadBytes.length);
  full.set(lengthHeader, 0);
  full.set(payloadBytes, 4);
  return full;
}
async function decodePayload(payloadBytes: Uint8Array, encrypt: boolean, passphrase: string): Promise<string> {
  if (!encrypt) return new TextDecoder().decode(payloadBytes);
  const key = await deriveAesKey(passphrase);
  const iv = payloadBytes.slice(0, 12);
  const ciphertext = payloadBytes.slice(12);
  const plainBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return new TextDecoder().decode(plainBuf);
}

// --- Image LSB (canvas, 3 channels/pixel — alpha untouched) ---
function embedBitsImage(imageData: ImageData, bits: number[]) {
  const data = imageData.data;
  let bitIdx = 0;
  for (let p = 0; p < data.length && bitIdx < bits.length; p += 4) {
    for (let ch = 0; ch < 3 && bitIdx < bits.length; ch++) {
      data[p + ch] = (data[p + ch] & 0xfe) | bits[bitIdx];
      bitIdx++;
    }
  }
}
function extractBitsImage(imageData: ImageData, count: number): number[] {
  const data = imageData.data;
  const bits: number[] = [];
  for (let p = 0; p < data.length && bits.length < count; p += 4) {
    for (let ch = 0; ch < 3 && bits.length < count; ch++) bits.push(data[p + ch] & 1);
  }
  return bits;
}
function allBitsImage(imageData: ImageData): number[] {
  const data = imageData.data;
  const bits: number[] = [];
  for (let p = 0; p < data.length; p += 4) for (let ch = 0; ch < 3; ch++) bits.push(data[p + ch] & 1);
  return bits;
}

// --- Audio LSB (raw WAV bytes after the 44-byte canonical header, 1 bit/byte) ---
const AUDIO_DATA_OFFSET = 44;
function embedBitsAudio(bytes: Uint8Array, bits: number[], offset: number) {
  for (let i = 0; i < bits.length; i++) bytes[offset + i] = (bytes[offset + i] & 0xfe) | bits[i];
}
function extractBitsAudio(bytes: Uint8Array, offset: number, count: number): number[] {
  const bits: number[] = [];
  for (let i = 0; i < count && offset + i < bytes.length; i++) bits.push(bytes[offset + i] & 1);
  return bits;
}
function allBitsAudio(bytes: Uint8Array, offset: number): number[] {
  const bits: number[] = [];
  for (let i = offset; i < bytes.length; i++) bits.push(bytes[i] & 1);
  return bits;
}
function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunkSize)));
  }
  return btoa(binary);
}

// --- Text steganography: zero-width characters or trailing whitespace ---
const ZW0 = "\u200B",
  ZW1 = "\u200C";
function hideInTextZeroWidth(coverText: string, payloadBytes: Uint8Array): string {
  const bits = bytesToBits(payloadBytes);
  const zw = bits.map((b) => (b === 0 ? ZW0 : ZW1)).join("");
  if (coverText.length === 0) return zw;
  return coverText[0] + zw + coverText.slice(1);
}
function extractZwBits(stegoText: string): number[] {
  const bits: number[] = [];
  for (const ch of stegoText) {
    if (ch === ZW0) bits.push(0);
    else if (ch === ZW1) bits.push(1);
  }
  return bits;
}
function hideInWhitespace(coverText: string, payloadBytes: Uint8Array): string {
  const bits = bytesToBits(payloadBytes);
  const coverLines = coverText.split("\n").filter((l) => l.length > 0);
  const lines = coverLines.length > 0 ? [...coverLines] : ["placeholder line"];
  while (lines.length < bits.length) lines.push(...coverLines);
  const out: string[] = [];
  for (let i = 0; i < bits.length; i++) {
    out.push(lines[i].replace(/[ \t]+$/, "") + (bits[i] === 0 ? " " : "\t"));
  }
  return out.join("\n");
}
function extractWhitespaceBits(stegoText: string): number[] {
  const lines = stegoText.split("\n");
  const bits: number[] = [];
  for (const line of lines) {
    const last = line.slice(-1);
    if (last === " ") bits.push(0);
    else if (last === "\t") bits.push(1);
  }
  return bits;
}

// --- Steganalysis: chi-square LSB attack (blind detection, no passphrase needed) ---
interface ChiSquareVerdict {
  chiSquare: number;
  proportionOnes: number;
  suspicious: boolean;
  sampleSize: number;
}
function chiSquareVerdict(bits: number[]): ChiSquareVerdict {
  const ones = bits.reduce((a, b) => a + b, 0);
  const zeros = bits.length - ones;
  const expected = bits.length / 2;
  const chiSquare = Math.pow(ones - expected, 2) / expected + Math.pow(zeros - expected, 2) / expected;
  return { chiSquare, proportionOnes: ones / bits.length, suspicious: chiSquare < 3.84, sampleSize: bits.length };
}
function drawHistogram(canvas: HTMLCanvasElement, byteValues: number[]) {
  const counts = new Array(256).fill(0);
  for (const v of byteValues) counts[v]++;
  const max = Math.max(...counts);
  canvas.width = 256;
  canvas.height = 100;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#f5f5f5";
  ctx.fillRect(0, 0, 256, 100);
  ctx.fillStyle = "#333";
  for (let x = 0; x < 256; x++) {
    const h = max > 0 ? (counts[x] / max) * 96 : 0;
    ctx.fillRect(x, 100 - h, 1, h);
  }
}

type CoverType = "image" | "audio" | "text";
type TextMethod = "zw" | "whitespace";

export default function SteganographyPage() {
  const [coverType, setCoverType] = useState<CoverType>("image");
  const [textMethod, setTextMethod] = useState<TextMethod>("zw");

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const histoCanvasRef = useRef<HTMLCanvasElement>(null);
  const [audioBytes, setAudioBytes] = useState<Uint8Array | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [coverText, setCoverText] = useState(
    "This looks like a totally normal sentence.\nNothing here seems out of the ordinary at all.\nJust an average paragraph about the weather today."
  );
  const [textStegoOutput, setTextStegoOutput] = useState<string | null>(null);

  const [message, setMessage] = useState("");
  const [encrypt, setEncrypt] = useState(false);
  const [passphrase, setPassphrase] = useState("");
  const [extracted, setExtracted] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<ChiSquareVerdict | null>(null);
  const [verdictNote, setVerdictNote] = useState<string | null>(null);

  function clearMessages() {
    setError(null);
    setExtracted(null);
    setVerdict(null);
    setVerdictNote(null);
  }

  function drawPlaceholderImage(canvas: HTMLCanvasElement) {
    canvas.width = 320;
    canvas.height = 200;
    const ctx = canvas.getContext("2d")!;
    const grad = ctx.createLinearGradient(0, 0, 320, 200);
    grad.addColorStop(0, "#2f4a99");
    grad.addColorStop(1, "#5b8cff");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 320, 200);
  }

  function handleImageFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !canvasRef.current) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = canvasRef.current!;
        canvas.width = img.width;
        canvas.height = img.height;
        canvas.getContext("2d")!.drawImage(img, 0, 0);
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  }

  function handleAudioFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const bytes = new Uint8Array(reader.result as ArrayBuffer);
      const isRiff = bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46;
      const isWave = bytes[8] === 0x57 && bytes[9] === 0x41 && bytes[10] === 0x56 && bytes[11] === 0x45;
      if (!isRiff || !isWave) {
        setError("Not a canonical WAV file (missing RIFF/WAVE header). This tool assumes a standard 44-byte PCM WAV header.");
        return;
      }
      setAudioBytes(bytes);
      setAudioUrl("data:audio/wav;base64," + bytesToBase64(bytes));
    };
    reader.readAsArrayBuffer(file);
  }

  async function handleHide() {
    clearMessages();
    if (!message) {
      setError("Enter a message to hide first.");
      return;
    }
    if (encrypt && !passphrase) {
      setError("Enter a passphrase for encryption.");
      return;
    }
    let full: Uint8Array;
    try {
      full = await buildPayload(message, encrypt, passphrase);
    } catch (e) {
      setError("Encryption failed: " + e);
      return;
    }
    const bits = bytesToBits(full);

    if (coverType === "image") {
      const canvas = canvasRef.current!;
      const ctx = canvas.getContext("2d")!;
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      if (bits.length > canvas.width * canvas.height * 3) {
        setError("Message too large for this image's capacity.");
        return;
      }
      embedBitsImage(imageData, bits);
      ctx.putImageData(imageData, 0, 0);
    } else if (coverType === "audio") {
      if (!audioBytes) {
        setError("Load a WAV file first.");
        return;
      }
      if (bits.length > audioBytes.length - AUDIO_DATA_OFFSET) {
        setError("Message too large for this audio file's capacity.");
        return;
      }
      const updated = new Uint8Array(audioBytes);
      embedBitsAudio(updated, bits, AUDIO_DATA_OFFSET);
      setAudioBytes(updated);
      setAudioUrl("data:audio/wav;base64," + bytesToBase64(updated));
    } else {
      const stegoText = textMethod === "zw" ? hideInTextZeroWidth(coverText, full) : hideInWhitespace(coverText, full);
      setTextStegoOutput(stegoText);
    }
  }

  async function handleExtract() {
    clearMessages();
    let headerBits: number[], maxCapacityBits: number;

    if (coverType === "image") {
      const canvas = canvasRef.current!;
      const ctx = canvas.getContext("2d")!;
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      headerBits = extractBitsImage(imageData, 32);
      maxCapacityBits = canvas.width * canvas.height * 3;
    } else if (coverType === "audio") {
      if (!audioBytes) {
        setError("Load a WAV file first.");
        return;
      }
      headerBits = extractBitsAudio(audioBytes, AUDIO_DATA_OFFSET, 32);
      maxCapacityBits = audioBytes.length - AUDIO_DATA_OFFSET;
    } else {
      const source = textStegoOutput || coverText;
      const bits = textMethod === "zw" ? extractZwBits(source) : extractWhitespaceBits(source);
      if (bits.length < 32) {
        setError("No hidden data found in this text.");
        return;
      }
      headerBits = bits.slice(0, 32);
      maxCapacityBits = bits.length;
    }

    const headerBytes = bitsToBytes(headerBits);
    const payloadLen = (headerBytes[0] << 24) | (headerBytes[1] << 16) | (headerBytes[2] << 8) | headerBytes[3];
    if (payloadLen <= 0 || payloadLen * 8 + 32 > maxCapacityBits) {
      setError("No valid hidden message found.");
      return;
    }

    let allBits: number[];
    if (coverType === "image") {
      const canvas = canvasRef.current!;
      const ctx = canvas.getContext("2d")!;
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      allBits = extractBitsImage(imageData, 32 + payloadLen * 8);
    } else if (coverType === "audio") {
      allBits = extractBitsAudio(audioBytes!, AUDIO_DATA_OFFSET, 32 + payloadLen * 8);
    } else {
      const source = textStegoOutput || coverText;
      allBits = (textMethod === "zw" ? extractZwBits(source) : extractWhitespaceBits(source)).slice(0, 32 + payloadLen * 8);
    }
    const payloadBytes = bitsToBytes(allBits.slice(32));

    try {
      const text = await decodePayload(payloadBytes, encrypt, passphrase);
      setExtracted(text);
    } catch {
      setError("Extraction/decryption failed — wrong passphrase, or no message hidden here.");
    }
  }

  function handleDownload() {
    if (coverType === "image" && canvasRef.current) {
      const link = document.createElement("a");
      link.href = canvasRef.current.toDataURL("image/png");
      link.download = "stego-image.png";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else if (coverType === "audio" && audioBytes) {
      const link = document.createElement("a");
      link.href = "data:audio/wav;base64," + bytesToBase64(audioBytes);
      link.download = "stego-audio.wav";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else if (coverType === "text" && textStegoOutput) {
      const link = document.createElement("a");
      link.href = "data:text/plain;charset=utf-8," + encodeURIComponent(textStegoOutput);
      link.download = "stego-text.txt";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  }

  function handleAnalyze() {
    clearMessages();
    if (coverType === "image") {
      const canvas = canvasRef.current!;
      const ctx = canvas.getContext("2d")!;
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const bits = allBitsImage(imageData);
      const byteValues = Array.from(imageData.data).filter((_, i) => i % 4 !== 3);
      setVerdict(chiSquareVerdict(bits));
      requestAnimationFrame(() => histoCanvasRef.current && drawHistogram(histoCanvasRef.current, byteValues));
    } else if (coverType === "audio") {
      if (!audioBytes) {
        setError("Load a WAV file first.");
        return;
      }
      const bits = allBitsAudio(audioBytes, AUDIO_DATA_OFFSET);
      setVerdict(chiSquareVerdict(bits));
      requestAnimationFrame(() => histoCanvasRef.current && drawHistogram(histoCanvasRef.current, Array.from(audioBytes.slice(AUDIO_DATA_OFFSET))));
    } else {
      const source = textStegoOutput || coverText;
      const zwCount = (source.match(/[\u200B\u200C]/g) || []).length;
      if (textMethod === "zw") {
        setVerdictNote(
          zwCount > 0
            ? `Found ${zwCount} invisible zero-width characters — a direct, deterministic signal of hidden data.`
            : "No zero-width characters found — no evidence of this technique in this text."
        );
      } else {
        const lines = source.split("\n");
        const trailing = lines.filter((l) => l.endsWith(" ") || l.endsWith("\t")).length;
        setVerdictNote(
          `${trailing} of ${lines.length} lines end in trailing whitespace. ${
            trailing > lines.length * 0.5 ? "That consistent pattern is a strong signal of hidden data." : "No strong pattern detected."
          }`
        );
      }
    }
  }

  return (
    <main className="page" style={{ paddingTop: 40 }}>
      <a href="/">&larr; Back</a>
      <h1>Steganography</h1>
      <p className="section-intro">
        Hide data using LSB (least-significant-bit) embedding in images or audio, or invisible-character tricks in
        plain text. The same Analyze button also runs blind steganalysis (no passphrase needed) to detect whether a
        file already has something hidden in it.
      </p>

      <div className="btn-row">
        {(["image", "audio", "text"] as const).map((t) => (
          <button
            key={t}
            onClick={() => {
              setCoverType(t);
              clearMessages();
              if (t === "image" && canvasRef.current) drawPlaceholderImage(canvasRef.current);
            }}
            className={`btn-toggle${coverType === t ? " active" : ""}`}
          >
            {t === "audio" ? "Audio (WAV)" : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      <div className="card">
        {coverType === "image" && (
          <>
            <label className="field">
              <span>Cover image (optional &mdash; a placeholder generates if you skip this)</span>
              <input type="file" accept="image/*" onChange={handleImageFile} />
            </label>
            <div className="canvas-frame">
              <canvas
                ref={(el) => {
                  if (el && el.width === 0) drawPlaceholderImage(el);
                }}
              />
            </div>
          </>
        )}

        {coverType === "audio" && (
          <>
            <label className="field">
              <span>Cover audio (WAV, 16-bit PCM)</span>
              <input type="file" accept=".wav,audio/wav,audio/x-wav" onChange={handleAudioFile} />
            </label>
            {audioUrl && <audio controls src={audioUrl} style={{ width: "100%" }} />}
          </>
        )}

        {coverType === "text" && (
          <>
            <div className="btn-row">
              <button onClick={() => setTextMethod("zw")} className={`btn-toggle${textMethod === "zw" ? " active" : ""}`}>
                Zero-Width Chars
              </button>
              <button onClick={() => setTextMethod("whitespace")} className={`btn-toggle${textMethod === "whitespace" ? " active" : ""}`}>
                Whitespace (line-end)
              </button>
            </div>
            <label className="field">
              <span>Cover text</span>
              <textarea value={coverText} onChange={(e) => setCoverText(e.target.value)} rows={4} />
            </label>
            {textStegoOutput && (
              <label className="field">
                <span>Stego text (contains the hidden data)</span>
                <textarea readOnly value={textStegoOutput} rows={4} style={{ fontSize: 12 }} />
              </label>
            )}
          </>
        )}

        <label className="field">
          <span>Secret message</span>
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={2} />
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, fontSize: 13, color: "var(--text-secondary)" }}>
          <input type="checkbox" checked={encrypt} onChange={(e) => setEncrypt(e.target.checked)} style={{ width: "auto" }} />
          Encrypt with AES-256-GCM before hiding
        </label>
        {encrypt && (
          <label className="field">
            <span>Passphrase</span>
            <input type="password" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} />
          </label>
        )}

        <div className="btn-row">
          <button onClick={handleHide} className="btn-primary">
            Hide message
          </button>
          <button onClick={handleExtract} className="btn-secondary">
            Extract message
          </button>
          <button onClick={handleDownload} className="btn-secondary">
            Download file
          </button>
          <button onClick={handleAnalyze} className="btn-secondary">
            Analyze for hidden data
          </button>
        </div>

        {error && (
          <div className="readout tone-error">
            <div className="readout-value" style={{ color: "var(--error)" }}>{error}</div>
          </div>
        )}
        {extracted && (
          <div className="readout tone-success">
            <div className="readout-label"><span className="readout-dot success" />Extracted message</div>
            <div className="readout-value">{extracted}</div>
          </div>
        )}
        {verdict && (
          <div className={`readout ${verdict.suspicious ? "tone-warn" : "tone-success"}`}>
            <div className="readout-label">
              <span className={`readout-dot ${verdict.suspicious ? "warn" : "success"}`} />
              {verdict.suspicious ? "Likely contains hidden data" : "No strong evidence of hidden data"}
            </div>
            <div className="readout-value" style={{ marginBottom: 8 }}>
              Chi-square = {verdict.chiSquare.toFixed(3)}, {(verdict.proportionOnes * 100).toFixed(1)}% of sampled LSBs = 1 (sample size:{" "}
              {verdict.sampleSize})
            </div>
            <canvas ref={histoCanvasRef} style={{ maxWidth: "100%", borderRadius: 4 }} />
            <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8, marginBottom: 0 }}>
              Below ~3.84 means the LSB distribution is statistically indistinguishable from random &mdash; consistent
              with embedded/encrypted data at high capacity. This is a simplified version of the classic chi-square
              steganalysis attack: most reliable near full capacity, and can miss small partial-capacity messages.
            </p>
          </div>
        )}
        {verdictNote && (
          <div className="readout">
            <div className="readout-value">{verdictNote}</div>
          </div>
        )}
      </div>

      <div className="note">
        <b style={{ color: "var(--text-primary)" }}>Not implemented yet, and why:</b> video steganography needs a real
        video codec pipeline (frame extraction, re-encoding without destroying hidden bits) &mdash; a browser tool can
        extract a single frame and treat it like an image, but that isn&apos;t genuine video steganography, and
        re-encoding almost always destroys LSB data the same way JPEG recompression destroys image LSB watermarks
        (see the Watermarking module). This is a planned future module, not something faked with a partial
        implementation here.
      </div>
    </main>
  );
}
