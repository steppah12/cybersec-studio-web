export default function Home() {
  return (
    <main style={{ maxWidth: 600, margin: "80px auto", fontFamily: "sans-serif", textAlign: "center" }}>
      <h1>CyberSec Studio</h1>
      <p style={{ color: "#666" }}>Cryptography, PKI, steganography, watermarking, and forensics — with real user accounts and real OpenPGP-compatible messaging.</p>
      <p>
        <a href="/signup" style={{ marginRight: 16 }}>Sign Up</a>
        <a href="/login">Log In</a>
      </p>
    </main>
  );
}
