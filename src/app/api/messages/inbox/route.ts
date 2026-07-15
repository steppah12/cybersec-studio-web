import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { unlockPrivateKey } from "@/lib/crypto/identity";
import { decryptAndVerifyMessage } from "@/lib/crypto/messaging";

export async function POST(req: NextRequest) {
  // POST (not GET) because we need the password in the body to unlock the
  // private key \u2014 never put a password in a URL/query string.
  const { password } = await req.json();
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not logged in" }, { status: 401 });

  const { data: myProfile } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  if (!myProfile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  let myKey;
  try {
    myKey = await unlockPrivateKey(myProfile.private_key_armored_encrypted, password, myProfile.username);
  } catch {
    return NextResponse.json({ error: "Could not unlock your private key \u2014 wrong password?" }, { status: 401 });
  }

  const { data: messages } = await supabase
    .from("messages")
    .select("id, encrypted_payload, created_at, sender_id, profiles!messages_sender_id_fkey(username, public_key_armored)")
    .eq("recipient_id", user.id)
    .order("created_at", { ascending: false });

  const decrypted = [];
  for (const msg of messages ?? []) {
    const sender = (msg as any).profiles;
    try {
      const result = await decryptAndVerifyMessage(msg.encrypted_payload, myKey, sender.public_key_armored);
      decrypted.push({
        id: msg.id,
        from: sender.username,
        createdAt: msg.created_at,
        plaintext: result.plaintext,
        signatureValid: result.signatureValid,
      });
    } catch (e) {
      decrypted.push({ id: msg.id, from: sender.username, createdAt: msg.created_at, error: "Failed to decrypt" });
    }
  }

  return NextResponse.json({ messages: decrypted });
}
