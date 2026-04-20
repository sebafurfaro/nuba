"use client";

import { Button, Input, Label, Text } from "@heroui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, XCircle } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { DialogSuccess, DialogWarning } from "@/components/ui";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------
const resetSchema = z
  .object({
    password: z.string().min(8, "Mínimo 8 caracteres"),
    password_confirm: z.string().min(1, "Requerido"),
  })
  .refine((d) => d.password === d.password_confirm, {
    message: "Las contraseñas no coinciden",
    path: ["password_confirm"],
  });

type ResetFormValues = z.infer<typeof resetSchema>;

// ---------------------------------------------------------------------------
// Inner client component that reads searchParams
// ---------------------------------------------------------------------------
function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  type TokenState = "checking" | "valid" | "invalid" | "expired";
  const [tokenState, setTokenState] = useState<TokenState>("checking");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [successOpen, setSuccessOpen] = useState(false);
  const [warnOpen, setWarnOpen] = useState(false);
  const [warnMsg, setWarnMsg] = useState("");

  const form = useForm<ResetFormValues>({
    resolver: zodResolver(resetSchema),
    defaultValues: { password: "", password_confirm: "" },
  });
  const submitting = form.formState.isSubmitting;

  // Validate token on mount
  useEffect(() => {
    if (!token) {
      setTokenState("invalid");
      return;
    }
    void (async () => {
      try {
        const res = await fetch(
          `/api/reset-password/validate?token=${encodeURIComponent(token)}`,
        );
        if (!res.ok) {
          setTokenState("invalid");
          return;
        }
        const j = (await res.json()) as { valid?: boolean; expired?: boolean };
        if (j.valid) {
          setTokenState("valid");
        } else if (j.expired) {
          setTokenState("expired");
        } else {
          setTokenState("invalid");
        }
      } catch {
        setTokenState("invalid");
      }
    })();
  }, [token]);

  const onSubmit = form.handleSubmit(async (values) => {
    const res = await fetch("/api/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token,
        password: values.password,
        password_confirm: values.password_confirm,
      }),
    });
    const j = (await res.json().catch(() => null)) as { error?: string } | null;
    if (!res.ok) {
      setWarnMsg(j?.error ?? "No se pudo cambiar la contraseña");
      setWarnOpen(true);
      return;
    }
    setSuccessOpen(true);
  });

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <section className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-6 px-4 py-12">
      <DialogSuccess
        isOpen={successOpen}
        onClose={() => {
          setSuccessOpen(false);
          router.push("/login");
        }}
        title="Contraseña actualizada"
        description="Tu contraseña se cambió correctamente. Ya podés ingresar con la nueva contraseña."
      />

      <DialogWarning
        isOpen={warnOpen}
        onClose={() => setWarnOpen(false)}
        title="No se pudo cambiar la contraseña"
        description={warnMsg}
        confirmLabel="Entendido"
        cancelLabel="Cerrar"
        onConfirm={() => setWarnOpen(false)}
      />

      {/* Card */}
      <div
        className="w-full rounded-2xl border border-border-subtle p-8 shadow-sm"
        style={{ backgroundColor: "var(--background-surface)" }}
      >
        {/* Checking state */}
        {tokenState === "checking" ? (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <div className="size-8 animate-spin rounded-full border-2 border-border-subtle border-t-accent" />
            <Text className="text-sm text-foreground-secondary">
              Verificando enlace…
            </Text>
          </div>
        ) : null}

        {/* Invalid / expired */}
        {tokenState === "invalid" || tokenState === "expired" ? (
          <div className="flex flex-col items-center gap-4 py-4 text-center">
            <XCircle
              className="size-12"
              style={{ color: "var(--danger)" }}
              strokeWidth={1.5}
              aria-hidden
            />
            <div className="flex flex-col gap-1">
              <Text className="text-lg font-semibold text-foreground">
                {tokenState === "expired"
                  ? "El enlace expiró"
                  : "Enlace inválido"}
              </Text>
              <Text className="text-sm text-foreground-secondary">
                {tokenState === "expired"
                  ? "Este enlace de restablecimiento ya venció. Pedile a un administrador que genere uno nuevo."
                  : "Este enlace no es válido o ya fue utilizado."}
              </Text>
            </div>
            <Button
              variant="secondary"
              onPress={() => router.push("/login")}
              className="mt-2"
            >
              Volver al login
            </Button>
          </div>
        ) : null}

        {/* Valid — show form */}
        {tokenState === "valid" ? (
          <form
            className="flex flex-col gap-5"
            onSubmit={(e) => {
              e.preventDefault();
              void onSubmit();
            }}
          >
            <div className="flex flex-col gap-1">
              <Text className="text-2xl font-semibold text-foreground">
                Nueva contraseña
              </Text>
              <Text className="text-sm text-foreground-secondary">
                Ingresá tu nueva contraseña. Debe tener al menos 8 caracteres.
              </Text>
            </div>

            {/* Password */}
            <div className="flex flex-col gap-1">
              <Label htmlFor="rp-pw">Nueva contraseña</Label>
              <div className="relative">
                <Input
                  id="rp-pw"
                  type={showPassword ? "text" : "password"}
                  variant="secondary"
                  className="w-full pr-10"
                  {...form.register("password")}
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground-muted hover:text-foreground"
                  onClick={() => setShowPassword((v) => !v)}
                  tabIndex={-1}
                  aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                >
                  {showPassword ? (
                    <EyeOff className="size-4" aria-hidden />
                  ) : (
                    <Eye className="size-4" aria-hidden />
                  )}
                </button>
              </div>
              {form.formState.errors.password?.message ? (
                <Text className="text-xs text-danger">
                  {form.formState.errors.password.message}
                </Text>
              ) : null}
            </div>

            {/* Confirm */}
            <div className="flex flex-col gap-1">
              <Label htmlFor="rp-confirm">Confirmar contraseña</Label>
              <div className="relative">
                <Input
                  id="rp-confirm"
                  type={showConfirm ? "text" : "password"}
                  variant="secondary"
                  className="w-full pr-10"
                  {...form.register("password_confirm")}
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground-muted hover:text-foreground"
                  onClick={() => setShowConfirm((v) => !v)}
                  tabIndex={-1}
                  aria-label={showConfirm ? "Ocultar contraseña" : "Mostrar contraseña"}
                >
                  {showConfirm ? (
                    <EyeOff className="size-4" aria-hidden />
                  ) : (
                    <Eye className="size-4" aria-hidden />
                  )}
                </button>
              </div>
              {form.formState.errors.password_confirm?.message ? (
                <Text className="text-xs text-danger">
                  {form.formState.errors.password_confirm.message}
                </Text>
              ) : null}
            </div>

            <Button
              type="submit"
              variant="primary"
              className="w-full bg-accent text-accent-text hover:bg-accent-hover"
              isDisabled={submitting}
            >
              {submitting ? "Cambiando…" : "Cambiar contraseña"}
            </Button>

            <button
              type="button"
              className="text-center text-sm text-foreground-muted hover:text-foreground-secondary"
              onClick={() => router.push("/login")}
            >
              Volver al login
            </button>
          </form>
        ) : null}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Page — wraps form in Suspense (required for useSearchParams in App Router)
// ---------------------------------------------------------------------------
export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <section className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center px-4">
          <div className="size-8 animate-spin rounded-full border-2 border-border-subtle border-t-accent" />
        </section>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}
