import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth";
import {
  canAccessPanelTrail,
  getPanelTrail,
  isRole,
} from "@/lib/permissions";

function buildLoginRedirect(request: NextRequest, tenantId: string) {
  const login = new URL("/login", request.url);
  login.searchParams.set("tenantId", tenantId);
  login.searchParams.set(
    "returnUrl",
    `${request.nextUrl.pathname}${request.nextUrl.search}`,
  );
  return NextResponse.redirect(login);
}

function isPanelPath(pathname: string): boolean {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length < 2) {
    return false;
  }
  return parts[1] === "panel";
}

export async function middleware(request: NextRequest) {
  try {
    const { pathname } = request.nextUrl;

    if (!isPanelPath(pathname)) {
      return NextResponse.next();
    }

    const segments = pathname.split("/").filter(Boolean);
    const tenantId = segments[0];
    if (!tenantId) {
      return NextResponse.next();
    }

    const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (!token) {
      return buildLoginRedirect(request, tenantId);
    }

    const session = await verifySessionToken(token);
    if (!session || !isRole(session.role)) {
      return buildLoginRedirect(request, tenantId);
    }

    if (session.tenantId !== tenantId) {
      return buildLoginRedirect(request, tenantId);
    }

    const trail = getPanelTrail(pathname, tenantId);
    if (!canAccessPanelTrail(session.role, trail)) {
      const fallback = new URL(`/${tenantId}/panel`, request.url);
      return NextResponse.redirect(fallback);
    }

    const res = NextResponse.next();
    res.headers.set("x-tenant-id", tenantId);
    res.headers.set("x-user-role", session.role);
    return res;
  } catch (error) {
    console.error("[middleware]", error);
    const { pathname } = request.nextUrl;
    if (isPanelPath(pathname)) {
      const parts = pathname.split("/").filter(Boolean);
      const tenantId = parts[0] ?? "demo";
      return buildLoginRedirect(request, tenantId);
    }
    return NextResponse.next();
  }
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
