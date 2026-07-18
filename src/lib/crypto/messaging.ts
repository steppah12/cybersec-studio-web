import * as openpgp from "openpgp";

/**
 * Encrypts and signs a plain text message for a recipient, using ONLY their
 * public key (the "find each other via public key/username" model) plus the
 * sender's own unlocked private key for the signature.
 */
export async function encryptAndSignMessage(
  plaintext: string,
  recipientPublicKeyArmored: string,
  senderUnlockedPrivateKey: openpgp.PrivateKey
): Promise<string> {
  const recipientKey = await openpgp.readKey({ armoredKey: recipientPublicKeyArmored });
  const message = await openpgp.createMessage({ text: plaintext });
  return openpgp.encrypt({
    message,
    encryptionKeys: recipientKey,
    signingKeys: senderUnlockedPrivateKey,
  }) as Promise<string>;
}

/**
 * Encrypts and signs a FILE (image, document, audio, etc.) for a recipient.
 * Uses OpenPGP's native binary-message support — the filename travels inside
 * the encrypted envelope itself, so the recipient's side can tell "this is a
 * file called X" apart from a plain text message without any extra schema.
 */
export async function encryptAndSignFile(
  fileBytes: Uint8Array,
  filename: string,
  recipientPublicKeyArmored: string,
  senderUnlockedPrivateKey: openpgp.PrivateKey
): Promise<string> {
  const recipientKey = await openpgp.readKey({ armoredKey: recipientPublicKeyArmored });
  const message = await openpgp.createMessage({ binary: fileBytes, filename });
  return openpgp.encrypt({
    message,
    encryptionKeys: recipientKey,
    signingKeys: senderUnlockedPrivateKey,
    format: "armored",
  }) as Promise<string>;
}

export interface DecryptResult {
  /** Present for text messages, absent for file messages. */
  plaintext?: string;
  /** Present for file messages, absent for text messages. */
  file?: { filename: string; bytesBase64: string };
  signatureValid: boolean;
}

/**
 * Decrypts a received message (text or file) with the recipient's own
 * (unlocked) private key, and verifies the signature against the claimed
 * sender's public key. Auto-detects which kind it is — the caller never has
 * to know in advance, mirroring "the recipient should not need to manually
 * select" anything about how the message was constructed.
 */
export async function decryptAndVerifyMessage(
  armoredMessage: string,
  recipientUnlockedPrivateKey: openpgp.PrivateKey,
  senderPublicKeyArmored: string
): Promise<DecryptResult> {
  const senderKey = await openpgp.readKey({ armoredKey: senderPublicKeyArmored });
  const message = await openpgp.readMessage({ armoredMessage });

  const { data, filename, signatures } = await openpgp.decrypt({
    message,
    decryptionKeys: recipientUnlockedPrivateKey,
    verificationKeys: senderKey,
    format: "binary",
  });

  let signatureValid = false;
  try {
    await signatures[0].verified;
    signatureValid = true;
  } catch {
    signatureValid = false;
  }

  const bytes = data as Uint8Array;

  // openpgp.js returns filename as `null` (not `undefined`) for plain text
  // messages — verified directly before writing this, don't assume either way.
  if (filename) {
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    const bytesBase64 = btoa(binary);
    return { file: { filename, bytesBase64 }, signatureValid };
  }

  return { plaintext: new TextDecoder().decode(bytes), signatureValid };
}

