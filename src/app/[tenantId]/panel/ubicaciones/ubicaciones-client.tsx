"use client";

import {
  Button,
  Card,
  Input,
  Label,
  Text,
  toast,
  useOverlayState,
} from "@heroui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { PanelPageHeader } from "@/components/panel/PanelPageHeader";
import { DialogSuccess, DialogWarning } from "@/components/ui";
import type { LocationType } from "@/types/order";

type LocRow = {
  id: string;
  name: string;
  type: LocationType;
  active_order_count?: number;
};

const TYPE_OPTIONS: { value: LocationType; label: string }[] = [
  { value: "table", label: "Mesa / salón" },
  { value: "counter", label: "Mostrador / barra" },
  { value: "takeaway", label: "Take away" },
  { value: "delivery", label: "Delivery" },
  { value: "online", label: "Online" },
];

const locationTypeEnum = z.enum([
  "table",
  "counter",
  "takeaway",
  "delivery",
  "online",
]);

const createLocationSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Indicá un nombre")
    .max(100, "Máximo 100 caracteres"),
  type: locationTypeEnum,
});

const bulkCreateSchema = z.object({
  name_prefix: z
    .string()
    .trim()
    .min(1, "Indicá un prefijo")
    .max(80, "Máximo 80 caracteres"),
  bulk_count: z
    .string()
    .trim()
    .min(1, "Indicá la cantidad")
    .regex(/^\d+$/, "Solo números enteros")
    .refine((s) => {
      const n = Number.parseInt(s, 10);
      return n >= 1 && n <= 100;
    }, "Indicá un número entre 1 y 100"),
  type: locationTypeEnum,
});

type CreateLocationForm = z.infer<typeof createLocationSchema>;
type BulkCreateForm = z.infer<typeof bulkCreateSchema>;

function typeLabel(t: LocationType): string {
  return TYPE_OPTIONS.find((o) => o.value === t)?.label ?? t;
}

export function UbicacionesClient({
  tenantId,
  canMutate,
}: {
  tenantId: string;
  canMutate: boolean;
}) {
  const [rows, setRows] = useState<LocRow[]>([]);
  const [loading, setLoading] = useState(true);
  const deleteDialog = useOverlayState();
  const [pendingDelete, setPendingDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [successOpen, setSuccessOpen] = useState(false);
  const [successCopy, setSuccessCopy] = useState<{
    title: string;
    description: string;
  }>({ title: "", description: "" });
  const [createErrorOpen, setCreateErrorOpen] = useState(false);
  const [createErrorMsg, setCreateErrorMsg] = useState("");

  const form = useForm<CreateLocationForm>({
    resolver: zodResolver(createLocationSchema),
    defaultValues: { name: "", type: "counter" },
  });

  const bulkForm = useForm<BulkCreateForm>({
    resolver: zodResolver(bulkCreateSchema),
    defaultValues: { name_prefix: "", bulk_count: "5", type: "table" },
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/${tenantId}/ubicaciones`, {
        credentials: "include",
      });
      const j = (await res.json().catch(() => null)) as
        | { locations?: LocRow[]; error?: string }
        | null;
      if (!res.ok) {
        toast.danger(j?.error ?? "No se pudieron cargar las ubicaciones");
        setRows([]);
        return;
      }
      setRows(j?.locations ?? []);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  const creating = form.formState.isSubmitting;

  const onSubmit = form.handleSubmit(async (values) => {
    const res = await fetch(`/api/${tenantId}/ubicaciones`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ name: values.name.trim(), type: values.type }),
    });
    const j = (await res.json().catch(() => null)) as { error?: string };
    if (!res.ok) {
      setCreateErrorMsg(j?.error ?? "No se pudo crear");
      setCreateErrorOpen(true);
      return;
    }
    form.reset({ name: "", type: "counter" });
    setSuccessCopy({
      title: "Ubicación creada",
      description: "La ubicación se guardó correctamente.",
    });
    setSuccessOpen(true);
    await load();
  });

  const bulkSubmitting = bulkForm.formState.isSubmitting;

  const onBulkSubmit = bulkForm.handleSubmit(async (values) => {
    const bulkCountNum = Number.parseInt(values.bulk_count, 10);
    const res = await fetch(`/api/${tenantId}/ubicaciones`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        name_prefix: values.name_prefix.trim(),
        bulk_count: bulkCountNum,
        type: values.type,
      }),
    });
    const j = (await res.json().catch(() => null)) as {
      error?: string;
      count?: number;
    };
    if (!res.ok) {
      setCreateErrorMsg(j?.error ?? "No se pudo crear el lote");
      setCreateErrorOpen(true);
      return;
    }
    const n = typeof j?.count === "number" ? j.count : bulkCountNum;
    const prefix = values.name_prefix.trim();
    bulkForm.reset({
      name_prefix: "",
      bulk_count: String(bulkCountNum),
      type: values.type,
    });
    setSuccessCopy({
      title: `${n} ubicaciones creadas`,
      description: `Se generaron los nombres «${prefix} 1» … «${prefix} ${n}».`,
    });
    setSuccessOpen(true);
    await load();
  });

  function requestDeleteLocation(id: string, label: string) {
    setPendingDelete({ id, name: label });
    deleteDialog.open();
  }

  async function confirmDeleteLocation() {
    if (!pendingDelete) {
      return;
    }
    const res = await fetch(`/api/${tenantId}/ubicaciones/${pendingDelete.id}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (res.status === 204) {
      toast.success("Ubicación eliminada");
      await load();
      return;
    }
    const j = (await res.json().catch(() => null)) as { error?: string };
    throw new Error(j?.error ?? "No se pudo eliminar");
  }

  return (
    <div className="flex flex-col gap-6">
      <DialogSuccess
        isOpen={successOpen}
        onClose={() => setSuccessOpen(false)}
        title={successCopy.title}
        description={successCopy.description}
      />

      <DialogWarning
        isOpen={createErrorOpen}
        onClose={() => setCreateErrorOpen(false)}
        title="No se pudo crear"
        description={createErrorMsg}
        confirmLabel="Entendido"
        cancelLabel="Cerrar"
        onConfirm={() => setCreateErrorOpen(false)}
      />

      {canMutate ? (
        <DialogWarning
          isOpen={deleteDialog.isOpen}
          onClose={() => {
            deleteDialog.close();
            setPendingDelete(null);
          }}
          title="Eliminar ubicación"
          confirmLabel="Eliminar"
          onConfirm={confirmDeleteLocation}
        >
          <Text className="text-sm text-foreground-secondary">
            ¿Seguro que querés eliminar{" "}
            <span className="font-semibold text-foreground">
              {pendingDelete?.name ?? "esta ubicación"}
            </span>
            ? No debe tener órdenes activas.
          </Text>
        </DialogWarning>
      ) : null}

      <PanelPageHeader
        title="Ubicaciones"
        description={
          <>
            Puntos donde se toman órdenes: mesas, mostrador, take away y canales de
            entrega. Las usás en{" "}
            <Link
              href={`/${tenantId}/panel/mesas`}
              className="font-medium text-accent underline-offset-2 hover:underline"
            >
              Órdenes
            </Link>
            .
          </>
        }
      />

      {canMutate ? (
        <Card.Root className="border border-border-subtle">
          <Card.Header>
            <Card.Title>Nueva ubicación</Card.Title>
          </Card.Header>
          <Card.Content className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <div className="flex min-w-[12rem] flex-1 flex-col gap-1">
              <Label htmlFor="loc-name">Nombre</Label>
              <Input
                id="loc-name"
                variant="secondary"
                placeholder="Ej. Mostrador, Mesa 12"
                {...form.register("name")}
              />
              {form.formState.errors.name?.message ? (
                <Text className="text-sm text-danger">
                  {form.formState.errors.name.message}
                </Text>
              ) : null}
            </div>
            <div className="flex w-full min-w-[10rem] flex-col gap-1 sm:w-56">
              <Label htmlFor="loc-type">Tipo</Label>
              <select
                id="loc-type"
                className="h-10 rounded-lg border border-border-subtle bg-background px-2 text-sm"
                {...form.register("type")}
              >
                {TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              {form.formState.errors.type?.message ? (
                <Text className="text-sm text-danger">
                  {form.formState.errors.type.message}
                </Text>
              ) : null}
            </div>
            <Button
              type="button"
              variant="primary"
              className="bg-accent text-accent-text"
              isDisabled={creating || bulkSubmitting}
              onPress={() => void onSubmit()}
            >
              Crear
            </Button>
          </Card.Content>
        </Card.Root>
      ) : null}

      {canMutate ? (
        <Card.Root className="border border-border-subtle">
          <Card.Header>
            <Card.Title>Alta por cantidad</Card.Title>
          </Card.Header>
          <Card.Content className="flex flex-col gap-3">
            <Text className="text-sm text-foreground-secondary">
              Creá varias ubicaciones de una vez. Los nombres serán{" "}
              <span className="font-medium text-foreground">
                prefijo + número
              </span>{" "}
              (ej. «Mesa 1», «Mesa 2»…).
            </Text>
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
              <div className="flex min-w-[10rem] flex-1 flex-col gap-1">
                <Label htmlFor="bulk-prefix">Prefijo del nombre</Label>
                <Input
                  id="bulk-prefix"
                  variant="secondary"
                  placeholder="Ej. Mesa, Mostrador"
                  {...bulkForm.register("name_prefix")}
                />
                {bulkForm.formState.errors.name_prefix?.message ? (
                  <Text className="text-sm text-danger">
                    {bulkForm.formState.errors.name_prefix.message}
                  </Text>
                ) : null}
              </div>
              <div className="flex w-full min-w-[6rem] max-w-[8rem] flex-col gap-1">
                <Label htmlFor="bulk-count">Cantidad</Label>
                <Input
                  id="bulk-count"
                  type="text"
                  inputMode="numeric"
                  variant="secondary"
                  placeholder="1–100"
                  {...bulkForm.register("bulk_count")}
                />
                {bulkForm.formState.errors.bulk_count?.message ? (
                  <Text className="text-sm text-danger">
                    {bulkForm.formState.errors.bulk_count.message}
                  </Text>
                ) : null}
              </div>
              <div className="flex w-full min-w-[10rem] flex-col gap-1 sm:w-56">
                <Label htmlFor="bulk-type">Tipo</Label>
                <select
                  id="bulk-type"
                  className="h-10 rounded-lg border border-border-subtle bg-background px-2 text-sm"
                  {...bulkForm.register("type")}
                >
                  {TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                {bulkForm.formState.errors.type?.message ? (
                  <Text className="text-sm text-danger">
                    {bulkForm.formState.errors.type.message}
                  </Text>
                ) : null}
              </div>
              <Button
                type="button"
                variant="secondary"
                isDisabled={bulkSubmitting || creating}
                onPress={() => void onBulkSubmit()}
              >
                Crear en lote
              </Button>
            </div>
          </Card.Content>
        </Card.Root>
      ) : null}

      <Card.Root className="border border-border-subtle">
        <Card.Header>
          <Card.Title>Listado</Card.Title>
        </Card.Header>
        <Card.Content className="flex flex-col gap-0">
          {loading ? (
            <Text className="text-sm text-foreground-muted">Cargando…</Text>
          ) : rows.length === 0 ? (
            <Text className="text-sm text-foreground-muted">
              No hay ubicaciones activas. {canMutate ? "Creá la primera arriba." : ""}
            </Text>
          ) : (
            <ul className="divide-y divide-border-subtle">
              {rows.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0"
                >
                  <div className="min-w-0">
                    <Text className="font-medium text-foreground mr-2">{r.name}</Text>
                    <Text className="text-xs text-foreground-muted">
                      {typeLabel(r.type)}
                      {typeof r.active_order_count === "number"
                        ? ` · ${r.active_order_count} orden(es) activa(s)`
                        : ""}
                    </Text>
                  </div>
                  {canMutate ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="shrink-0 text-danger"
                      isDisabled={creating || bulkSubmitting}
                      onPress={() => requestDeleteLocation(r.id, r.name)}
                    >
                      Eliminar
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Card.Content>
      </Card.Root>
    </div>
  );
}
