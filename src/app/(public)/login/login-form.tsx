"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";

import { Button, Form, Input, Text } from "@heroui/react";
import type { PermissionClaim } from "@/lib/auth";
import type { Role } from "@/lib/permissions";
import { useAuthStore } from "@/store/authStore";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const setFromLogin = useAuthStore((s) => s.setFromLogin);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const defaultTenant = searchParams.get("tenantId") ?? "";

  const onSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      setError(null);
      const form = e.currentTarget;
      const fd = new FormData(form);
      const tenantId = String(fd.get("tenantId") ?? "").trim();
      const email = String(fd.get("email") ?? "").trim();
      const password = String(fd.get("password") ?? "");

      if (!tenantId || !email || !password) {
        setError("Completá comercio, email y contraseña.");
        return;
      }

      setLoading(true);
      try {
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tenantId, email, password }),
        });
        const data = (await res.json().catch(() => null)) as {
          error?: string;
          ok?: boolean;
          tenantId?: string;
          email?: string;
          role?: Role;
          permissions?: PermissionClaim[];
        } | null;

        if (!res.ok || !data?.ok) {
          setError(data?.error ?? "No se pudo iniciar sesión.");
          return;
        }

        setFromLogin({
          tenantId: data.tenantId ?? tenantId,
          email: data.email ?? email,
          role: data.role as Role,
          permissions: Array.isArray(data.permissions) ? data.permissions : [],
        });

        const returnUrl = searchParams.get("returnUrl");
        const safe =
          returnUrl?.startsWith("/") && !returnUrl.startsWith("//")
            ? returnUrl
            : `/${data.tenantId ?? tenantId}/panel`;
        router.push(safe);
        router.refresh();
      } catch {
        setError("Error de red. Intentá de nuevo.");
      } finally {
        setLoading(false);
      }
    },
    [router, searchParams, setFromLogin],
  );

  return (
    <Form.Root onSubmit={onSubmit} className="flex w-full max-w-md flex-col gap-4">
      <Text className="text-2xl font-semibold">Iniciar sesión</Text>
      <Text className="text-sm text-default-500">
        El comercio debe coincidir con el slug del tenant. El email y la clave
        con un usuario activo de ese comercio.
      </Text>

      <Input
        name="tenantId"
        type="text"
        placeholder="Comercio (tenant), ej: demo"
        aria-label="Comercio (tenant)"
        defaultValue={defaultTenant}
        required
        autoComplete="organization"
      />
      <Input
        name="email"
        type="email"
        placeholder="Email"
        aria-label="Email"
        required
        autoComplete="email"
      />
      <Input
        name="password"
        type="password"
        placeholder="Contraseña"
        aria-label="Contraseña"
        required
        autoComplete="current-password"
      />

      {error ? (
        <Text className="text-sm text-danger">{error}</Text>
      ) : null}

      <Button type="submit" variant="primary" isDisabled={loading}>
        {loading ? "Ingresando…" : "Iniciar sesión"}
      </Button>
    </Form.Root>
  );
}
