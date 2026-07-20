"use client";

import { useState } from "react";
import { estimateEntropyBits, isCommonPassword, crackTimeEstimates, bruteForce, BruteForceResult } from "@/lib/crypto/passwordStrength";

function strengthLabel(bits: number, common: boolean): { label: string; color: string } {
  if (common) return { label: "Very weak (common password)", color: "var(--error)" };
  if (bits < 28) return { label: "Very weak", color: "var(--error)" };
  if (bits < 40) return { label: "Weak", color: "var(--warm)" };
  if (bits < 60) return { label: "Reasonable", color: "var(--warm)" };
  if (bits < 80) return { label: "Strong", color: "var(--success)" };
  return { label: "Very strong", color: "var(--success)" };
}

const LOWERCASE = "abcdefghijklmnopqrstuvwxyz";
const LOWER_DIGITS = LOWERCASE + "0123456789";

export default function PasswordToolsPage() {
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [bfResult, setBfResult] = useState<BruteForceResult | null>(null);
  const [bfRunning, setBfRunning] = useState(false);
  const [bfError, setBfError] = useState<string | null>(null);

  const entropy = estimateEntropyBits(password);
  const common = password.length > 0 && isCommonPassword(password);
  const strength = password.length > 0 ? strengthLabel(entropy, common) : null;
  const estimates = password.length > 0 ? crackTimeEstimates(password) : [];

  function handleBruteForce() {
    setBfError(null);
    setBfResult(null);
    if (!password) return;
    const lowercaseOnly = /^[a-z]+$/.test(password);
    const lowerDigits = /^[a-z0-9]+$/.test(password);
    if (!lowerDigits) {
      setBfError("Live brute-force demo only supports lowercase letters and digits, up to 6 characters — this is a real, uncapped-cost attack, so it's deliberately limited to what's actually feasible to run in a browser in a few seconds. Try something like \"cat42\" to see it work.");
      return;
    }
    if (password.length > 6) {
      setBfError("Live brute-force demo is capped at 6 characters — beyond that, even this small charset takes longer than makes sense to run live. That cap is itself the point: it shows how fast the cost explodes.");
      return;
    }
    setBfRunning(true);
    setTimeout(() => {
      const charset = lowercaseOnly ? LOWERCASE : LOWER_DIGITS;
      const result = bruteForce(password, charset, password.length);
      setBfResult(result);
      setBfRunning(false);
    }, 50);
  }

  return (
    <main className="page" style={{ paddingTop: 40 }}>
      <a href="/">&larr; Back</a>
      <h1>Password Tools</h1>
      <p className="section-intro">
        Test a password&apos;s real strength &mdash; entropy, common-password detection, and crack-time estimates
        across realistic attack speeds &mdash; then watch a genuine (not simulated) brute-force attack against a
        short test password to see exactly how fast weak passwords fall. Nothing here is stored or sent anywhere;
        this all runs in your browser.
      </p>

      <div className="card">
        <label className="field">
          <span>Password to test</span>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type={show ? "text" : "password"}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setBfResult(null);
                setBfError(null);
              }}
              style={{ flex: 1 }}
            />
            <button onClick={() => setShow((v) => !v)} className="btn-secondary" type="button">
              {show ? "Hide" : "Show"}
            </button>
          </div>
        </label>

        {strength && (
          <div className="readout" style={{ borderColor: strength.color }}>
            <div className="readout-label">
              <span className="readout-dot" style={{ background: strength.color }} />
              <span style={{ color: strength.color }}>{strength.label}</span>
            </div>
            <div className="readout-value" style={{ fontSize: 12.5 }}>
              {entropy.toFixed(1)} bits of entropy ({password.length} characters)
              {common && " \u2014 this exact password appears on common-password lists, so real attackers would try it in the first few thousand guesses regardless of its raw entropy math."}
            </div>
          </div>
        )}
      </div>

      {password.length > 0 && (
        <>
          <h2>Crack Time Estimates</h2>
          <div className="stat-grid">
            {estimates.map((e, i) => (
              <div key={i} className="stat-card">
                <div className="stat-label">{e.label}</div>
                <div className="stat-value" style={{ fontSize: 15 }}>{e.time}</div>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
            These are average-case estimates (half the full keyspace) across three realistic attacker scenarios.
            The huge range between them is the point: the same password can be instant or effectively uncrackable
            depending entirely on what it&apos;s being checked against.
          </p>

          <h2>Live Brute-Force Demo</h2>
          <div className="card">
            <p className="section-intro" style={{ marginBottom: 12 }}>
              This actually runs every combination of the matching charset until it finds your password &mdash; a
              real attack, not a fake progress bar. It only works on short lowercase/digit passwords (&le;6 chars)
              because the cost genuinely explodes past that &mdash; which is itself the demonstration.
            </p>
            <button onClick={handleBruteForce} disabled={bfRunning} className="btn-primary">
              {bfRunning ? "Running..." : "Run real brute-force attack"}
            </button>
            {bfError && (
              <div className="note note-warm" style={{ borderLeftColor: "var(--warm)" }}>{bfError}</div>
            )}
            {bfResult && (
              <div className={`readout ${bfResult.found ? "tone-error" : "tone-success"}`}>
                <div className="readout-label">
                  <span className={`readout-dot ${bfResult.found ? "error" : "success"}`} />
                  {bfResult.found ? "Cracked" : "Not found within the cap"}
                </div>
                <div className="readout-value">
                  {bfResult.found ? `Found "${bfResult.candidate}" ` : ""}
                  in {bfResult.attempts.toLocaleString()} attempts, {bfResult.elapsedMs}ms
                </div>
              </div>
            )}
          </div>
        </>
      )}

      <div className="note">
        This tool tests raw password strength in isolation. It doesn&apos;t check whether a password has appeared
        in a real-world data breach (that needs a service like Have I Been Pwned&apos;s breach-checking API, not
        something this page attempts) &mdash; a password can score well here and still be compromised if it&apos;s
        been leaked elsewhere.
      </div>
    </main>
  );
}
