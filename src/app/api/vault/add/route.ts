import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { encryptVaultPassword } from "@/lib/crypto/vault";

export async function POST(req: NextRequest) {
  const { siteName, siteUsername, password, accountPassword } = await req.json();
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not logged in" }, { status: 401 });

  if (!siteName || !password || !accountPassword) {
    return NextResponse.json({ error: "Site name, password, and your account password are all required" }, { status: 400 });
  }

  const { data: profile } = await supabase.from("profiles").select("username").eq("id", user.id).single();
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  let encrypted;
  try {
    encrypted = await encryptVaultPassword(password, accountPassword, profile.username);
  } catch (e) {
    return NextResponse.json({ error: "Encryption failed: " + (e as Error).message }, { status: 500 });
  }

  const { error: insertError } = await supabase.from("vault_entries").insert({
    user_id: user.id,
    site_name: siteName,
    site_username: siteUsername || null,
    encrypted_password_iv: encrypted.iv,
    encrypted_password_ciphertext: encrypted.ciphertext,
  });

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
