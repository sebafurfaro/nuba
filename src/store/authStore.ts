import { create } from "zustand";

import type { PermissionClaim } from "@/lib/auth";
import type { Role } from "@/lib/permissions";

export type AuthSnapshot = {
  tenantId: string;
  email: string;
  role: Role;
  permissions: PermissionClaim[];
};

type AuthState = {
  tenantId: string | null;
  email: string | null;
  role: Role | null;
  permissions: PermissionClaim[];
  setFromLogin: (data: AuthSnapshot) => void;
  clear: () => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  tenantId: null,
  email: null,
  role: null,
  permissions: [],
  setFromLogin: (data) =>
    set({
      tenantId: data.tenantId,
      email: data.email,
      role: data.role,
      permissions: data.permissions,
    }),
  clear: () =>
    set({
      tenantId: null,
      email: null,
      role: null,
      permissions: [],
    }),
}));
