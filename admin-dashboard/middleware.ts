import { NextRequest, NextResponse } from "next/server";

// ---------------------------------------------------------------------------
// Route protection middleware
// ---------------------------------------------------------------------------
// Blocks access to every admin page unless the visitor has a valid session
// (the `adminToken` cookie set on a successful login). No page content is ever
// served to unauthenticated visitors.
//
// Public/standalone routes that stay accessible WITHOUT a login:
//   - /login           — sign-in page
//   - /privacy-policy  — public legal page (explicit exception)
// ---------------------------------------------------------------------------

const PUBLIC_PATHS = new Set(["/login", "/privacy-policy"]);

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Always let public routes through.
  if (PUBLIC_PATHS.has(pathname)) {
    return NextResponse.next();
  }

  // Protected route: require a session cookie.
  const hasSession = Boolean(request.cookies.get("adminToken")?.value);
  if (!hasSession) {
    const loginUrl = new URL("/login", request.url);
    // Remember where the visitor was heading so login can send them back.
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  // Skip Next.js internals and any file with an extension (images, css, ...).
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};