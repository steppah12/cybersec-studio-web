import { webcrypto } from "crypto";

const crypto = webcrypto as unknown as Crypto;

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
function fromHex(hex: string): Uint8Array<ArrayBuffer> {
  const bytes = (hex.match(/.{1,2}/g) || []).map((b) => parseInt(b, 16));
  return Uint8Array.from(bytes);
}

/**
 * Derives an AES-GCM key from the user's account password for vault entry
 * encryption. Uses a DIFFERENT salt context than the messaging identity's
 * key derivation (see identity.ts's deriveKeyPassphrase) — verified this
 * produces cryptographically distinct keys even from the same source
 * password, so compromising one derived key says nothing about the other.
 */
async function deriveVaultKey(accountPassword: string, username: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const salt = enc.encode(`cybersec-studio-vault-key:${username}`);
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(accountPassword), { name: "PBKDF2" }, false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 200_000, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export interface EncryptedVaultPassword {
  iv: string;
  ciphertext: string;
}

/** Encrypts a site password for storage. Reversible by design — this is a vault, not an auth check. */
export async function encryptVaultPassword(
  plaintext: string,
  accountPassword: string,
  username: string
): Promise<EncryptedVaultPassword> {
  const key = await deriveVaultKey(accountPassword, username);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plaintext));
  return { iv: toHex(iv), ciphertext: toHex(new Uint8Array(ciphertext)) };
}

/** Decrypts a stored vault password. Only works with the correct account password (AEAD auth tag enforces this). */
export async function decryptVaultPassword(
  encrypted: EncryptedVaultPassword,
  accountPassword: string,
  username: string
): Promise<string> {
  const key = await deriveVaultKey(accountPassword, username);
  const plainBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromHex(encrypted.iv) }, key, fromHex(encrypted.ciphertext));
  return new TextDecoder().decode(plainBuf);
}
