export default function Home() {
  return (
    <main className="page">
      <div className="hero">
        <h1>A digital security workbench</h1>
        <p>
          Cryptography, PKI, steganography, watermarking, and forensics — with real user accounts and real
          OpenPGP-compatible messaging. Every tool below runs with no account needed.
        </p>
      </div>

      <div className="module-grid">
        <a href="/crypto" className="module-card">
          <div className="module-card-icon" style={{ background: "var(--accent-dim)", color: "var(--accent)" }}>
            {"{ }"}
          </div>
          <h3>Crypto</h3>
          <p>Hashing, classical ciphers, cryptanalysis, Diffie-Hellman, RSA &amp; ECDSA.</p>
        </a>
        <a href="/steganography" className="module-card">
          <div className="module-card-icon" style={{ background: "var(--warm-dim)", color: "var(--warm)" }}>
            &#9673;
          </div>
          <h3>Steganography</h3>
          <p>Hide and detect data in images, audio, and text.</p>
        </a>
        <a href="/watermarking" className="module-card">
          <div className="module-card-icon" style={{ background: "var(--success-dim)", color: "var(--success)" }}>
            &#10022;
          </div>
          <h3>Watermarking</h3>
          <p>Visible &amp; invisible marks, PSNR analysis, robustness testing.</p>
        </a>
        <a href="/forensics" className="module-card">
          <div className="module-card-icon" style={{ background: "var(--error-dim)", color: "var(--error)" }}>
            &#9906;
          </div>
          <h3>Forensics</h3>
          <p>Auto-solve unknown ciphers and encodings, ranked by confidence.</p>
        </a>
        <a href="/password-tools" className="module-card">
          <div className="module-card-icon" style={{ background: "var(--accent-dim)", color: "var(--accent)" }}>
            &#128273;
          </div>
          <h3>Password Tools</h3>
          <p>Strength analysis, crack-time estimates, and a real brute-force demo.</p>
        </a>
      </div>
    </main>
  );
}
