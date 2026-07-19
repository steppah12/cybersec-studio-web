"use client";

import { useRef, useState } from "react";

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
function buildPayload(text: string): Uint8Array {
  const payloadBytes = new TextEncoder().encode(text);
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
async function verifyWatermarkOnCanvas(canvas: HTMLCanvasElement): Promise<string | null> {
  const ctx = canvas.getContext("2d")!;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const headerBits = extractBitsImage(imageData, 32);
  const headerBytes = bitsToBytes(headerBits);
  const payloadLen = (headerBytes[0] << 24) | (headerBytes[1] << 16) | (headerBytes[2] << 8) | headerBytes[3];
  if (payloadLen <= 0 || payloadLen * 8 + 32 > canvas.width * canvas.height * 3) return null;
  const allBits = extractBitsImage(imageData, 32 + payloadLen * 8);
  const payloadBytes = bitsToBytes(allBits.slice(32));
  try {
    return new TextDecoder().decode(payloadBytes);
  } catch {
    return null;
  }
}

// PSNR/MSE — verified earlier against known cases: identical (MSE=0, PSNR=inf),
// 1-bit LSB perturbation (~50dB, imperceptible range), heavy alteration (~3dB, visible range)
function mseArrays(a: number[] | Uint8ClampedArray, b: number[] | Uint8ClampedArray): number {
  let sum = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return sum / n;
}
function psnrArrays(a: number[] | Uint8ClampedArray, b: number[] | Uint8ClampedArray, maxVal: number): number {
  const m = mseArrays(a, b);
  if (m === 0) return Infinity;
  return 10 * Math.log10((maxVal * maxVal) / m);
}

export default function WatermarkingPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [originalPixels, setOriginalPixels] = useState<Uint8ClampedArray | null>(null);
  const [visibleText, setVisibleText] = useState("\u00A9 CyberSec Studio");
  const [invisibleText, setInvisibleText] = useState("owner:jane-doe;id:4471");
  const [verifyResult, setVerifyResult] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<{ mse: number; psnr: number } | null>(null);
  const [robustness, setRobustness] = useState<{ survived: boolean; recovered: string | null } | null>(null);
  const [robustnessRunning, setRobustnessRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function drawDefault(canvas: HTMLCanvasElement) {
    canvas.width = 320;
    canvas.height = 200;
    const ctx = canvas.getContext("2d")!;
    const grad = ctx.createLinearGradient(0, 0, 320, 200);
    grad.addColorStop(0, "#4caf7d");
    grad.addColorStop(1, "#5b8cff");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 320, 200);
    captureOriginal(canvas);
  }
  function captureOriginal(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d")!;
    setOriginalPixels(ctx.getImageData(0, 0, canvas.width, canvas.height).data.slice());
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
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
        captureOriginal(canvas);
        setAnalysis(null);
        setRobustness(null);
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  }

  function handleVisibleWatermark() {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    ctx.font = `bold ${Math.max(12, Math.floor(canvas.width / 16))}px sans-serif`;
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.textAlign = "right";
    ctx.textBaseline = "bottom";
    ctx.fillText(visibleText, canvas.width - 10, canvas.height - 10);
  }

  function handleInvisibleWatermark() {
    setError(null);
    if (!invisibleText) return;
    const full = buildPayload(invisibleText);
    const bits = bytesToBits(full);
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    if (bits.length > canvas.width * canvas.height * 3) {
      setError("Watermark text too long for this image.");
      return;
    }
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    embedBitsImage(imageData, bits);
    ctx.putImageData(imageData, 0, 0);
  }

  async function handleVerify() {
    setError(null);
    const result = await verifyWatermarkOnCanvas(canvasRef.current!);
    setVerifyResult(result ?? "NONE_FOUND");
  }

  function handleAnalyze() {
    setError(null);
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const current = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    if (!originalPixels || originalPixels.length !== current.length) {
      setError("No baseline captured for this image size — reload the image first.");
      return;
    }
    setAnalysis({ mse: mseArrays(originalPixels, current), psnr: psnrArrays(originalPixels, current, 255) });
  }

  function handleRobustnessTest() {
    setRobustnessRunning(true);
    setRobustness(null);
    const canvas = canvasRef.current!;
    const jpegDataUrl = canvas.toDataURL("image/jpeg", 0.7);
    const img = new Image();
    img.onload = async () => {
      const testCanvas = document.createElement("canvas");
      testCanvas.width = img.width;
      testCanvas.height = img.height;
      testCanvas.getContext("2d")!.drawImage(img, 0, 0);
      const result = await verifyWatermarkOnCanvas(testCanvas);
      setRobustness({ survived: !!result, recovered: result });
      setRobustnessRunning(false);
    };
    img.src = jpegDataUrl;
  }

  return (
    <main className="page" style={{ paddingTop: 40 }}>
      <a href="/">&larr; Back</a>
      <h1>Watermarking</h1>
      <p className="section-intro">
        Watermarking protects ownership/integrity, not secrecy &mdash; the opposite goal from steganography. Visible
        watermarks are a plain overlay; invisible ones here are LSB-based and fragile &mdash; any edit breaks them,
        which is useful for tamper detection but doesn&apos;t survive compression by design.
      </p>

      <div className="card">
        <label className="field">
          <span>Image (optional &mdash; a placeholder generates if you skip this)</span>
          <input type="file" accept="image/*" onChange={handleFile} />
        </label>
        <div className="canvas-frame" style={{ marginBottom: 0 }}>
          <canvas
            ref={(el) => {
              canvasRef.current = el;
              if (el && el.width === 0) drawDefault(el);
            }}
          />
        </div>
      </div>

      <h2>Visible Watermark</h2>
      <div className="card">
        <label className="field">
          <span>Watermark text</span>
          <input value={visibleText} onChange={(e) => setVisibleText(e.target.value)} />
        </label>
        <button onClick={handleVisibleWatermark} className="btn-primary">
          Apply visible watermark
        </button>
      </div>

      <h2>Invisible (Fragile) Watermark</h2>
      <div className="card">
        <label className="field">
          <span>Owner / watermark string</span>
          <input value={invisibleText} onChange={(e) => setInvisibleText(e.target.value)} />
        </label>
        <div className="btn-row">
          <button onClick={handleInvisibleWatermark} className="btn-primary">
            Embed invisible watermark
          </button>
          <button onClick={handleVerify} className="btn-secondary">
            Verify watermark
          </button>
        </div>
        {verifyResult && (
          <div className={`readout ${verifyResult === "NONE_FOUND" ? "tone-error" : "tone-success"}`}>
            <div className="readout-value" style={{ color: verifyResult === "NONE_FOUND" ? "var(--error)" : undefined }}>
              {verifyResult === "NONE_FOUND" ? "No valid watermark found on this image." : `Watermark verified: ${verifyResult}`}
            </div>
          </div>
        )}
      </div>

      <h2>Watermark Analysis</h2>
      <div className="card">
        <button onClick={handleAnalyze} className="btn-primary">
          Compare to original (PSNR / MSE)
        </button>
        {analysis && (
          <div className="stat-grid">
            <div className="stat-card">
              <div className="stat-label">MSE</div>
              <div className="stat-value">{analysis.mse.toFixed(4)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">PSNR</div>
              <div className="stat-value">{analysis.psnr === Infinity ? "\u221e" : analysis.psnr.toFixed(2) + " dB"}</div>
            </div>
          </div>
        )}
        {analysis && (
          <p style={{ fontSize: 12.5, color: "var(--text-muted)", margin: 0 }}>
            PSNR above ~40dB is generally imperceptible to the human eye. Below ~30dB, distortion becomes visible.
          </p>
        )}
      </div>

      <h2>Robustness Test</h2>
      <div className="card">
        <p className="section-intro" style={{ marginBottom: 14 }}>
          Re-encodes the current image as JPEG at reduced quality, then tries to verify the invisible watermark. LSB
          watermarking is expected to fail this &mdash; that&apos;s the honest, correct result, and the reason
          production watermarking uses the DCT/DWT domain instead.
        </p>
        <button onClick={handleRobustnessTest} disabled={robustnessRunning} className="btn-primary">
          {robustnessRunning ? "Running..." : "Run JPEG recompression test"}
        </button>
        {robustness && (
          <div className={`readout ${robustness.survived ? "tone-success" : "tone-warn"}`}>
            <div className="readout-label">
              <span className={`readout-dot ${robustness.survived ? "success" : "warn"}`} />
              {robustness.survived ? "Watermark survived JPEG recompression" : "Watermark did NOT survive JPEG recompression"}
            </div>
            <div className="readout-value">
              {robustness.survived
                ? `Recovered: "${robustness.recovered}"`
                : "This is the expected, honest result: LSB embedding lives in the spatial domain, and JPEG's DCT-based lossy compression destroys exactly the low-order bits LSB relies on. Production watermarking embeds in the DCT/DWT domain instead, surviving compression by design, not by luck."}
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="readout tone-error">
          <div className="readout-value" style={{ color: "var(--error)" }}>{error}</div>
        </div>
      )}

      <div className="note">
        <b style={{ color: "var(--text-primary)" }}>Not implemented yet, and why:</b> robust DCT/DWT/SVD watermarking
        (survives compression/cropping/rotation by design), SSIM/NC/BER metrics, and dedicated attack simulations
        (cropping, scaling, blur) need a real frequency-domain transform pipeline that spatial-domain LSB can&apos;t
        provide &mdash; planned as a later module.
      </div>
    </main>
  );
}
