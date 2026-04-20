import "server-only";

import { cookies } from "next/headers";
import type { DefaultSession } from "next-auth";
import type { Session } from "next-auth";

import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth";
import type { Role } from "@/lib/permissions";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      tenantId: string;
      role: Role;
      branchId: string | null;
      branchName: string | null;
    } & DefaultSession["user"];
  }
}

/**
 * Sesión server-side con forma compatible con `Session` de NextAuth.
 * Lee el JWT propio (`SESSION_COOKIE_NAME`) emitido en el login de Nuba.
 */
export async function auth(): Promise<Session | null> {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    return null;
  }
  const payload = await verifySessionToken(token);
  if (!payload) {
    return null;
  }
  const expires = new Date();
  expires.setDate(expires.getDate() + 7);
  return {
    expires: expires.toISOString(),
    user: {
      id: payload.sub,
      email: payload.email ?? "",
      tenantId: payload.tenantId,
      role: payload.role,
      branchId: payload.branchId,
      branchName: payload.branchName,
    },
  };
}
