import { auth } from "./auth";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const publicRoutes = ["/login", "/register", "/api/auth"];

export default auth((req: NextRequest & { auth: { user?: { orgId?: string } } | null }) => {
  const { pathname } = req.nextUrl;

  // Allow public routes
  if (publicRoutes.some((route) => pathname.startsWith(route))) {
    // If authenticated, redirect away from auth pages
    if (req.auth?.user) {
      if (!req.auth.user.orgId && pathname !== "/onboarding") {
        return NextResponse.redirect(new URL("/onboarding", req.url));
      }
      if (pathname === "/login" || pathname === "/register") {
        return NextResponse.redirect(new URL("/workflows", req.url));
      }
    }
    return NextResponse.next();
  }

  // Allow onboarding for authenticated users without org
  if (pathname === "/onboarding") {
    if (!req.auth?.user) {
      return NextResponse.redirect(new URL("/login", req.url));
    }
    return NextResponse.next();
  }

  // Protect all other routes
  if (!req.auth?.user) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // If user has no org, redirect to onboarding
  if (!req.auth.user.orgId) {
    return NextResponse.redirect(new URL("/onboarding", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
