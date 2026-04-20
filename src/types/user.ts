import type { Role } from "@/lib/permissions";

export type { Role };

export type User = {
  id: string;
  tenant_id: string;
  role_id: string;
  role_name: Role;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  avatar_url: string | null;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
  /** Sucursales asignadas vía user_branches. */
  branches: UserBranch[];
};

export type UserBranch = {
  branch_id: string;
  branch_name: string;
  is_primary: boolean;
};

/** Para el listado — sin datos sensibles ni array de sucursales. */
export type UserSummary = Omit<User, "branches"> & {
  branch_count: number;
  primary_branch_name: string | null;
};

export type CreateUserInput = {
  first_name: string;
  last_name: string;
  email: string;
  password: string;
  role_name: Role;
  phone?: string | null;
  /** Al menos una sucursal. */
  branch_ids: string[];
  /** Cuál de las branch_ids es la principal. */
  primary_branch_id: string;
};

export type UpdateUserInput = Partial<Omit<CreateUserInput, "password">>;

export type UserListFilters = {
  search?: string;
  roleId?: string;
  isActive?: boolean;
  branchId?: string;
};

export class UserDuplicateEmailError extends Error {
  readonly code = "DUPLICATE_EMAIL" as const;
  constructor() {
    super("DUPLICATE_EMAIL");
    this.name = "UserDuplicateEmailError";
  }
}

export class UserLastAdminError extends Error {
  readonly code = "LAST_ADMIN" as const;
  constructor() {
    super("LAST_ADMIN");
    this.name = "UserLastAdminError";
  }
}

export class UserInvalidTokenError extends Error {
  readonly code = "INVALID_TOKEN" as const;
  constructor() {
    super("INVALID_TOKEN");
    this.name = "UserInvalidTokenError";
  }
}
