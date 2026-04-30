"use client";

import { useCallback, useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button, Card, Input, Label, Text } from "@heroui/react";
import { Palette, Save } from "lucide-react";

import { DialogSuccess } from "@/components/ui/DialogSuccess";
import { DialogWarning } from "@/components/ui/DialogWarning";
import type { TenantTema } from "@/types/tema";
import { DEFAULT_TEMA } from "@/types/tema";

// ─── Schema ───────────────────────────────────────────────────────────────────

const hexColor = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, "Debe ser un color hex válido (#RRGGBB)");

const temaSchema = z.object({
  colorPrimario: hexColor,
  colorSecundario: hexColor,
  colorFondo: hexColor,
  colorTexto: hexColor,
  colorLinks: hexColor,
});

type TemaFormValues = z.infer<typeof temaSchema>;

// ─── Color field descriptions ──────────────────────────────────────────────

const FIELD_CONFIG: Array<{
  name: keyof TemaFormValues;
  label: string;
  description: string;
}> = [
  {
    name: "colorPrimario",
    label: "Color primario",
    description: "Fondo del botón principal (texto blanco)",
  },
  {
    name: "colorSecundario",
    label: "Color secundario",
    description: "Hover y estado activo del botón principal (texto blanco)",
  },
  {
    name: "colorFondo",
    label: "Color de fondo",
    description: "Color de fondo general de la página pública",
  },
  {
    name: "colorTexto",
    label: "Color de texto",
    description: "Color del texto principal",
  },
  {
    name: "colorLinks",
    label: "Color de links",
    description: "Color de los enlaces (el hover usará el color secundario)",
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const glassStyle = {
  background: "var(--nuba-glass-surface)",
  backdropFilter: "blur(var(--nuba-glass-blur-sm))",
} as const;

// ─── Color Field ──────────────────────────────────────────────────────────────

function ColorField({
  name,
  label,
  description,
  value,
  onChange,
  error,
}: {
  name: string;
  label: string;
  description: string;
  value: string;
  onChange: (val: string) => void;
  error?: string;
}) {
  function handlePickerChange(e: React.ChangeEvent<HTMLInputElement>) {
    onChange(e.target.value);
  }

  function handleTextChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    onChange(val);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={`color-text-${name}`}>{label}</Label>
      <p className="text-xs" style={{ color: "var(--nuba-fg-muted)" }}>
        {description}
      </p>
      <div className="flex items-center gap-3">
        <label
          htmlFor={`color-picker-${name}`}
          className="relative cursor-pointer"
          title="Abrir selector de color"
        >
          <input
            id={`color-picker-${name}`}
            type="color"
            value={/^#[0-9A-Fa-f]{6}$/.test(value) ? value : "#000000"}
            onChange={handlePickerChange}
            className="sr-only"
          />
          <span
            className="block size-9 rounded-lg border-2 shadow-sm transition-transform hover:scale-105"
            style={{
              backgroundColor: /^#[0-9A-Fa-f]{6}$/.test(value)
                ? value
                : "#000000",
              borderColor: "var(--nuba-border-default)",
            }}
          />
        </label>
        <Input
          id={`color-text-${name}`}
          variant="secondary"
          value={value}
          onChange={handleTextChange}
          placeholder="#000000"
          maxLength={7}
          className="w-32 font-mono text-sm uppercase"
        />
      </div>
      {error ? (
        <Text className="text-sm text-danger">{error}</Text>
      ) : null}
    </div>
  );
}

// ─── Preview Card ─────────────────────────────────────────────────────────────

function PreviewCard({ values }: { values: TemaFormValues }) {
  const { colorFondo, colorTexto, colorPrimario, colorSecundario, colorLinks } =
    values;

  function safeColor(c: string): string {
    return /^#[0-9A-Fa-f]{6}$/.test(c) ? c : "#000000";
  }

  return (
    <div
      className="rounded-xl border p-5 text-sm"
      style={{
        backgroundColor: safeColor(colorFondo),
        color: safeColor(colorTexto),
        borderColor: "var(--nuba-border-default)",
      }}
    >
      <p className="mb-3 font-semibold">Vista previa</p>
      <p className="mb-4" style={{ color: safeColor(colorTexto) }}>
        Así se verá el texto del local en la página pública.
      </p>
      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors"
          style={{ backgroundColor: safeColor(colorPrimario) }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.backgroundColor =
              safeColor(colorSecundario);
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.backgroundColor =
              safeColor(colorPrimario);
          }}
        >
          Botón principal
        </button>
      </div>
      <a
        href="#"
        onClick={(e) => e.preventDefault()}
        className="text-sm font-medium underline transition-colors"
        style={{ color: safeColor(colorLinks) }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLAnchorElement).style.color =
            safeColor(colorSecundario);
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLAnchorElement).style.color =
            safeColor(colorLinks);
        }}
      >
        Link de ejemplo
      </a>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function PanelColoresMarca({ tenantId }: { tenantId: string }) {
  const [loading, setLoading] = useState(true);
  const [successOpen, setSuccessOpen] = useState(false);
  const [warnOpen, setWarnOpen] = useState(false);
  const [warnMsg, setWarnMsg] = useState("");

  const form = useForm<TemaFormValues>({
    resolver: zodResolver(temaSchema),
    defaultValues: {
      colorPrimario: DEFAULT_TEMA.colorPrimario,
      colorSecundario: DEFAULT_TEMA.colorSecundario,
      colorFondo: DEFAULT_TEMA.colorFondo,
      colorTexto: DEFAULT_TEMA.colorTexto,
      colorLinks: DEFAULT_TEMA.colorLinks,
    },
  });

  const values = useWatch({ control: form.control }) as TemaFormValues;

  const loadTema = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/${tenantId}/perfil/tema`, {
        cache: "no-store",
        credentials: "include",
      });
      if (res.ok) {
        const data = (await res.json()) as TenantTema;
        form.reset({
          colorPrimario: data.colorPrimario,
          colorSecundario: data.colorSecundario,
          colorFondo: data.colorFondo,
          colorTexto: data.colorTexto,
          colorLinks: data.colorLinks,
        });
      }
    } catch {
      // silently ignore load errors — defaults are safe
    } finally {
      setLoading(false);
    }
  }, [tenantId, form]);

  useEffect(() => {
    void loadTema();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  async function onSubmit(data: TemaFormValues) {
    const res = await fetch(`/api/${tenantId}/perfil/tema`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const j = (await res.json().catch(() => null)) as { error?: string } | null;
      setWarnMsg(j?.error ?? "Error al guardar los colores");
      setWarnOpen(true);
      return;
    }

    const updated = (await res.json()) as TenantTema;
    form.reset({
      colorPrimario: updated.colorPrimario,
      colorSecundario: updated.colorSecundario,
      colorFondo: updated.colorFondo,
      colorTexto: updated.colorTexto,
      colorLinks: updated.colorLinks,
    });
    setSuccessOpen(true);
  }

  if (loading) {
    return (
      <div
        className="py-12 text-center text-sm"
        style={{ color: "var(--nuba-fg-muted)" }}
      >
        Cargando colores de marca…
      </div>
    );
  }

  return (
    <>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Left col: color fields */}
          <div className="lg:col-span-2">
            <Card.Root className="border" style={{ ...glassStyle, borderColor: "var(--nuba-border-subtle)" }}>
              <Card.Header>
                <Card.Title className="flex items-center gap-2">
                  <Palette className="size-4" />
                  Colores de marca
                </Card.Title>
              </Card.Header>
              <Card.Content className="flex flex-col gap-5">
                {FIELD_CONFIG.map((field) => (
                  <ColorField
                    key={field.name}
                    name={field.name}
                    label={field.label}
                    description={field.description}
                    value={form.watch(field.name)}
                    onChange={(val) =>
                      form.setValue(field.name, val, { shouldValidate: true })
                    }
                    error={form.formState.errors[field.name]?.message}
                  />
                ))}
              </Card.Content>
            </Card.Root>
          </div>

          {/* Right col: preview */}
          <div className="flex flex-col gap-4">
            <Card.Root className="border" style={{ ...glassStyle, borderColor: "var(--nuba-border-subtle)" }}>
              <Card.Header>
                <Card.Title>Preview en vivo</Card.Title>
              </Card.Header>
              <Card.Content>
                <PreviewCard values={values} />
              </Card.Content>
            </Card.Root>

            <p className="text-xs" style={{ color: "var(--nuba-fg-muted)" }}>
              Los cambios se aplican en tiempo real en la vista pública una vez guardados.
            </p>
          </div>
        </div>

        {/* Save button */}
        <div className="flex justify-end">
          <Button
            type="submit"
            isLoading={form.formState.isSubmitting}
            isDisabled={form.formState.isSubmitting}
            className="gap-2"
          >
            <Save className="size-4" />
            Guardar colores
          </Button>
        </div>
      </form>

      <DialogSuccess
        isOpen={successOpen}
        onClose={() => setSuccessOpen(false)}
        title="Colores guardados"
        description="Los colores de marca se aplicarán en la página pública del local."
      />

      <DialogWarning
        isOpen={warnOpen}
        onClose={() => setWarnOpen(false)}
        title="Error al guardar"
        description={warnMsg}
      />
    </>
  );
}
