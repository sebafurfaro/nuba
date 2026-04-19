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
import { zodResolver } from "@hookform/resolvers/zod";
import {
  AlertDialogBackdrop,
  AlertDialogBody,
  AlertDialogCloseTrigger,
  AlertDialogContainer,
  AlertDialogDialog,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogHeading,
  AlertDialogIcon,
  AlertDialogRoot,
  AlertDialogTrigger,
  BadgeLabel,
  BadgeRoot,
  Button,
  Card,
  FieldError,
  Input,
  Label,
  Modal,
  SwitchControl,
  SwitchRoot,
  SwitchThumb,
  Text,
  TextArea,
  toast,
  Tooltip,
} from "@heroui/react";
import { useOverlayState } from "@heroui/react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  GripVertical,
  ImagePlus,
  Info,
  Layers,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import Image from "next/image";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Controller, useForm } from "react-hook-form";

import { PanelPageHeader } from "@/components/panel/PanelPageHeader";
import {
  categoryFormSchema,
  type CategoryFormValues,
} from "@/lib/category-form-schema";
import type { Role } from "@/lib/permissions";
import type { Category, CategoryTree, CategoryWithChildren } from "@/types/category";

const glassStyle = {
  background: "var(--nuba-glass-surface)",
  backdropFilter: "blur(var(--nuba-glass-blur-sm))",
} as const;

const ACCEPT_IMAGE = "image/jpeg,image/png,image/webp";
const MAX_BYTES = 2 * 1024 * 1024;

type CategoriasClientProps = {
  tenantId: string;
  role: Role;
};

function initialLetter(name: string): string {
  const t = name.trim();
  return t ? t.charAt(0).toUpperCase() : "?";
}

function SortableParentRow({
  node,
  expanded,
  onToggle,
  onEdit,
  onAddChild,
  deleteControl,
  canMutate,
}: {
  node: CategoryWithChildren;
  expanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onAddChild: () => void;
  deleteControl: ReactNode | null;
  canMutate: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: node.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.85 : 1,
  };

  const count = node.product_count ?? 0;

  return (
    <div ref={setNodeRef} style={style} className="border-b border-border-subtle last:border-b-0">
      <div className="flex items-center gap-2 py-2 pe-2 ps-1">
        {canMutate ? (
          <button
            type="button"
            className="cursor-grab touch-none rounded p-1 text-foreground-muted hover:bg-raised active:cursor-grabbing"
            aria-label="Arrastrar"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="size-4" />
          </button>
        ) : (
          <span className="w-6 shrink-0" />
        )}
        <button
          type="button"
          className="shrink-0 rounded p-0.5 text-foreground-muted hover:bg-raised"
          aria-expanded={expanded}
          onClick={onToggle}
        >
          {expanded ? (
            <ChevronDown className="size-4" />
          ) : (
            <ChevronRight className="size-4" />
          )}
        </button>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {node.image_url ? (
            <Image
              src={node.image_url}
              alt=""
              width={32}
              height={32}
              unoptimized
              className="size-8 shrink-0 rounded-full object-cover"
            />
          ) : (
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent">
              {initialLetter(node.name)}
            </div>
          )}
          <span className="min-w-0 truncate font-medium text-foreground">
            {node.name}
          </span>
          <BadgeRoot
            variant="soft"
            className="shrink-0 border border-border-subtle bg-raised text-foreground-muted"
          >
            <BadgeLabel className="text-xs tabular-nums">{count}</BadgeLabel>
          </BadgeRoot>
        </div>
        {canMutate ? (
          <div className="flex shrink-0 items-center gap-0.5">
            <Button
              size="sm"
              variant="ghost"
              isIconOnly
              aria-label="Editar"
              onPress={onEdit}
            >
              <Pencil className="size-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              isIconOnly
              aria-label="Agregar subcategoría"
              onPress={onAddChild}
            >
              <Plus className="size-4" />
            </Button>
            {deleteControl}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SortableChildRow({
  cat,
  onEdit,
  deleteControl,
  canMutate,
}: {
  cat: Category;
  onEdit: () => void;
  deleteControl: ReactNode | null;
  canMutate: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: cat.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.85 : 1,
  };

  const count = cat.product_count ?? 0;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="border-b border-border-subtle py-2 pe-2 ps-[2.25rem] last:border-b-0"
    >
      <div className="flex items-center gap-2">
        {canMutate ? (
          <button
            type="button"
            className="cursor-grab touch-none rounded p-1 text-foreground-muted hover:bg-raised active:cursor-grabbing"
            aria-label="Arrastrar"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="size-4" />
          </button>
        ) : (
          <span className="w-6 shrink-0" />
        )}
        <div className="flex min-w-0 flex-1 items-center gap-2 ps-6">
          {cat.image_url ? (
            <Image
              src={cat.image_url}
              alt=""
              width={28}
              height={28}
              unoptimized
              className="size-7 shrink-0 rounded-full object-cover"
            />
          ) : (
            <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[11px] font-semibold text-accent">
              {initialLetter(cat.name)}
            </div>
          )}
          <span className="min-w-0 truncate text-foreground-secondary">
            {cat.name}
          </span>
          <BadgeRoot
            variant="soft"
            className="shrink-0 border border-border-subtle bg-raised text-foreground-muted"
          >
            <BadgeLabel className="text-xs tabular-nums">{count}</BadgeLabel>
          </BadgeRoot>
        </div>
        {canMutate ? (
          <div className="flex shrink-0 items-center gap-0.5">
            <Button
              size="sm"
              variant="ghost"
              isIconOnly
              aria-label="Editar"
              onPress={onEdit}
            >
              <Pencil className="size-4" />
            </Button>
            {deleteControl}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function DeleteCategoriaDialog({
  categoryName,
  onConfirm,
}: {
  categoryName: string;
  onConfirm: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [errorLine, setErrorLine] = useState<string | null>(null);

  return (
    <AlertDialogRoot
      onOpenChange={(open) => {
        if (!open) {
          setErrorLine(null);
        }
      }}
    >
      <AlertDialogTrigger className="inline-flex">
        <Button
          size="sm"
          variant="ghost"
          isIconOnly
          aria-label="Eliminar categoría"
          className="text-danger"
        >
          <Trash2 className="size-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogBackdrop>
        <AlertDialogContainer placement="center" size="md">
          <AlertDialogDialog className="max-w-md">
            <AlertDialogIcon status="danger" />
            <AlertDialogHeader>
              <AlertDialogHeading>Eliminar categoría</AlertDialogHeading>
            </AlertDialogHeader>
            <AlertDialogBody className="flex flex-col gap-2">
              <Text className="text-foreground-secondary">
                ¿Seguro que querés eliminar{" "}
                <span className="font-semibold text-foreground">{categoryName}</span>
                ?
              </Text>
              {errorLine ? (
                <Text className="text-sm text-danger">{errorLine}</Text>
              ) : null}
            </AlertDialogBody>
            <AlertDialogFooter className="flex justify-end gap-2">
              <AlertDialogCloseTrigger>Cancelar</AlertDialogCloseTrigger>
              <Button
                variant="danger"
                isDisabled={busy}
                onPress={async () => {
                  setBusy(true);
                  setErrorLine(null);
                  try {
                    await onConfirm();
                  } catch (e) {
                    setErrorLine(
                      e instanceof Error ? e.message : "No se pudo eliminar.",
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Eliminar
              </Button>
            </AlertDialogFooter>
          </AlertDialogDialog>
        </AlertDialogContainer>
      </AlertDialogBackdrop>
    </AlertDialogRoot>
  );
}

type FeedbackKind = "success" | "info";

function CategoryFeedbackModal({
  state,
  payload,
  onDismiss,
}: {
  state: ReturnType<typeof useOverlayState>;
  payload: { kind: FeedbackKind; title: string; description?: string } | null;
  onDismiss: () => void;
}) {
  if (!payload) {
    return null;
  }
  const Icon = payload.kind === "success" ? CheckCircle2 : Info;
  const iconClass =
    payload.kind === "success" ? "text-success" : "text-accent";

  const portalTarget =
    typeof document !== "undefined" ? document.body : undefined;

  return (
    <Modal.Root state={state}>
      <Modal.Backdrop
        className="z-[200] flex items-center justify-center p-4"
        UNSTABLE_portalContainer={portalTarget}
      >
        <Modal.Container placement="center" size="md">
          <Modal.Dialog className="max-w-md">
            <Modal.Header className="flex flex-row items-start gap-3 border-0 pb-2">
              <Icon className={`size-10 shrink-0 ${iconClass}`} aria-hidden />
              <Modal.Heading className="flex-1 pt-1">{payload.title}</Modal.Heading>
            </Modal.Header>
            {payload.description ? (
              <Modal.Body className="pt-0">
                <Text className="text-sm text-foreground-secondary">
                  {payload.description}
                </Text>
              </Modal.Body>
            ) : null}
            <Modal.Footer className="flex justify-end border-t border-border-subtle pt-4">
              <Button
                variant="primary"
                className="bg-accent text-accent-text hover:bg-accent-hover"
                onPress={onDismiss}
              >
                Aceptar
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal.Root>
  );
}

export function CategoriasClient({ tenantId, role }: CategoriasClientProps) {
  const canMutate = role === "admin" || role === "supervisor";
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const [tree, setTree] = useState<CategoryTree>([]);
  const [loading, setLoading] = useState(true);
  const [parentOrder, setParentOrder] = useState<string[]>([]);
  const [childOrders, setChildOrders] = useState<Record<string, string[]>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const [panelMode, setPanelMode] = useState<"idle" | "create" | "edit">("idle");
  const [editId, setEditId] = useState<string | null>(null);
  /** Si está definido, `parent_id` del formulario no aplica (categoría raíz con hijos). */
  const [parentFrozen, setParentFrozen] = useState<string | undefined>(undefined);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [initialImageUrl, setInitialImageUrl] = useState<string | null>(null);
  const [imageRemoved, setImageRemoved] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const feedbackModal = useOverlayState();
  const [feedbackPayload, setFeedbackPayload] = useState<{
    kind: FeedbackKind;
    title: string;
    description?: string;
  } | null>(null);

  const dismissFeedback = useCallback(() => {
    feedbackModal.close();
    setFeedbackPayload(null);
  }, [feedbackModal]);

  const showFeedback = useCallback(
    (kind: FeedbackKind, title: string, description?: string) => {
      setFeedbackPayload({ kind, title, description });
      feedbackModal.open();
    },
    [feedbackModal],
  );

  const form = useForm<CategoryFormValues>({
    resolver: zodResolver(categoryFormSchema),
    defaultValues: {
      name: "",
      parent_id: "",
      description: "",
      is_active: true,
    },
  });

  const syncOrdersFromTree = useCallback((t: CategoryTree) => {
    setParentOrder(t.map((r) => r.id));
    const co: Record<string, string[]> = {};
    for (const r of t) {
      co[r.id] = r.children.map((c) => c.id);
    }
    setChildOrders(co);
    setExpanded(new Set(t.map((r) => r.id)));
  }, []);

  const loadTree = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/${tenantId}/categorias`, {
        credentials: "include",
      });
      if (!res.ok) {
        toast.danger("No se pudieron cargar las categorías.");
        return;
      }
      const data = (await res.json()) as CategoryTree;
      setTree(Array.isArray(data) ? data : []);
      syncOrdersFromTree(Array.isArray(data) ? data : []);
    } catch {
      toast.danger("Error de red.");
    } finally {
      setLoading(false);
    }
  }, [syncOrdersFromTree, tenantId]);

  useEffect(() => {
    void loadTree();
  }, [loadTree]);

  useEffect(() => {
    if (!imageFile) {
      setImagePreviewUrl(null);
      return;
    }
    const u = URL.createObjectURL(imageFile);
    setImagePreviewUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [imageFile]);

  const persistSort = useCallback(
    async (items: { id: string; sort_order: number }[]) => {
      try {
        const res = await fetch(`/api/${tenantId}/categorias/ordenar`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ items }),
        });
        if (!res.ok) {
          const j = (await res.json().catch(() => null)) as { error?: string } | null;
          toast.danger(j?.error ?? "No se pudo guardar el orden.");
          await loadTree();
          return;
        }
        showFeedback(
          "info",
          "Orden actualizado",
          "El orden de las categorías se guardó correctamente.",
        );
      } catch {
        toast.danger("Error de red al guardar orden.");
        await loadTree();
      }
    },
    [loadTree, tenantId, showFeedback],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) {
        return;
      }
      const activeId = String(active.id);
      const overId = String(over.id);

      if (parentOrder.includes(activeId) && parentOrder.includes(overId)) {
        const oldIndex = parentOrder.indexOf(activeId);
        const newIndex = parentOrder.indexOf(overId);
        const next = arrayMove(parentOrder, oldIndex, newIndex);
        setParentOrder(next);
        void persistSort(next.map((id, i) => ({ id, sort_order: i })));
        return;
      }

      for (const root of tree) {
        const order = childOrders[root.id] ?? root.children.map((c) => c.id);
        if (order.includes(activeId) && order.includes(overId)) {
          const oi = order.indexOf(activeId);
          const ni = order.indexOf(overId);
          const next = arrayMove(order, oi, ni);
          setChildOrders((prev) => ({ ...prev, [root.id]: next }));
          void persistSort(next.map((id, i) => ({ id, sort_order: i })));
          return;
        }
      }
    },
    [childOrders, parentOrder, persistSort, tree],
  );

  const openCreate = useCallback(
    (parentId?: string) => {
      setPanelMode("create");
      setEditId(null);
      setParentFrozen(undefined);
      setImageFile(null);
      setImageRemoved(false);
      setInitialImageUrl(null);
      setImageError(null);
      form.reset({
        name: "",
        parent_id: parentId ?? "",
        description: "",
        is_active: true,
      });
    },
    [form],
  );

  const openEdit = useCallback(
    async (id: string) => {
      setPanelMode("edit");
      setEditId(id);
      setImageFile(null);
      setImageRemoved(false);
      setImageError(null);
      try {
        const res = await fetch(`/api/${tenantId}/categorias/${id}`, {
          credentials: "include",
        });
        if (!res.ok) {
          toast.danger("No se pudo cargar la categoría.");
          setPanelMode("idle");
          return;
        }
        const row = (await res.json()) as CategoryWithChildren;
        setParentFrozen(
          row.children.length > 0 ? (row.parent_id ?? "") : undefined,
        );
        setInitialImageUrl(row.image_url);
        form.reset({
          name: row.name,
          parent_id: row.parent_id ?? "",
          description: row.description ?? "",
          is_active: row.is_active,
        });
      } catch {
        toast.danger("Error de red.");
        setPanelMode("idle");
      }
    },
    [form, tenantId],
  );

  const closePanel = useCallback(() => {
    setPanelMode("idle");
    setEditId(null);
    setParentFrozen(undefined);
    setImageFile(null);
    setImageRemoved(false);
    setInitialImageUrl(null);
    setImageError(null);
    form.reset({
      name: "",
      parent_id: "",
      description: "",
      is_active: true,
    });
  }, [form]);

  const runDeleteCategory = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/${tenantId}/categorias/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.status === 409) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(j?.error ?? "No se puede eliminar.");
      }
      if (!res.ok && res.status !== 204) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(j?.error ?? "Error al eliminar.");
      }
      if (editId === id) {
        closePanel();
      }
      await loadTree();
      // Esperar un frame tras cerrar el AlertDialog para no apilar overlays ni
      // dejar el scroll del `main` en un estado raro antes del modal de éxito.
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          setTimeout(resolve, 0);
        });
      });
      showFeedback(
        "success",
        "Categoría eliminada",
        "La categoría se quitó del árbol.",
      );
    },
    [tenantId, editId, closePanel, loadTree, showFeedback],
  );

  const displayImageSrc = imageRemoved
    ? null
    : imagePreviewUrl ?? initialImageUrl;

  const setImageFromFile = useCallback((file: File | null) => {
    setImageError(null);
    setImageRemoved(false);
    if (!file) {
      setImageFile(null);
      return;
    }
    if (!ACCEPT_IMAGE.split(",").includes(file.type)) {
      setImageError("Solo JPG, PNG o WEBP.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setImageError("El archivo supera los 2 MB.");
      return;
    }
    setImageFile(file);
  }, []);

  const onSubmit = form.handleSubmit(async (values) => {
    if (!canMutate) {
      return;
    }
    try {
      let imageUrl: string | null | undefined;
      if (imageRemoved) {
        imageUrl = null;
      } else if (imageFile) {
        const fd = new FormData();
        fd.set("file", imageFile);
        const up = await fetch(`/api/${tenantId}/subidas`, {
          method: "POST",
          body: fd,
          credentials: "include",
        });
        const upJson = (await up.json().catch(() => null)) as
          | { url?: string; error?: string }
          | null;
        if (!up.ok) {
          toast.danger(upJson?.error ?? "No se pudo subir la imagen.");
          return;
        }
        imageUrl = upJson?.url?.trim() ? upJson.url.trim() : null;
      } else if (panelMode === "edit") {
        imageUrl = initialImageUrl;
      }

      const parent =
        parentFrozen !== undefined
          ? parentFrozen === ""
            ? null
            : parentFrozen
          : values.parent_id && values.parent_id !== ""
            ? values.parent_id
            : null;
      const description =
        values.description && String(values.description).trim() !== ""
          ? String(values.description).trim()
          : null;

      const body: Record<string, unknown> = {
        name: values.name.trim(),
        description,
        parent_id: parent,
        is_active: values.is_active,
      };
      if (imageUrl !== undefined) {
        body.image_url = imageUrl;
      }

      let successTitle: string | null = null;
      let successDescription: string | undefined;

      if (panelMode === "create") {
        const res = await fetch(`/api/${tenantId}/categorias`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(body),
        });
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        if (!res.ok) {
          toast.danger(j?.error ?? "No se pudo crear.");
          return;
        }
        successTitle = "Categoría creada";
        successDescription = "La categoría ya está en el árbol.";
      } else if (panelMode === "edit" && editId) {
        const res = await fetch(`/api/${tenantId}/categorias/${editId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(body),
        });
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        if (!res.ok) {
          toast.danger(j?.error ?? "No se pudo guardar.");
          return;
        }
        successTitle = "Cambios guardados";
        successDescription = "Los datos se actualizaron correctamente.";
      }
      closePanel();
      await loadTree();
      if (successTitle) {
        showFeedback("success", successTitle, successDescription);
      }
    } catch {
      toast.danger("Error de red.");
    }
  });

  const panelVisible = panelMode !== "idle";
  const errors = form.formState.errors;
  const parentSelectDisabled = parentFrozen !== undefined;

  return (
    <div className="flex flex-col gap-6">
      <PanelPageHeader
        title="Categorías"
        end={
          canMutate ? (
            <Button
              variant="primary"
              className="bg-accent text-accent-text hover:bg-accent-hover"
              onPress={() => openCreate()}
            >
              <Plus className="size-4 shrink-0" />
              Nueva categoría
            </Button>
          ) : null
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <Card.Root
          className={`border border-border-subtle lg:col-span-3 ${loading ? "min-h-[240px]" : ""}`}
          style={glassStyle}
        >
          <Card.Content className="p-0">
            {loading ? (
              <div className="p-6 text-foreground-muted">Cargando…</div>
            ) : tree.length === 0 ? (
              <div className="flex flex-col items-center gap-4 py-16 text-center">
                <Layers className="size-14 text-foreground-muted" />
                <Text className="text-foreground-secondary">
                  Todavía no hay categorías
                </Text>
                {canMutate ? (
                  <Button
                    variant="primary"
                    className="bg-accent text-accent-text hover:bg-accent-hover"
                    onPress={() => openCreate()}
                  >
                    Crear la primera
                  </Button>
                ) : null}
              </div>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={parentOrder}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="divide-y divide-border-subtle">
                    {parentOrder.map((pid) => {
                      const node = tree.find((r) => r.id === pid);
                      if (!node) {
                        return null;
                      }
                      const isEx = expanded.has(node.id);
                      const childIds = childOrders[node.id] ?? node.children.map((c) => c.id);
                      return (
                        <div key={node.id}>
                          <SortableParentRow
                            node={node}
                            expanded={isEx}
                            onToggle={() =>
                              setExpanded((prev) => {
                                const n = new Set(prev);
                                if (n.has(node.id)) {
                                  n.delete(node.id);
                                } else {
                                  n.add(node.id);
                                }
                                return n;
                              })
                            }
                            onEdit={() => void openEdit(node.id)}
                            onAddChild={() => openCreate(node.id)}
                            deleteControl={
                              canMutate ? (
                                <DeleteCategoriaDialog
                                  categoryName={node.name}
                                  onConfirm={() => runDeleteCategory(node.id)}
                                />
                              ) : null
                            }
                            canMutate={canMutate}
                          />
                          {isEx && childIds.length > 0 ? (
                            <SortableContext
                              items={childIds}
                              strategy={verticalListSortingStrategy}
                            >
                              <div className="border-t border-border-subtle bg-surface/40">
                                {childIds.map((cid) => {
                                  const cat = node.children.find((c) => c.id === cid);
                                  if (!cat) {
                                    return null;
                                  }
                                  return (
                                    <SortableChildRow
                                      key={cat.id}
                                      cat={cat}
                                      onEdit={() => void openEdit(cat.id)}
                                      deleteControl={
                                        canMutate ? (
                                          <DeleteCategoriaDialog
                                            categoryName={cat.name}
                                            onConfirm={() => runDeleteCategory(cat.id)}
                                          />
                                        ) : null
                                      }
                                      canMutate={canMutate}
                                    />
                                  );
                                })}
                              </div>
                            </SortableContext>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </Card.Content>
        </Card.Root>

        <div
          className={`lg:col-span-2 ${!panelVisible ? "hidden lg:block" : ""}`}
        >
          {!panelVisible ? (
            <Card.Root className="border border-border-subtle" style={glassStyle}>
              <Card.Content className="py-10 text-center text-sm text-foreground-secondary">
                Seleccioná una categoría o creá una nueva.
              </Card.Content>
            </Card.Root>
          ) : (
            <Card.Root className="border border-border-subtle" style={glassStyle}>
              <Card.Header>
                <Card.Title>
                  {panelMode === "create" ? "Nueva categoría" : "Editar categoría"}
                </Card.Title>
              </Card.Header>
              <Card.Content className="flex flex-col gap-4">
                <div className="flex flex-col gap-1">
                  <Label htmlFor="cat-name">Nombre</Label>
                  <Input
                    id="cat-name"
                    variant="secondary"
                    disabled={!canMutate}
                    {...form.register("name")}
                  />
                  {errors.name?.message ? (
                    <FieldError>{errors.name.message}</FieldError>
                  ) : null}
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="cat-desc">Descripción</Label>
                  <TextArea
                    id="cat-desc"
                    variant="secondary"
                    className="min-h-[88px]"
                    disabled={!canMutate}
                    value={form.watch("description") ?? ""}
                    onChange={(e) =>
                      form.setValue("description", e.currentTarget.value, {
                        shouldValidate: true,
                      })
                    }
                  />
                  {errors.description?.message ? (
                    <FieldError>{errors.description.message}</FieldError>
                  ) : null}
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="cat-parent">Categoría padre</Label>
                  {parentSelectDisabled ? (
                    <Tooltip.Root delay={200}>
                      <Tooltip.Trigger className="w-full text-start">
                        <select
                          id="cat-parent"
                          className="h-10 w-full cursor-not-allowed rounded-lg border border-border-subtle bg-raised px-3 text-foreground-muted opacity-80"
                          disabled
                          value={form.watch("parent_id") ?? ""}
                        >
                          <option value="">Sin padre (raíz)</option>
                          {tree.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name}
                            </option>
                          ))}
                        </select>
                      </Tooltip.Trigger>
                      <Tooltip.Content offset={8}>
                        No podés convertir en subcategoría una categoría que ya tiene
                        hijos
                      </Tooltip.Content>
                    </Tooltip.Root>
                  ) : (
                    <select
                      id="cat-parent"
                      className="h-10 rounded-lg border border-border-subtle bg-background px-3 text-foreground outline-none focus:border-accent"
                      disabled={!canMutate}
                      {...form.register("parent_id")}
                    >
                      <option value="">Sin padre (raíz)</option>
                      {tree.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <Label>Imagen</Label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".jpg,.jpeg,.png,.webp"
                    className="hidden"
                    disabled={!canMutate}
                    onChange={(e) => {
                      const f = e.target.files?.[0] ?? null;
                      setImageFromFile(f);
                      e.target.value = "";
                    }}
                  />
                  {!displayImageSrc ? (
                    <button
                      type="button"
                      disabled={!canMutate}
                      className="flex aspect-video max-h-36 w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border-subtle bg-raised/50 text-foreground-secondary hover:border-accent disabled:pointer-events-none disabled:opacity-50"
                      onClick={() => fileInputRef.current?.click()}
                      onDragOver={(e) => {
                        e.preventDefault();
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        const f = e.dataTransfer.files?.[0];
                        if (f) {
                          setImageFromFile(f);
                        }
                      }}
                    >
                      <ImagePlus className="size-8 opacity-70" />
                      <Text className="text-sm">Arrastrá o hacé clic</Text>
                    </button>
                  ) : (
                    <div className="relative aspect-video max-h-36 w-full overflow-hidden rounded-xl border border-border-subtle">
                      <Image
                        src={displayImageSrc}
                        alt=""
                        width={480}
                        height={270}
                        unoptimized
                        className="size-full object-cover"
                      />
                      {canMutate ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          isIconOnly
                          className="absolute end-2 top-2"
                          aria-label="Quitar imagen"
                          onPress={() => {
                            setImageFile(null);
                            setImageRemoved(true);
                          }}
                        >
                          <X className="size-4" />
                        </Button>
                      ) : null}
                    </div>
                  )}
                  {imageError ? (
                    <Text className="text-sm text-danger">{imageError}</Text>
                  ) : (
                    <Text className="text-xs text-foreground-muted">
                      JPG, PNG o WEBP. Máx. 2 MB.
                    </Text>
                  )}
                </div>
                <Controller
                  control={form.control}
                  name="is_active"
                  render={({ field }) => (
                    <div className="flex items-center justify-between gap-4">
                      <Text className="text-sm text-foreground-secondary">
                        Activa
                      </Text>
                      <SwitchRoot
                        isSelected={field.value}
                        onChange={field.onChange}
                        isDisabled={!canMutate}
                      >
                        <SwitchControl>
                          <SwitchThumb />
                        </SwitchControl>
                      </SwitchRoot>
                    </div>
                  )}
                />
                {canMutate ? (
                  <div className="flex flex-wrap justify-end gap-2 border-t border-border-subtle pt-4">
                    <Button type="button" variant="secondary" onPress={closePanel}>
                      Cancelar
                    </Button>
                    <Button
                      type="button"
                      variant="primary"
                      className="bg-accent text-accent-text hover:bg-accent-hover"
                      onPress={() => void onSubmit()}
                    >
                      Guardar
                    </Button>
                  </div>
                ) : null}
              </Card.Content>
            </Card.Root>
          )}
        </div>
      </div>

      <CategoryFeedbackModal
        state={feedbackModal}
        payload={feedbackPayload}
        onDismiss={dismissFeedback}
      />
    </div>
  );
}
