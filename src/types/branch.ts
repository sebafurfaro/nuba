export type Branch = {
  id: string;
  tenant_id: string;
  name: string;
  address: string;
  city: string | null;
  province: string | null;
  phone: string | null;
  email: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  /** Cuántos usuarios tiene asignados vía user_branches. */
  user_count?: number;
};

export type CreateBranchInput = {
  name: string;
  address: string;
  city?: string | null;
  province?: string | null;
  phone?: string | null;
  email?: string | null;
};

export type UpdateBranchInput = Partial<CreateBranchInput> & {
  is_active?: boolean;
};

export class BranchDuplicateNameError extends Error {
  readonly code = "DUPLICATE_NAME" as const;
  constructor() {
    super("DUPLICATE_NAME");
    this.name = "BranchDuplicateNameError";
  }
}

export class BranchLastActiveError extends Error {
  readonly code = "LAST_BRANCH" as const;
  constructor() {
    super("LAST_BRANCH");
    this.name = "BranchLastActiveError";
  }
}
