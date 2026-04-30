"use client";

import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Button,
  Card,
  Input,
  Label,
  Modal,
  SwitchControl,
  SwitchRoot,
  SwitchThumb,
  Text,
  toast,
  useOverlayState,
} from "@heroui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronRight, GripVertical, Lock, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { PanelPageHeader } from "@/components/panel/PanelPageHeader";
import { DialogSuccess, DialogWarning } from "@/components/ui";
import type { OrderStatus } from "@/types/order";

const glassStyle = {
  background: "var(--nuba-glass-surface)",
  backdropFilter: "blur(var(--nuba-glass-blur-sm))",
} as const;

const addStatusSchema = z.object({
  label: z.string().trim().min(1, "Indicá una etiqueta").max(120),
  key: z.string().max(50),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Color inválido"),
});

type AddStatusForm = z.infer<typeof addStatusSchema>;

/** Coincide con `--nuba-badge-neutral-bg` en `globals.css` (el picker `<input type="color">` exige `#hex`). */
const DEFAULT_STATUS_HEX = "#6b7280" as const;

const PROTECTED_KEYS = ["pedido", "pagado"] as const;

function slugKeyFromLabel(label: string): string {
  const base = label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return base || `estado_${Date.now()}`;
}

function SortableStatusRow({
  row,
  onLabelCommit,
  onColorChange,
  onToggleStock,
  onToggleTerminal,
  onDelete,
}: {
  row: OrderStatus;
  onLabelCommit: (id: string, label: string) => void;
  onColorChange: (id: string, color: string) => void;
  onToggleStock: (id: string, value: boolean) => void;
  onToggleTerminal: (id: string, value: boolean) => void;
  onDelete: (id: string) => void;
}) {
  const [labelDraft, setLabelDraft] = useState(row.label);
  useEffect(() => {
    setLabelDraft(row.label);
  }, [row.label, row.id]);

  const protected_ = (PROTECTED_KEYS as readonly string[]).includes(row.key);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: row.id, disabled: protected_ });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.88 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex flex-col gap-3 border-b border-border-subtle py-4 last:border-b-0 sm:flex-row sm:items-center"
    >
      {/* Handle o ícono de bloqueo */}
      {protected_ ? (
        <div
          className="self-start rounded p-2 text-foreground-muted"
          title="Estado del sistema — no se puede eliminar ni reordenar"
        >
          <Lock className="size-5" />
        </div>
      ) : (
        <button
          type="button"
          className="cursor-grab touch-none self-start rounded p-2 text-foreground-muted hover:bg-raised active:cursor-grabbing"
          aria-label="Arrastrar"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-5" />
        </button>
      )}

      <div className="flex flex-wrap items-center gap-3 sm:flex-1">
        <label className="flex shrink-0 cursor-pointer flex-col gap-1">
          <span className="text-xs text-foreground-muted">Color</span>
          <input
            type="color"
            aria-label="Color del estado"
            className="h-10 w-14 cursor-pointer rounded border border-border-subtle bg-transparent p-0.5"
            value={row.color.length === 7 ? row.color : DEFAULT_STATUS_HEX}
            onChange={(e) => onColorChange(row.id, e.target.value)}
          />
        </label>
        <div className="min-w-0 flex-1 sm:max-w-xs">
          <span className="text-xs text-foreground-muted">Etiqueta</span>
          {protected_ ? (
            <p className="mt-1 flex h-10 items-center rounded-lg border border-border-subtle bg-raised/50 px-3 text-sm text-foreground">
              {row.label}
            </p>
          ) : (
            <Input
              id={`label-${row.id}`}
              variant="secondary"
              value={labelDraft}
              onChange={(e) => setLabelDraft(e.currentTarget.value)}
              onBlur={() => {
                const t = labelDraft.trim();
                if (t && t !== row.label) {
                  onLabelCommit(row.id, t);
                }
              }}
            />
          )}
        </div>

        {/* Descuenta stock — solo para no protegidos */}
        {!protected_ ? (
          <div className="flex flex-col gap-1">
            <Text className="text-xs text-foreground-muted">Descuenta stock</Text>
            <SwitchRoot
              isSelected={row.triggers_stock}
              onChange={(v) => onToggleStock(row.id, v)}
            >
              <SwitchControl>
                <SwitchThumb />
              </SwitchControl>
            </SwitchRoot>
          </div>
        ) : null}

        {/* Terminal — solo para no protegidos */}
        {!protected_ ? (
          <div className="flex flex-col gap-1">
            <Text className="text-xs text-foreground-muted">Terminal</Text>
            <SwitchRoot
              isSelected={row.is_terminal}
              onChange={(v) => onToggleTerminal(row.id, v)}
            >
              <SwitchControl>
                <SwitchThumb />
              </SwitchControl>
            </SwitchRoot>
          </div>
        ) : null}

        {/* Badge "Sistema" para protegidos, botón eliminar para el resto */}
        {protected_ ? (
          <span
            className="rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide"
            style={{
              background: "var(--accent-soft)",
              color: "var(--accent)",
            }}
          >
            Sistema
          </span>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            isIconOnly
            className="text-danger"
            aria-label="Eliminar estado"
            onPress={() => onDelete(row.id)}
          >
            <Trash2 className="size-4" />
          </Button>
        )}
      </div>

      <Text className="w-full shrink-0 font-mono text-xs text-foreground-muted sm:w-28 sm:text-end">
        {row.key}
      </Text>
    </div>
  );
}

export function OrderStatusesSettingsClient({ tenantId }: { tenantId: string }) {
  const [rows, setRows] = useState<OrderStatus[]>([]);
  const [savedOrderIds, setSavedOrderIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const addModal = useOverlayState();
  const deleteModal = useOverlayState();
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [addSuccessOpen, setAddSuccessOpen] = useState(false);
  const [addWarnOpen, setAddWarnOpen] = useState(false);
  const [addWarnMsg, setAddWarnMsg] = useState("");

  const addForm = useForm<AddStatusForm>({
    resolver: zodResolver(addStatusSchema),
    defaultValues: { label: "", key: "", color: DEFAULT_STATUS_HEX },
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const modalPortalTarget =
    typeof document !== "undefined" ? document.body : undefined;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/${tenantId}/estados-orden`, {
        credentials: "include",
      });
      const j = (await res.json()) as { statuses?: OrderStatus[]; error?: string };
      if (!res.ok) {
        toast.danger(j.error ?? "No se pudieron cargar los estados");
        return;
      }
      const list = [...(j.statuses ?? [])].sort((a, b) => a.sort_order - b.sort_order);
      setRows(list);
      setSavedOrderIds(list.map((r) => r.id));
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!addModal.isOpen) {
      return;
    }
    addForm.reset({ label: "", key: "", color: DEFAULT_STATUS_HEX });
    addForm.clearErrors();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addModal.isOpen]);

  const sortDirty = useMemo(() => {
    const cur = rows.map((r) => r.id);
    if (cur.length !== savedOrderIds.length) {
      return true;
    }
    return cur.some((id, i) => id !== savedOrderIds[i]);
  }, [rows, savedOrderIds]);

  const persistPatch = useCallback(
    async (id: string, body: Record<string, unknown>) => {
      const res = await fetch(`/api/${tenantId}/estados-orden/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const j = (await res.json().catch(() => null)) as { error?: string };
      if (!res.ok) {
        toast.danger(j?.error ?? "No se pudo guardar");
        await load();
      }
    },
    [tenantId, load],
  );

  const onLabelCommit = useCallback(
    async (id: string, label: string) => {
      setRows((prev) =>
        prev.map((r) => (r.id === id ? { ...r, label } : r)),
      );
      await persistPatch(id, { label });
    },
    [persistPatch],
  );

  const onColorChange = useCallback(
    async (id: string, color: string) => {
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, color } : r)));
      await persistPatch(id, { color });
    },
    [persistPatch],
  );

  const onToggleStock = useCallback(
    async (id: string, value: boolean) => {
      setRows((prev) =>
        prev.map((r) => (r.id === id ? { ...r, triggers_stock: value } : r)),
      );
      await persistPatch(id, { triggers_stock: value });
    },
    [persistPatch],
  );

  const onToggleTerminal = useCallback(
    async (id: string, value: boolean) => {
      setRows((prev) =>
        prev.map((r) => (r.id === id ? { ...r, is_terminal: value } : r)),
      );
      await persistPatch(id, { is_terminal: value });
    },
    [persistPatch],
  );

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) {
      return;
    }
    const oldIndex = rows.findIndex((r) => r.id === active.id);
    const newIndex = rows.findIndex((r) => r.id === over.id);
    if (oldIndex < 0 || newIndex < 0) {
      return;
    }
    setRows((prev) => arrayMove(prev, oldIndex, newIndex));
  }

  async function saveSortOrder() {
    const items = rows.map((r, i) => ({ id: r.id, sort_order: i }));
    const res = await fetch(`/api/${tenantId}/estados-orden/ordenar`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ items }),
    });
    const j = (await res.json().catch(() => null)) as { error?: string };
    if (!res.ok) {
      toast.danger(j?.error ?? "No se pudo guardar el orden");
      await load();
      return;
    }
    toast.success("Orden guardado");
    await load();
  }

  const submitAddStatus = addForm.handleSubmit(async (data) => {
    const label = data.label.trim();
    const key = (data.key.trim() || slugKeyFromLabel(label)).slice(0, 50);
    const res = await fetch(`/api/${tenantId}/estados-orden`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        key,
        label,
        color: data.color,
        sort_order: rows.length,
        triggers_stock: false,
        is_terminal: false,
      }),
    });
    const j = (await res.json().catch(() => null)) as { error?: string; id?: string };
    if (res.status === 409) {
      setAddWarnMsg(j?.error ?? "Clave duplicada");
      setAddWarnOpen(true);
      return;
    }
    if (!res.ok) {
      setAddWarnMsg(j?.error ?? "No se pudo crear");
      setAddWarnOpen(true);
      return;
    }
    addModal.close();
    setAddSuccessOpen(true);
    await load();
  });

  async function confirmDelete() {
    if (!pendingDeleteId) {
      return;
    }
    const res = await fetch(`/api/${tenantId}/estados-orden/${pendingDeleteId}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (res.status === 409) {
      const j = (await res.json()) as { error?: string };
      toast.danger(j.error ?? "No se puede eliminar");
      deleteModal.close();
      setPendingDeleteId(null);
      return;
    }
    if (!res.ok) {
      toast.danger("No se pudo eliminar");
      deleteModal.close();
      setPendingDeleteId(null);
      await load();
      return;
    }
    toast.success("Estado eliminado");
    deleteModal.close();
    setPendingDeleteId(null);
    await load();
  }

  return (
    <div className="flex flex-col gap-6">
      <DialogSuccess
        isOpen={addSuccessOpen}
        onClose={() => setAddSuccessOpen(false)}
        title="Estado creado"
        description="El nuevo estado se guardó en el pipeline."
      />
      <DialogWarning
        isOpen={addWarnOpen}
        onClose={() => setAddWarnOpen(false)}
        title="No se pudo crear"
        description={addWarnMsg}
        confirmLabel="Entendido"
        cancelLabel="Cerrar"
        onConfirm={() => setAddWarnOpen(false)}
      />

      <PanelPageHeader
        title="Pipeline de órdenes"
        description="Configurá los estados por los que pasan tus órdenes"
        descriptionClassName="max-w-2xl"
      />

      <Card.Root className="border border-border-subtle" style={glassStyle}>
        <Card.Header>
          <Card.Title>Vista previa</Card.Title>
        </Card.Header>
        <Card.Content className="overflow-x-auto">
          <div className="flex min-w-min items-center gap-1 py-2">
            {rows.map((r, i) => (
              <div key={r.id} className="flex items-center gap-1">
                {i > 0 ? (
                  <ChevronRight
                    className="size-4 shrink-0 text-foreground-muted"
                    aria-hidden
                  />
                ) : null}
                <span
                  className="whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium shadow-sm"
                  style={{
                    backgroundColor: r.color,
                    color: "var(--nuba-accent-text)",
                  }}
                >
                  {r.label}
                </span>
              </div>
            ))}
          </div>
        </Card.Content>
      </Card.Root>

      <Card.Root className="border border-border-subtle" style={glassStyle}>
        <Card.Header className="flex flex-row flex-wrap items-center justify-between gap-2">
          <Card.Title>Estados</Card.Title>
          {sortDirty ? (
            <Button
              size="sm"
              variant="primary"
              className="bg-accent text-accent-text"
              onPress={() => void saveSortOrder()}
            >
              Guardar orden
            </Button>
          ) : null}
        </Card.Header>
        <Card.Content className="px-2 sm:px-4">
          {loading ? (
            <Text className="text-sm text-foreground-muted">Cargando…</Text>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={onDragEnd}
            >
              <SortableContext
                items={rows.map((r) => r.id)}
                strategy={verticalListSortingStrategy}
              >
                {rows.map((row) => (
                  <SortableStatusRow
                    key={row.id}
                    row={row}
                    onLabelCommit={(id, label) => void onLabelCommit(id, label)}
                    onColorChange={(id, c) => void onColorChange(id, c)}
                    onToggleStock={(id, v) => void onToggleStock(id, v)}
                    onToggleTerminal={(id, v) => void onToggleTerminal(id, v)}
                    onDelete={(id) => {
                      setPendingDeleteId(id);
                      deleteModal.open();
                    }}
                  />
                ))}
              </SortableContext>
            </DndContext>
          )}
        </Card.Content>
      </Card.Root>

      <Button
        variant="secondary"
        className="self-start"
        onPress={() => addModal.open()}
      >
        <Plus className="size-4" />
        Agregar estado
      </Button>

      <Modal.Root state={addModal}>
        <Modal.Backdrop
          className="z-200"
          UNSTABLE_portalContainer={modalPortalTarget}
        >
          <Modal.Container placement="center" size="md">
            <Modal.Dialog className="max-w-md">
              <Modal.Header>
                <Modal.Heading>Nuevo estado</Modal.Heading>
              </Modal.Header>
              <Modal.Body className="flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                  <Label htmlFor="ns-label">Etiqueta visible</Label>
                  <Input
                    id="ns-label"
                    variant="secondary"
                    {...addForm.register("label")}
                  />
                  {addForm.formState.errors.label?.message ? (
                    <Text className="text-sm text-danger">
                      {addForm.formState.errors.label.message}
                    </Text>
                  ) : null}
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="ns-key">Clave interna (opcional)</Label>
                  <Input
                    id="ns-key"
                    variant="secondary"
                    placeholder="Se genera desde la etiqueta"
                    {...addForm.register("key")}
                  />
                  {addForm.formState.errors.key?.message ? (
                    <Text className="text-sm text-danger">
                      {addForm.formState.errors.key.message}
                    </Text>
                  ) : null}
                </div>
                <label className="flex flex-col gap-1">
                  <span className="text-sm text-foreground-secondary">Color</span>
                  <input
                    type="color"
                    className="h-10 w-20 cursor-pointer rounded border border-border-subtle"
                    {...addForm.register("color")}
                  />
                  {addForm.formState.errors.color?.message ? (
                    <Text className="text-sm text-danger">
                      {addForm.formState.errors.color.message}
                    </Text>
                  ) : null}
                </label>
              </Modal.Body>
              <Modal.Footer className="flex justify-end gap-2">
                <Button variant="secondary" onPress={() => addModal.close()}>
                  Cancelar
                </Button>
                <Button
                  variant="primary"
                  className="bg-accent text-accent-text"
                  isDisabled={addForm.formState.isSubmitting}
                  onPress={() => void submitAddStatus()}
                >
                  Crear
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal.Root>

      <Modal.Root state={deleteModal}>
        <Modal.Backdrop
          className="z-200"
          UNSTABLE_portalContainer={modalPortalTarget}
        >
          <Modal.Container placement="center" size="md">
            <Modal.Dialog className="max-w-md">
              <Modal.Header>
                <Modal.Heading>Eliminar estado</Modal.Heading>
              </Modal.Header>
              <Modal.Body>
                <Text className="text-sm text-foreground-secondary">
                  ¿Seguro que querés eliminar este estado? No debe haber órdenes
                  usándolo actualmente.
                </Text>
              </Modal.Body>
              <Modal.Footer className="flex justify-end gap-2">
                <Button
                  variant="secondary"
                  onPress={() => {
                    deleteModal.close();
                    setPendingDeleteId(null);
                  }}
                >
                  Cancelar
                </Button>
                <Button variant="danger" onPress={() => void confirmDelete()}>
                  Eliminar
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal.Root>
    </div>
  );
}
