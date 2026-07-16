import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Routes that require a real, verified session. Everything NOT listed here
 * (crypto, steganography, watermarking, forensics, the homepage, login/signup)
 * is a public tool and never touches auth at all — per the project's core
 * philosophy: only gate what genuinely needs identity.
 */
const PROTECTED_PREFIXES = ["/dashboard", "/messages", "/contacts", "/settings", "/api/messages"];

function isProtected(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix + "/"));
}

export async function middleware(request: NextRequest) {
  const response = NextResponse.next({ request });

  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const pathname = request.nextUrl.pathname;

  if (!isProtected(pathname)) {
    // Public tool route — deliberately do not even call getUser() here.
    // No session check, no cookie refresh dependency, nothing that could
    // ever turn into an accidental login requirement later.
    return response;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Not logged in" }, { status: 401 });
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Run on everything except static assets and Next.js internals, so the
     * public/protected check above is the single source of truth rather
     * than needing to be duplicated per-route.
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
