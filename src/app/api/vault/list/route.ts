import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { decryptVaultPassword } from "@/lib/crypto/vault";

export async function POST(req: NextRequest) {
  // POST (not GET) because we need the account password in the body to
  // decrypt entries — never put a password in a URL/query string.
  const { accountPassword } = await req.json();
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not logged in" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("username").eq("id", user.id).single();
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  const { data: entries, error } = await supabase
    .from("vault_entries")
    .select("id, site_name, site_username, encrypted_password_iv, encrypted_password_ciphertext, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const decrypted = [];
  for (const entry of entries ?? []) {
    try {
      const password = await decryptVaultPassword(
        { iv: entry.encrypted_password_iv, ciphertext: entry.encrypted_password_ciphertext },
        accountPassword,
        profile.username
      );
      decrypted.push({
        id: entry.id,
        siteName: entry.site_name,
        siteUsername: entry.site_username,
        password,
        createdAt: entry.created_at,
      });
    } catch {
      decrypted.push({ id: entry.id, siteName: entry.site_name, siteUsername: entry.site_username, error: "Failed to decrypt" });
    }
  }

  return NextResponse.json({ entries: decrypted });
}
