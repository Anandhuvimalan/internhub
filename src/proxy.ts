import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic check only: bounce visitors without a session cookie to /login.
 * Real authorization happens server-side in every page/action/route.
 */
export function proxy(req: NextRequest) {
  if (!req.cookies.has("ih_session")) {
    const url = new URL("/login", req.url);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/mentor/:path*", "/workspace/:path*", "/projects/:path*", "/tasks/:path*", "/teams/:path*", "/reviews/:path*", "/meetings/:path*", "/notifications/:path*", "/performance/:path*"],
};
