import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

// Protect these app routes
export const config = {
  matcher: ["/dashboard/:path*", "/appointments/:path*", "/services/:path*", "/settings/:path*"],
};

export function middleware(req: NextRequest) {
  // Allow login itself
  if (req.nextUrl.pathname.startsWith("/login")) {
    return NextResponse.next();
  }

  // Accept either Supabase auth cookies OR our lightweight session cookie.
  const cookies = req.cookies.getAll();
  const hasSupabaseCookie = cookies.some(c =>
    c.name.includes("-auth-token") || c.name.startsWith("sb-") || c.name.startsWith("supabase")
  );
  const hasCovexSession = cookies.some(c => c.name === "covex_session" && c.value === "1");

  if (!hasSupabaseCookie && !hasCovexSession) {
    const url = new URL("/login", req.url);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}
