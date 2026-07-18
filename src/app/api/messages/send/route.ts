import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { unlockPrivateKey } from "@/lib/crypto/identity";
import { encryptAndSignMessage, encryptAndSignFile } from "@/lib/crypto/messaging";

export async function POST(req: NextRequest) {
  const { recipientUsername, message, password, fileBase64, fileName } = await req.json();
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not logged in" }, { status: 401 });

  if (!message && !fileBase64) {
    return NextResponse.json({ error: "Provide a message or a file to send" }, { status: 400 });
  }

  // Look up the sender's own profile (need username + encrypted private key
  // to sign with) and the recipient's public key (to encrypt with) purely
  // by username, mirroring the assignment's "find each other via username"
  // model.
  const { data: senderProfile } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  const { data: recipientProfile } = await supabase
    .from("profiles")
    .select("id, username, public_key_armored")
    .eq("username", recipientUsername)
    .single();

  if (!senderProfile) return NextResponse.json({ error: "Sender profile not found" }, { status: 404 });
  if (!recipientProfile) return NextResponse.json({ error: "No user with that username" }, { status: 404 });

  // Unlock the sender's private key in memory ONLY for the duration of this
  // signing operation, using the account password they just supplied. The
  // unlocked key is never persisted or sent back to the browser.
  let senderKey;
  try {
    senderKey = await unlockPrivateKey(senderProfile.private_key_armored_encrypted, password, senderProfile.username);
  } catch {
    return NextResponse.json({ error: "Could not unlock your private key \u2014 wrong password?" }, { status: 401 });
  }

  let encryptedPayload: string;
  if (fileBase64) {
    const binary = atob(fileBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    encryptedPayload = await encryptAndSignFile(bytes, fileName || "file", recipientProfile.public_key_armored, senderKey);
  } else {
    encryptedPayload = await encryptAndSignMessage(message, recipientProfile.public_key_armored, senderKey);
  }

  const { error: insertError } = await supabase.from("messages").insert({
    sender_id: user.id,
    recipient_id: recipientProfile.id,
    encrypted_payload: encryptedPayload,
  });

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
