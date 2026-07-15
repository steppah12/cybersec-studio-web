import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { generateUserIdentity } from "@/lib/crypto/identity";

export async function POST(req: NextRequest) {
  const { email, password, username } = await req.json();

  if (!email || !password || !username) {
    return NextResponse.json({ error: "email, password, and username are all required" }, { status: 400 });
  }
  if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(username)) {
    return NextResponse.json(
      { error: "Username must be 3-32 characters: letters, numbers, underscore, dot, or hyphen only" },
      { status: 400 }
    );
  }

  const supabase = await createSupabaseServerClient();

  // 1. Create the actual auth account (Supabase handles password hashing,
  //    session cookies, etc. — we never touch raw password storage).
  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({ email, password });
  if (signUpError || !signUpData.user) {
    return NextResponse.json({ error: signUpError?.message ?? "Signup failed" }, { status: 400 });
  }

  // 2. Generate this user's permanent OpenPGP identity. The private key
  //    comes back already locked — it is never in an unlocked state here.
  let identity;
  try {
    identity = await generateUserIdentity(username, password);
  } catch (e) {
    return NextResponse.json({ error: "Key generation failed: " + (e as Error).message }, { status: 500 });
  }

  // 3. Store the profile: username (how others find this user), the public
  //    key (safe to expose), and the encrypted private key (never decrypted
  //    server-side except transiently during an actual crypto operation).
  const { error: profileError } = await supabase.from("profiles").insert({
    id: signUpData.user.id,
    username,
    public_key_armored: identity.publicKeyArmored,
    private_key_armored_encrypted: identity.privateKeyArmoredEncrypted,
  });

  if (profileError) {
    return NextResponse.json({ error: "Profile creation failed: " + profileError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, username });
}
