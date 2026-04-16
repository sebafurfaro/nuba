import "server-only";

import { cookies } from "next/headers";

import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth";
import type { SessionPayload } from "@/lib/auth";

export async function getSessionFromCookies(): Promise<SessionPayload | null> {
  try {
    const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
    if (!token) {
      return null;
    }
    return verifySessionToken(token);
  } catch {
    return null;
  }
}
