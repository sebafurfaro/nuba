import { SignJWT, jwtVerify } from "jose";

import type { Role } from "@/lib/permissions";

export const SESSION_COOKIE_NAME =
  process.env.SESSION_COOKIE_NAME ?? "nuba.session";

/** Permisos persistidos en JWT (misma forma que en MySQL `permissions`). */
export type PermissionClaim = {
  resource: string;
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
};

export type SessionPayload = {
  sub: string;
  tenantId: string;
  role: Role;
  email?: string;
  branchId: string | null;
  branchName: string | null;
  permissions: PermissionClaim[];
};

function parsePermissions(raw: unknown): PermissionClaim[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const out: PermissionClaim[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const o = item as Record<string, unknown>;
    if (typeof o.resource !== "string") {
      continue;
    }
    out.push({
      resource: o.resource,
      can_view: Boolean(o.can_view),
      can_create: Boolean(o.can_create),
      can_edit: Boolean(o.can_edit),
      can_delete: Boolean(o.can_delete),
    });
  }
  return out;
}

function getAuthSecretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      "AUTH_SECRET debe estar definido (mín. 16 caracteres). Ejecuta: npx auth secret",
    );
  }
  return new TextEncoder().encode(secret);
}

export async function signSessionToken(
  payload: SessionPayload,
  maxAgeSeconds = 60 * 60 * 24 * 7,
): Promise<string> {
  const key = getAuthSecretKey();
  return new SignJWT({
    tenantId: payload.tenantId,
    role: payload.role,
    email: payload.email,
    branchId: payload.branchId,
    branchName: payload.branchName,
    permissions: payload.permissions,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${maxAgeSeconds}s`)
    .sign(key);
}

export async function verifySessionToken(
  token: string,
): Promise<SessionPayload | null> {
  try {
    const secret = process.env.AUTH_SECRET;
    if (!secret || secret.length < 16) {
      return null;
    }
    const key = new TextEncoder().encode(secret);
    const { payload } = await jwtVerify(token, key, {
      algorithms: ["HS256"],
    });
    const sub = typeof payload.sub === "string" ? payload.sub : null;
    const tenantId =
      typeof payload.tenantId === "string" ? payload.tenantId : null;
    const role = payload.role as Role | undefined;
    const email = typeof payload.email === "string" ? payload.email : undefined;
    const branchId = typeof payload.branchId === "string" ? payload.branchId : null;
    const branchName = typeof payload.branchName === "string" ? payload.branchName : null;
    const permissions = parsePermissions(payload.permissions);
    if (!sub || !tenantId || !role) {
      return null;
    }
    return { sub, tenantId, role, email, branchId, branchName, permissions };
  } catch {
    return null;
  }
}
