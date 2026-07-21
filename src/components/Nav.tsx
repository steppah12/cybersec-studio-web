"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const LINKS = [
  { href: "/crypto", label: "Crypto" },
  { href: "/steganography", label: "Steganography" },
  { href: "/watermarking", label: "Watermarking" },
  { href: "/forensics", label: "Forensics" },
  { href: "/password-tools", label: "Password Tools" },
];

export default function Nav() {
  const pathname = usePathname();
  const [username, setUsername] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    (async () => {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase.from("profiles").select("username").eq("id", user.id).single();
        setUsername(profile?.username ?? null);
      }
      setChecked(true);
    })();
  }, []);

  async function handleLogout() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  return (
    <nav className="topnav">
      <div className="topnav-inner">
        <a href="/" className="brand">
          <span className="brand-mark" aria-hidden="true" />
          CyberSec Studio
        </a>
        <div className="nav-links">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} className={`nav-link${pathname === l.href ? " active" : ""}`}>
              {l.label}
            </a>
          ))}
        </div>
        <div className="nav-auth">
          {!checked ? null : username ? (
            <>
              <a href="/vault" className="nav-link">
                Vault
              </a>
              <a href="/dashboard" className="nav-link">
                {username}
              </a>
              <button onClick={handleLogout} className="btn-secondary" style={{ padding: "5px 10px", fontSize: 12.5 }}>
                Log out
              </button>
            </>
          ) : (
            <>
              <a href="/login" className="nav-link">
                Log in
              </a>
              <a href="/signup" className="btn btn-primary" style={{ padding: "5px 12px", fontSize: 12.5 }}>
                Sign up
              </a>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
