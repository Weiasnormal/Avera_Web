import { NextResponse, type NextRequest } from "next/server";

import { claimsFromToken, hasSupportedRole, isExpired } from "@/lib/jwt";
import { homePathFor, onboardingPathFor } from "@/lib/routes";

// Route gating for pages. This only steers navigation; the backend still
// authorizes every API call, so a forged cookie gains nothing.

const SESSION_COOKIE = process.env.AVERA_SESSION_COOKIE?.trim() || "avera_session";

const EXAMINER_PREFIXES = ["/dashboard", "/cases", "/examinations", "/stats", "/analysis", "/profile", "/help"];
const ONBOARDING_PATHS = ["/join", "/pending", "/organization/new"];
const GUEST_ONLY_PATHS = ["/sign-in", "/sign-up"];

function matches(pathname: string, prefixes: string[]) {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const claims = token ? claimsFromToken(token) : null;
  const session = claims && !isExpired(claims) && claims.userId && hasSupportedRole(claims.roles) ? claims : null;

  const redirect = (to: string) => NextResponse.redirect(new URL(to, request.url));

  const isAdminRoute = matches(pathname, ["/admin"]);
  const isExaminerRoute = matches(pathname, EXAMINER_PREFIXES);
  const isOnboarding = matches(pathname, ONBOARDING_PATHS);

  if (pathname === "/") {
    if (!session) return redirect("/sign-in");
    return redirect(session.tenantId ? homePathFor(session.role) : onboardingPathFor(session.role));
  }

  if (isAdminRoute || isExaminerRoute || isOnboarding) {
    if (!session) {
      const next = encodeURIComponent(`${pathname}${search}`);
      const response = redirect(`/sign-in?next=${next}`);
      if (token) response.cookies.delete(SESSION_COOKIE);
      return response;
    }
    if (isAdminRoute || isExaminerRoute) {
      if (!session.tenantId) return redirect(onboardingPathFor(session.role));
      if (isAdminRoute && session.role !== "admin") return redirect(homePathFor(session.role));
      if (isExaminerRoute && session.role === "admin") return redirect(homePathFor(session.role));
    }
  }

  if (session?.tenantId && matches(pathname, GUEST_ONLY_PATHS)) {
    return redirect(homePathFor(session.role));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|brand|illustrations|icon.png|favicon.ico).*)"],
};
