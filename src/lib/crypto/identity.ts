import * as openpgp from "openpgp";
import { webcrypto } from "crypto";

const crypto = webcrypto as unknown as Crypto;

/**
 * Derives a passphrase used to lock the user's OpenPGP private key from
 * their account password. This is deliberately NOT the raw account
 * password itself, and NOT reversible back to it — it's a one-way KDF
 * output, so even if the derived passphrase leaked, the account password
 * doesn't. Same Argon2id-style principle as the Rust `crypto_engine`
 * (PBKDF2 here since this runs in more environments without native deps;
 * swap for Argon2id via a library like `@node-rs/argon2` in production).
 */
export async function deriveKeyPassphrase(accountPassword: string, username: string): Promise<string> {
  const enc = new TextEncoder();
  // Per-user salt derived from username keeps this from being a shared,
  // guessable derivation across all accounts.
  const salt = enc.encode(`cybersec-studio-key-passphrase:${username}`);
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(accountPassword), { name: "PBKDF2" }, false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 200_000, hash: "SHA-256" }, keyMaterial, 256);
  return Buffer.from(bits).toString("base64");
}

export interface UserIdentity {
  publicKeyArmored: string;
  privateKeyArmoredEncrypted: string;
}

/**
 * Generates a brand-new OpenPGP identity for a user at signup time.
 * The private key is returned already locked with the derived passphrase —
 * it is never held anywhere in unlocked form outside of a short-lived
 * in-memory decrypt during an actual encrypt/decrypt/sign operation later.
 */
export async function generateUserIdentity(username: string, accountPassword: string): Promise<UserIdentity> {
  const keyPassphrase = await deriveKeyPassphrase(accountPassword, username);

  const { privateKey, publicKey } = await openpgp.generateKey({
    type: "curve25519",
    userIDs: [{ name: username, email: `${username}@cybersecstudio.local` }],
    passphrase: keyPassphrase,
    format: "armored",
  });

  return { publicKeyArmored: publicKey, privateKeyArmoredEncrypted: privateKey };
}

/**
 * Unlocks a user's private key in memory for the duration of a single
 * operation (decrypting a received message, signing something). The
 * unlocked key object is never sent to the browser and never persisted —
 * callers must discard it after use.
 */
export async function unlockPrivateKey(privateKeyArmoredEncrypted: string, accountPassword: string, username: string) {
  const keyPassphrase = await deriveKeyPassphrase(accountPassword, username);
  const lockedKey = await openpgp.readPrivateKey({ armoredKey: privateKeyArmoredEncrypted });
  return openpgp.decryptKey({ privateKey: lockedKey, passphrase: keyPassphrase });
}
