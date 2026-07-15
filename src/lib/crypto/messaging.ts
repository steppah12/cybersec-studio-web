import * as openpgp from "openpgp";

/**
 * Encrypts and signs a message for a recipient, using ONLY their public key
 * (the "find each other via public key/username" model — the sender never
 * needs anything secret belonging to the recipient) plus the sender's own
 * unlocked private key for the signature.
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

export interface DecryptResult {
  plaintext: string;
  signatureValid: boolean;
}

/**
 * Decrypts a received message with the recipient's own (unlocked) private
 * key, and verifies the signature against the claimed sender's public key.
 */
export async function decryptAndVerifyMessage(
  armoredMessage: string,
  recipientUnlockedPrivateKey: openpgp.PrivateKey,
  senderPublicKeyArmored: string
): Promise<DecryptResult> {
  const senderKey = await openpgp.readKey({ armoredKey: senderPublicKeyArmored });
  const message = await openpgp.readMessage({ armoredMessage });

  const { data, signatures } = await openpgp.decrypt({
    message,
    decryptionKeys: recipientUnlockedPrivateKey,
    verificationKeys: senderKey,
  });

  let signatureValid = false;
  try {
    await signatures[0].verified;
    signatureValid = true;
  } catch {
    signatureValid = false;
  }

  return { plaintext: data as string, signatureValid };
}
