"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  BadgeLabel,
  BadgeRoot,
  Button,
  Card,
  FieldError,
  Input,
  InputGroup,
  Label,
  Modal,
  Skeleton,
  SwitchControl,
  SwitchRoot,
  SwitchThumb,
  Tabs,
  Text,
  TextArea,
  toast,
  Tooltip,
  useOverlayState,
} from "@heroui/react";
import { ArrowLeft, ChefHat, ImagePlus, X } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Controller, useForm, useWatch } from "react-hook-form";

import {
  productoEditGeneralSchema,
  variacionFormSchema,
  type ProductoEditGeneralInput,
  type ProductoEditGeneralValues,
} from "@/lib/product-create-schema";
import type { Recipe } from "@/types/recipe";
import type { Role } from "@/lib/permissions";

import type { CategoriaOption } from "../productos-client";

const money = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 2,
});

const glassStyle = {
  background: "var(--nuba-glass-surface)",
  backdropFilter: "blur(var(--nuba-glass-blur-sm))",
} as const;

const ACCEPT_IMAGE = "image/jpeg,image/png,image/webp";
const MAX_BYTES = 2 * 1024 * 1024;

type ApiProduct = {
  id: string;
  name: string;
  description: string | null;
  sku: string | null;
  image_url: string | null;
  price: number;
  discount_price: number | null;
  stock: number;
  track_stock: boolean;
  stock_alert_threshold: number | null;
  is_active: boolean;
  recipe_id: string | null;
  category_id: string | null;
  category_name: string | null;
  portion_size: number;
  portion_unit: string | null;
  branch_id: string | null;
};

type ApiVariant = {
  id: string;
  name: string;
  sku: string | null;
  price: number | null;
  stock: number;
  is_active: boolean;
};

type ApiRecipeLine = {
  kind: "ingredient" | "sub_recipe";
  name: string;
  quantity: number;
  unit: string;
  unit_cost: number | null;
  line_total: number;
};

type ApiRecipeBreakdown = {
  recipe_id: string;
  recipe_name: string;
  yield_quantity: number;
  yield_unit: string;
  cost_total: number;
  cost_per_portion: number;
  lines: ApiRecipeLine[];
};

type VariantRow = {
  id: string;
  nombre: string;
  sku: string;
  precio: number | null;
  stock: number;
};

function foodCostBadgeClass(pct: number): string {
  if (pct < 30) {
    return "bg-success-soft text-success border border-success/30";
  }
  if (pct <= 50) {
    return "bg-warning-soft text-warning border border-warning/30";
  }
  return "bg-danger-soft text-danger border border-danger/30";
}

function unitLabel(u: string): string {
  const map: Record<string, string> = {
    ml: "ml",
    l: "l",
    g: "g",
    kg: "kg",
    u: "u",
    porciones: "porciones",
  };
  return map[u] ?? u;
}

type ProductoDetalleClientProps = {
  tenantId: string;
  productId: string;
  role: Role;
};

export function ProductoDetalleClient({
  tenantId,
  productId,
  role,
}: ProductoDetalleClientProps) {
  const router = useRouter();
  const canMutate = role === "admin" || role === "supervisor";
  const recipeModal = useOverlayState();
  const deleteDialog = useOverlayState();

  const [loading, setLoading] = useState(true);
  const [productMeta, setProductMeta] = useState<{
    portion_size: number;
    portion_unit: string | null;
    branch_id: string | null;
  } | null>(null);
  const [categories, setCategories] = useState<CategoriaOption[]>([]);
  const [variants, setVariants] = useState<VariantRow[]>([]);
  const [variantSnapshots, setVariantSnapshots] = useState<
    Record<string, string>
  >({});
  const [breakdown, setBreakdown] = useState<ApiRecipeBreakdown | null>(null);
  const [recipeList, setRecipeList] = useState<Recipe[]>([]);
  const [modalRecipeId, setModalRecipeId] = useState<string>("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageRemoved, setImageRemoved] = useState(false);
  const [initialImageUrl, setInitialImageUrl] = useState<string | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [skuLocked, setSkuLocked] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const variantsRef = useRef<VariantRow[]>([]);
  variantsRef.current = variants;

  const form = useForm<
    ProductoEditGeneralInput,
    unknown,
    ProductoEditGeneralValues
  >({
    resolver: zodResolver(productoEditGeneralSchema),
    defaultValues: {
      nombre: "",
      descripcion: "",
      sku: "",
      categoria_id: "",
      precio: undefined,
      precio_descuento: undefined,
      track_stock: false,
      stock: 0,
      stock_alert_threshold: undefined,
      is_active: true,
      recipe_id: "",
    },
  });

  const nombreWatch = useWatch({ control: form.control, name: "nombre" });
  const isActiveWatch = useWatch({ control: form.control, name: "is_active" });
  const recipeIdWatch = useWatch({ control: form.control, name: "recipe_id" });
  const precioWatch = useWatch({ control: form.control, name: "precio" });
  const precioDescWatch = useWatch({
    control: form.control,
    name: "precio_descuento",
  });
  const trackStock = useWatch({ control: form.control, name: "track_stock" });

  const mapProductToForm = useCallback((p: ApiProduct): ProductoEditGeneralInput => {
    return {
      nombre: p.name,
      descripcion: p.description ?? "",
      sku: p.sku ?? "",
      categoria_id: p.category_id ?? "",
      precio: p.price,
      precio_descuento: p.discount_price ?? undefined,
      track_stock: p.track_stock,
      stock: p.stock,
      stock_alert_threshold: p.stock_alert_threshold ?? undefined,
      is_active: p.is_active,
      recipe_id: p.recipe_id ?? "",
    };
  }, []);

  const fetchBreakdown = useCallback(
    async (recipeId: string) => {
      if (!recipeId) {
        setBreakdown(null);
        return;
      }
      try {
        const res = await fetch(
          `/api/${tenantId}/recipes/${recipeId}/cost-breakdown`,
          { credentials: "include" },
        );
        if (!res.ok) {
          setBreakdown(null);
          return;
        }
        const data = (await res.json()) as ApiRecipeBreakdown;
        setBreakdown(data);
      } catch {
        setBreakdown(null);
      }
    },
    [tenantId],
  );

  const loadProduct = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/${tenantId}/productos/${productId}`, {
        credentials: "include",
      });
      if (res.status === 404) {
        router.replace(
          `/${tenantId}/panel/productos?toast=product_not_found`,
        );
        return;
      }
      if (!res.ok) {
        toast.danger("No se pudo cargar el producto.");
        return;
      }
      const data = (await res.json()) as {
        product: ApiProduct;
        variants: ApiVariant[];
        categories: CategoriaOption[];
        recipe_breakdown: ApiRecipeBreakdown | null;
      };
      const p = data.product;
      setProductMeta({
        portion_size: p.portion_size,
        portion_unit: p.portion_unit,
        branch_id: p.branch_id,
      });
      setCategories(data.categories ?? []);
      setSkuLocked(Boolean(p.sku && String(p.sku).trim() !== ""));
      setInitialImageUrl(p.image_url);
      setImageRemoved(false);
      setImageFile(null);
      form.reset(mapProductToForm(p));
      setBreakdown(data.recipe_breakdown);
      const vrows: VariantRow[] = (data.variants ?? []).map((v) => ({
        id: v.id,
        nombre: v.name,
        sku: v.sku ?? "",
        precio: v.price,
        stock: v.stock,
      }));
      setVariants(vrows);
      const snap: Record<string, string> = {};
      for (const r of vrows) {
        snap[r.id] = JSON.stringify({
          nombre: r.nombre,
          sku: r.sku,
          precio: r.precio,
          stock: r.stock,
        });
      }
      setVariantSnapshots(snap);
    } finally {
      setLoading(false);
    }
  }, [form, mapProductToForm, productId, router, tenantId]);

  useEffect(() => {
    void loadProduct();
  }, [loadProduct]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/${tenantId}/recipes?subRecipe=false`, {
          credentials: "include",
        });
        if (!res.ok || cancelled) {
          return;
        }
        const list = (await res.json()) as Recipe[];
        if (!cancelled) {
          setRecipeList(Array.isArray(list) ? list : []);
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  useEffect(() => {
    if (!imageFile) {
      setImagePreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(imageFile);
    setImagePreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

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

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const f = e.dataTransfer.files?.[0];
      if (f) {
        setImageFromFile(f);
      }
    },
    [setImageFromFile],
  );

  const recipeSummary = useMemo(() => {
    if (!breakdown || !productMeta) {
      return null;
    }
    const sale =
      precioDescWatch != null &&
      typeof precioDescWatch === "number" &&
      precioDescWatch > 0
        ? precioDescWatch
        : typeof precioWatch === "number" && precioWatch > 0
          ? precioWatch
          : 0;
    const portion = productMeta.portion_size > 0 ? productMeta.portion_size : 1;
    const foodCost = breakdown.cost_per_portion * portion;
    const fcPct = sale > 0 ? (foodCost / sale) * 100 : 0;
    const profit = sale - foodCost;
    return {
      sale,
      foodCost,
      fcPct,
      profit,
      yieldLabel: `${breakdown.yield_quantity} ${unitLabel(breakdown.yield_unit)}`,
    };
  }, [breakdown, productMeta, precioDescWatch, precioWatch]);

  useEffect(() => {
    const rid =
      typeof recipeIdWatch === "string" && recipeIdWatch.length > 0
        ? recipeIdWatch
        : "";
    if (!rid) {
      setBreakdown(null);
      return;
    }
    void fetchBreakdown(rid);
  }, [recipeIdWatch, fetchBreakdown]);

  const onSubmitGeneral = form.handleSubmit(async (values) => {
    if (!canMutate || !productMeta) {
      return;
    }
    setSubmitting(true);
    try {
      let imageUrl: string | null;
      if (imageRemoved) {
        imageUrl = null;
      } else if (imageFile) {
        const fd = new FormData();
        fd.set("file", imageFile);
        const up = await fetch(`/api/${tenantId}/uploads`, {
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
      } else {
        imageUrl = initialImageUrl;
      }

      const body: Record<string, unknown> = {
        name: values.nombre.trim(),
        description:
          values.descripcion && String(values.descripcion).trim() !== ""
            ? String(values.descripcion).trim()
            : null,
        sku:
          values.sku && String(values.sku).trim() !== ""
            ? String(values.sku).trim()
            : null,
        category_id:
          values.categoria_id && values.categoria_id !== ""
            ? values.categoria_id
            : null,
        price: values.precio,
        discount_price:
          values.precio_descuento != null && values.precio_descuento !== undefined
            ? values.precio_descuento
            : null,
        track_stock: values.track_stock,
        stock: values.track_stock ? (values.stock ?? 0) : 0,
        stock_alert_threshold:
          values.track_stock &&
          values.stock_alert_threshold != null &&
          values.stock_alert_threshold !== undefined
            ? values.stock_alert_threshold
            : null,
        is_active: values.is_active,
        recipe_id:
          values.recipe_id && values.recipe_id !== ""
            ? values.recipe_id
            : null,
        portion_size: productMeta.portion_size,
        portion_unit: productMeta.portion_unit,
        branch_id: productMeta.branch_id,
        image_url: imageUrl,
      };

      const res = await fetch(`/api/${tenantId}/productos/${productId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => null)) as
        | { error?: string }
        | null;
      if (res.status === 409) {
        toast.danger(json?.error ?? "SKU duplicado.");
        return;
      }
      if (!res.ok) {
        toast.danger(json?.error ?? "No se pudieron guardar los cambios.");
        return;
      }
      toast.success("Cambios guardados.");
      setImageFile(null);
      setImageRemoved(false);
      await loadProduct();
    } catch {
      toast.danger("Error de red.");
    } finally {
      setSubmitting(false);
    }
  });

  const persistVariantRow = useCallback(
    async (row: VariantRow) => {
      if (!canMutate) {
        return;
      }
      const parsed = variacionFormSchema.safeParse({
        nombre: row.nombre,
        sku: row.sku || null,
        precio: row.precio,
        stock: row.stock,
      });
      if (!parsed.success) {
        const msg = parsed.error.flatten().fieldErrors.nombre?.[0] ?? "Datos inválidos";
        toast.danger(msg);
        await loadProduct();
        return;
      }
      const body = {
        name: parsed.data.nombre.trim(),
        sku:
          parsed.data.sku && String(parsed.data.sku).trim() !== ""
            ? String(parsed.data.sku).trim()
            : null,
        price: parsed.data.precio ?? null,
        stock: parsed.data.stock,
      };
      try {
        const res = await fetch(
          `/api/${tenantId}/productos/${productId}/variants/${row.id}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify(body),
          },
        );
        const json = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        if (!res.ok) {
          toast.danger(json?.error ?? "No se pudo guardar la variación.");
          await loadProduct();
          return;
        }
        setVariantSnapshots((prev) => ({
          ...prev,
          [row.id]: JSON.stringify({
            nombre: body.name,
            sku: body.sku ?? "",
            precio: body.price,
            stock: body.stock,
          }),
        }));
      } catch {
        toast.danger("Error de red al guardar variación.");
        await loadProduct();
      }
    },
    [canMutate, loadProduct, productId, tenantId],
  );

  const onVariantBlurById = useCallback(
    (id: string) => {
      const row = variantsRef.current.find((r) => r.id === id);
      if (!row) {
        return;
      }
      const snap = variantSnapshots[id];
      const next = JSON.stringify({
        nombre: row.nombre,
        sku: row.sku,
        precio: row.precio,
        stock: row.stock,
      });
      if (snap === next) {
        return;
      }
      void persistVariantRow(row);
    },
    [persistVariantRow, variantSnapshots],
  );

  const addVariant = useCallback(async () => {
    if (!canMutate) {
      return;
    }
    try {
      const res = await fetch(`/api/${tenantId}/productos/${productId}/variants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: "Variación",
          sku: null,
          price: null,
          stock: 0,
        }),
      });
      const json = (await res.json().catch(() => null)) as
        | { id?: string; error?: string }
        | null;
      if (!res.ok || !json?.id) {
        toast.danger(json?.error ?? "No se pudo crear la variación.");
        return;
      }
      const newVariantId = json.id;
      const newRow: VariantRow = {
        id: newVariantId,
        nombre: "Variación",
        sku: "",
        precio: null,
        stock: 0,
      };
      setVariants((v) => [...v, newRow]);
      setVariantSnapshots((prev) => ({
        ...prev,
        [newVariantId]: JSON.stringify({
          nombre: newRow.nombre,
          sku: newRow.sku,
          precio: newRow.precio,
          stock: newRow.stock,
        }),
      }));
    } catch {
      toast.danger("Error de red.");
    }
  }, [canMutate, productId, tenantId]);

  const confirmRecipeInModal = useCallback(() => {
    if (!modalRecipeId) {
      form.setValue("recipe_id", "", { shouldDirty: true });
      setBreakdown(null);
      recipeModal.close();
      return;
    }
    form.setValue("recipe_id", modalRecipeId, { shouldDirty: true });
    void fetchBreakdown(modalRecipeId);
    recipeModal.close();
  }, [fetchBreakdown, form, modalRecipeId, recipeModal]);

  const onConfirmDelete = async () => {
    try {
      const res = await fetch(`/api/${tenantId}/productos/${productId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok && res.status !== 204) {
        throw new Error();
      }
      toast.success("Producto dado de baja.");
      router.push(`/${tenantId}/panel/productos`);
      router.refresh();
    } catch {
      toast.danger("No se pudo eliminar el producto.");
    }
  };

  const errors = form.formState.errors;
  const isDirty = form.formState.isDirty || imageFile != null || imageRemoved;

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center gap-3">
          <Skeleton className="size-9 rounded-lg" />
          <Skeleton className="h-8 w-64 max-w-full rounded-md" />
          <Skeleton className="h-7 w-24 rounded-full" />
          <Skeleton className="ms-auto h-9 w-36 rounded-lg" />
        </div>
        <Skeleton className="h-10 w-full max-w-md rounded-lg" />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="flex flex-col gap-6 lg:col-span-2">
            <Skeleton className="h-72 rounded-xl" />
            <Skeleton className="h-48 rounded-xl" />
          </div>
          <Skeleton className="h-96 rounded-xl lg:col-span-1" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3 gap-y-2">
        <Button
          size="sm"
          variant="ghost"
          isIconOnly
          aria-label="Volver al listado"
          onPress={() => router.push(`/${tenantId}/panel/productos`)}
        >
          <ArrowLeft className="size-5" />
        </Button>
        <Text className="min-w-0 flex-1 text-xl font-semibold tracking-tight text-foreground">
          {nombreWatch?.trim() ? nombreWatch : "Producto"}
        </Text>
        <BadgeRoot
          variant="soft"
          className={
            isActiveWatch
              ? "border border-success/30 bg-success-soft text-success"
              : "border border-border-subtle bg-raised text-foreground-muted"
          }
        >
          <BadgeLabel className="text-xs font-medium">
            {isActiveWatch ? "Activo" : "Inactivo"}
          </BadgeLabel>
        </BadgeRoot>
        {canMutate ? (
          <Button
            type="button"
            variant="primary"
            className="bg-accent text-accent-text hover:bg-accent-hover ms-auto"
            isDisabled={!isDirty || submitting}
            onPress={() => void onSubmitGeneral()}
          >
            Guardar cambios
          </Button>
        ) : null}
      </div>

      <Tabs.Root defaultSelectedKey="general" className="flex flex-col gap-6">
        <Tabs.ListContainer>
          <Tabs.List
            aria-label="Secciones del producto"
            className="flex w-full max-w-md gap-1 rounded-lg border border-border-subtle bg-surface p-1"
          >
            <Tabs.Tab
              id="general"
              className="flex-1 rounded-md px-3 py-2 text-center text-sm font-medium text-foreground-secondary data-selected:bg-raised data-selected:text-foreground"
            >
              General
            </Tabs.Tab>
            <Tabs.Tab
              id="receta"
              className="flex-1 rounded-md px-3 py-2 text-center text-sm font-medium text-foreground-secondary data-selected:bg-raised data-selected:text-foreground"
            >
              Receta
            </Tabs.Tab>
            <Tabs.Tab
              id="variaciones"
              className="flex-1 rounded-md px-3 py-2 text-center text-sm font-medium text-foreground-secondary data-selected:bg-raised data-selected:text-foreground"
            >
              Variaciones
            </Tabs.Tab>
            <Tabs.Indicator className="hidden" />
          </Tabs.List>
        </Tabs.ListContainer>

        <Tabs.Panel id="general" className="flex flex-col gap-6">
          <form
            className="flex flex-col gap-6"
            onSubmit={(e) => {
              e.preventDefault();
              void onSubmitGeneral();
            }}
          >
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <div className="flex flex-col gap-6 lg:col-span-2">
                <Card.Root className="border border-border-subtle" style={glassStyle}>
                  <Card.Header>
                    <Card.Title>General</Card.Title>
                  </Card.Header>
                  <Card.Content className="flex flex-col gap-4">
                    <div className="flex flex-col gap-1">
                      <Label htmlFor="edit-nombre">Nombre</Label>
                      <Input
                        id="edit-nombre"
                        variant="secondary"
                        disabled={!canMutate}
                        {...form.register("nombre")}
                      />
                      {errors.nombre?.message ? (
                        <FieldError>{errors.nombre.message}</FieldError>
                      ) : null}
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label htmlFor="edit-desc">Descripción</Label>
                      <TextArea
                        id="edit-desc"
                        variant="secondary"
                        className="min-h-[100px]"
                        disabled={!canMutate}
                        value={form.watch("descripcion") ?? ""}
                        onChange={(e) =>
                          form.setValue("descripcion", e.currentTarget.value, {
                            shouldDirty: true,
                          })
                        }
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label htmlFor="edit-sku">SKU</Label>
                      {skuLocked ? (
                        <Tooltip.Root delay={200}>
                          <Tooltip.Trigger className="w-full cursor-default text-start">
                            <Input
                              id="edit-sku"
                              variant="secondary"
                              value={form.watch("sku") ?? ""}
                              readOnly
                              className="bg-raised"
                            />
                          </Tooltip.Trigger>
                          <Tooltip.Content offset={8}>
                            El SKU no se puede modificar una vez asignado
                          </Tooltip.Content>
                        </Tooltip.Root>
                      ) : (
                        <Input
                          id="edit-sku"
                          variant="secondary"
                          placeholder="Se genera automáticamente"
                          disabled={!canMutate}
                          {...form.register("sku")}
                        />
                      )}
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label htmlFor="edit-cat">Categoría</Label>
                      <select
                        id="edit-cat"
                        className="h-10 rounded-lg border border-border-subtle bg-background px-3 text-foreground outline-none focus:border-accent"
                        disabled={!canMutate}
                        {...form.register("categoria_id")}
                      >
                        <option value="">Sin categoría</option>
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="flex flex-col gap-1">
                        <Label htmlFor="edit-precio">Precio</Label>
                        <InputGroup.Root variant="secondary">
                          <InputGroup.Prefix className="text-foreground-muted">
                            $
                          </InputGroup.Prefix>
                          <InputGroup.Input
                            id="edit-precio"
                            type="number"
                            inputMode="decimal"
                            step="0.01"
                            min="0"
                            disabled={!canMutate}
                            {...form.register("precio")}
                          />
                        </InputGroup.Root>
                        {errors.precio?.message ? (
                          <FieldError>{String(errors.precio.message)}</FieldError>
                        ) : null}
                      </div>
                      <div className="flex flex-col gap-1">
                        <Label htmlFor="edit-desc-precio">Precio con descuento</Label>
                        <InputGroup.Root variant="secondary">
                          <InputGroup.Prefix className="text-foreground-muted">
                            $
                          </InputGroup.Prefix>
                          <InputGroup.Input
                            id="edit-desc-precio"
                            type="number"
                            inputMode="decimal"
                            step="0.01"
                            min="0"
                            placeholder="Opcional"
                            disabled={!canMutate}
                            {...form.register("precio_descuento")}
                          />
                        </InputGroup.Root>
                        {errors.precio_descuento?.message ? (
                          <FieldError>
                            {errors.precio_descuento.message}
                          </FieldError>
                        ) : null}
                      </div>
                    </div>
                  </Card.Content>
                </Card.Root>

                <Card.Root className="border border-border-subtle" style={glassStyle}>
                  <Card.Header>
                    <Card.Title>Stock</Card.Title>
                  </Card.Header>
                  <Card.Content className="flex flex-col gap-4">
                    <Controller
                      control={form.control}
                      name="track_stock"
                      render={({ field }) => (
                        <div className="flex items-center justify-between gap-4">
                          <Text className="text-sm text-foreground-secondary">
                            Controlar stock
                          </Text>
                          <SwitchRoot
                            isSelected={field.value}
                            onChange={(sel) => {
                              field.onChange(sel);
                              if (!sel) {
                                form.setValue("stock", 0, {
                                  shouldDirty: true,
                                  shouldValidate: true,
                                });
                              }
                            }}
                            isDisabled={!canMutate}
                          >
                            <SwitchControl>
                              <SwitchThumb />
                            </SwitchControl>
                          </SwitchRoot>
                        </div>
                      )}
                    />
                    {trackStock ? (
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="flex flex-col gap-1">
                          <Label htmlFor="edit-stock">Stock</Label>
                          <Input
                            id="edit-stock"
                            type="number"
                            inputMode="numeric"
                            min={0}
                            step={1}
                            variant="secondary"
                            disabled={!canMutate}
                            {...form.register("stock")}
                          />
                          {errors.stock?.message ? (
                            <FieldError>{errors.stock.message}</FieldError>
                          ) : null}
                        </div>
                        <div className="flex flex-col gap-1">
                          <Label htmlFor="edit-alert">Alerta de stock mínimo</Label>
                          <Input
                            id="edit-alert"
                            type="number"
                            inputMode="numeric"
                            min={0}
                            step={1}
                            variant="secondary"
                            placeholder="Opcional"
                            disabled={!canMutate}
                            {...form.register("stock_alert_threshold")}
                          />
                        </div>
                      </div>
                    ) : null}
                  </Card.Content>
                </Card.Root>
              </div>

              <div className="flex flex-col gap-6 lg:col-span-1">
                <Card.Root className="border border-border-subtle" style={glassStyle}>
                  <Card.Header>
                    <Card.Title>Imagen</Card.Title>
                  </Card.Header>
                  <Card.Content className="flex flex-col gap-3">
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
                        className="flex aspect-square w-full max-w-[280px] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border-subtle bg-raised/50 text-foreground-secondary transition-colors hover:border-accent hover:bg-raised disabled:pointer-events-none disabled:opacity-50"
                        onClick={() => fileInputRef.current?.click()}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                        onDrop={canMutate ? onDrop : undefined}
                      >
                        <ImagePlus className="size-10 opacity-70" />
                        <Text className="px-4 text-center text-sm">
                          Arrastrá o hacé clic para subir
                        </Text>
                      </button>
                    ) : (
                      <div className="relative aspect-square w-full max-w-[280px] overflow-hidden rounded-xl border border-border-subtle bg-raised">
                        <Image
                          src={displayImageSrc}
                          alt=""
                          width={560}
                          height={560}
                          unoptimized
                          className="size-full object-cover"
                        />
                        {canMutate ? (
                          <div className="absolute end-2 top-2 flex gap-1">
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              onPress={() => fileInputRef.current?.click()}
                            >
                              Reemplazar
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              isIconOnly
                              aria-label="Quitar imagen"
                              onPress={() => {
                                setImageFile(null);
                                setImageRemoved(true);
                              }}
                            >
                              <X className="size-4" />
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    )}
                    {imageError ? (
                      <Text className="text-sm text-danger">{imageError}</Text>
                    ) : (
                      <Text className="text-xs text-foreground-muted">
                        JPG, PNG o WEBP. Máximo 2 MB.
                      </Text>
                    )}
                  </Card.Content>
                </Card.Root>

                <Card.Root className="border border-border-subtle" style={glassStyle}>
                  <Card.Header>
                    <Card.Title>Estado</Card.Title>
                  </Card.Header>
                  <Card.Content>
                    <Controller
                      control={form.control}
                      name="is_active"
                      render={({ field }) => (
                        <div className="flex items-center justify-between gap-4">
                          <Text className="text-sm text-foreground-secondary">
                            Producto activo
                          </Text>
                          <SwitchRoot
                            isSelected={field.value}
                            onChange={(v) => field.onChange(v)}
                            isDisabled={!canMutate}
                          >
                            <SwitchControl>
                              <SwitchThumb />
                            </SwitchControl>
                          </SwitchRoot>
                        </div>
                      )}
                    />
                  </Card.Content>
                </Card.Root>

                {canMutate ? (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      className="border-danger/40 text-danger hover:bg-danger-soft"
                      onPress={deleteDialog.open}
                    >
                      Eliminar producto
                    </Button>
                  </div>
                ) : null}
              </div>
            </div>
          </form>
        </Tabs.Panel>

        <Tabs.Panel id="receta" className="flex flex-col gap-6">
          {!recipeIdWatch || recipeIdWatch === "" ? (
            <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-border-subtle bg-surface/60 py-14 text-center">
              <ChefHat className="size-12 text-foreground-muted" />
              <Text className="max-w-sm text-foreground-secondary">
                Este producto no tiene receta
              </Text>
              {canMutate ? (
                <Button
                  variant="primary"
                  className="bg-accent text-accent-text hover:bg-accent-hover"
                  onPress={() => {
                    setModalRecipeId("");
                    recipeModal.open();
                  }}
                >
                  Asociar receta
                </Button>
              ) : null}
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Text className="text-lg font-semibold text-foreground">
                  {breakdown?.recipe_name ?? "Receta"}
                </Text>
                {canMutate ? (
                  <Button
                    variant="secondary"
                    onPress={() => {
                      setModalRecipeId(
                        typeof recipeIdWatch === "string" ? recipeIdWatch : "",
                      );
                      recipeModal.open();
                    }}
                  >
                    Cambiar receta
                  </Button>
                ) : null}
              </div>
              {breakdown && breakdown.lines.length > 0 ? (
                <div
                  className="overflow-x-auto rounded-xl border border-border-subtle"
                  style={glassStyle}
                >
                  <table className="w-full min-w-[720px] border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-border-subtle bg-surface/80 text-foreground-secondary">
                        <th className="px-4 py-3 text-start font-medium">
                          Ingrediente / sub-receta
                        </th>
                        <th className="px-4 py-3 text-start font-medium">Cantidad</th>
                        <th className="px-4 py-3 text-start font-medium">Unidad</th>
                        <th className="px-4 py-3 text-end font-medium">Costo unitario</th>
                        <th className="px-4 py-3 text-end font-medium">Costo línea</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-subtle">
                      {breakdown.lines.map((line, idx) => (
                        <tr key={`${line.name}-${idx}`} className="bg-surface/40">
                          <td className="px-4 py-3 font-medium text-foreground">
                            {line.name}
                          </td>
                          <td className="px-4 py-3 tabular-nums text-foreground-secondary">
                            {line.quantity}
                          </td>
                          <td className="px-4 py-3 text-foreground-secondary">
                            {unitLabel(line.unit)}
                          </td>
                          <td className="px-4 py-3 text-end tabular-nums text-foreground-secondary">
                            {line.unit_cost != null
                              ? money.format(line.unit_cost)
                              : "—"}
                          </td>
                          <td className="px-4 py-3 text-end font-medium tabular-nums text-foreground">
                            {money.format(line.line_total)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Text className="text-foreground-muted">
                  No hay líneas de receta o no se pudo cargar el detalle.
                </Text>
              )}
              {recipeSummary && breakdown ? (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <Card.Root className="border border-border-subtle p-3" style={glassStyle}>
                    <Text className="text-xs text-foreground-secondary">
                      Costo total de receta
                    </Text>
                    <Text className="text-lg font-semibold tabular-nums text-foreground">
                      {money.format(breakdown.cost_total)}
                    </Text>
                  </Card.Root>
                  <Card.Root className="border border-border-subtle p-3" style={glassStyle}>
                    <Text className="text-xs text-foreground-secondary">
                      Porciones que rinde
                    </Text>
                    <Text className="text-lg font-semibold text-foreground">
                      {recipeSummary.yieldLabel}
                    </Text>
                  </Card.Root>
                  <Card.Root className="border border-border-subtle p-3" style={glassStyle}>
                    <Text className="text-xs text-foreground-secondary">
                      Costo por porción
                    </Text>
                    <Text className="text-lg font-semibold tabular-nums text-foreground">
                      {money.format(breakdown.cost_per_portion)}
                    </Text>
                  </Card.Root>
                  <Card.Root className="border border-border-subtle p-3" style={glassStyle}>
                    <Text className="text-xs text-foreground-secondary">
                      Precio de venta
                    </Text>
                    <Text className="text-lg font-semibold tabular-nums text-foreground">
                      {money.format(recipeSummary.sale)}
                    </Text>
                  </Card.Root>
                  <Card.Root className="border border-border-subtle p-3" style={glassStyle}>
                    <Text className="text-xs text-foreground-secondary">Food cost %</Text>
                    <BadgeRoot
                      variant="soft"
                      className={`mt-1 w-fit ${foodCostBadgeClass(recipeSummary.fcPct)}`}
                    >
                      <BadgeLabel className="text-sm font-semibold tabular-nums">
                        {recipeSummary.sale > 0
                          ? `${recipeSummary.fcPct.toFixed(1)}%`
                          : "—"}
                      </BadgeLabel>
                    </BadgeRoot>
                  </Card.Root>
                  <Card.Root className="border border-border-subtle p-3" style={glassStyle}>
                    <Text className="text-xs text-foreground-secondary">
                      Ganancia por unidad
                    </Text>
                    <Text className="text-lg font-semibold tabular-nums text-foreground">
                      {money.format(recipeSummary.profit)}
                    </Text>
                  </Card.Root>
                </div>
              ) : null}
            </div>
          )}
        </Tabs.Panel>

        <Tabs.Panel id="variaciones" className="flex flex-col gap-4">
          <Card.Root className="border border-border-subtle" style={glassStyle}>
            <Card.Header>
              <Card.Title>Variaciones</Card.Title>
            </Card.Header>
            <Card.Content className="overflow-x-auto">
              {variants.length === 0 ? (
                <Text className="text-sm text-foreground-muted">
                  Sin variaciones. Podés agregar opciones al pie.
                </Text>
              ) : (
                <table className="w-full min-w-[640px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border-subtle text-foreground-secondary">
                      <th className="px-2 py-2 text-start font-medium">Nombre</th>
                      <th className="px-2 py-2 text-start font-medium">SKU</th>
                      <th className="px-2 py-2 text-start font-medium">Precio</th>
                      <th className="px-2 py-2 text-start font-medium">Stock</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-subtle">
                    {variants.map((row, index) => (
                      <tr key={row.id}>
                        <td className="px-2 py-2 align-middle">
                          <Input
                            variant="secondary"
                            disabled={!canMutate}
                            value={row.nombre}
                            onChange={(e) => {
                              const v = e.currentTarget.value;
                              setVariants((prev) =>
                                prev.map((r, i) =>
                                  i === index ? { ...r, nombre: v } : r,
                                ),
                              );
                            }}
                            onBlur={() => onVariantBlurById(row.id)}
                          />
                        </td>
                        <td className="px-2 py-2 align-middle">
                          <Input
                            variant="secondary"
                            disabled={!canMutate}
                            value={row.sku}
                            onChange={(e) => {
                              const v = e.currentTarget.value;
                              setVariants((prev) =>
                                prev.map((r, i) =>
                                  i === index ? { ...r, sku: v } : r,
                                ),
                              );
                            }}
                            onBlur={() => onVariantBlurById(row.id)}
                          />
                        </td>
                        <td className="px-2 py-2 align-middle">
                          <Input
                            type="number"
                            inputMode="decimal"
                            step="0.01"
                            min="0"
                            variant="secondary"
                            disabled={!canMutate}
                            value={row.precio ?? ""}
                            onChange={(e) => {
                              const raw = e.currentTarget.value;
                              const v =
                                raw === "" ? null : Number(raw.replace(",", "."));
                              setVariants((prev) =>
                                prev.map((r, i) =>
                                  i === index
                                    ? {
                                        ...r,
                                        precio:
                                          v == null || Number.isNaN(v)
                                            ? null
                                            : v,
                                      }
                                    : r,
                                ),
                              );
                            }}
                            onBlur={() => onVariantBlurById(row.id)}
                          />
                        </td>
                        <td className="px-2 py-2 align-middle">
                          <Input
                            type="number"
                            inputMode="numeric"
                            min={0}
                            step={1}
                            variant="secondary"
                            disabled={!canMutate}
                            value={row.stock}
                            onChange={(e) => {
                              const v = Number(e.currentTarget.value);
                              setVariants((prev) =>
                                prev.map((r, i) =>
                                  i === index
                                    ? {
                                        ...r,
                                        stock: Number.isFinite(v) ? v : 0,
                                      }
                                    : r,
                                ),
                              );
                            }}
                            onBlur={() => onVariantBlurById(row.id)}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card.Content>
          </Card.Root>
          {canMutate ? (
            <Button
              type="button"
              variant="secondary"
              className="w-fit"
              onPress={() => void addVariant()}
            >
              Agregar variación
            </Button>
          ) : null}
        </Tabs.Panel>
      </Tabs.Root>

      <Modal.Root state={deleteDialog}>
        <Modal.Backdrop />
        <Modal.Container placement="center" size="md">
          <Modal.Dialog className="max-w-md">
            <Modal.Header>
              <Modal.Heading>¿Dar de baja este producto?</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <Text className="text-foreground-secondary">
                El producto pasará a inactivo y no se mostrará en el catálogo
                activo.
              </Text>
            </Modal.Body>
            <Modal.Footer className="flex justify-end gap-2">
              <Button variant="secondary" onPress={deleteDialog.close}>
                Cancelar
              </Button>
              <Button
                variant="primary"
                className="bg-danger text-white hover:opacity-90"
                onPress={() => {
                  deleteDialog.close();
                  void onConfirmDelete();
                }}
              >
                Confirmar
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Root>

      <Modal.Root state={recipeModal}>
        <Modal.Backdrop />
        <Modal.Container placement="center" size="md">
          <Modal.Dialog className="max-w-md">
            <Modal.Header>
              <Modal.Heading>Seleccionar receta</Modal.Heading>
            </Modal.Header>
            <Modal.Body className="flex flex-col gap-3">
              <Label htmlFor="modal-recipe">Receta</Label>
              <select
                id="modal-recipe"
                className="h-10 rounded-lg border border-border-subtle bg-background px-3 text-foreground outline-none focus:border-accent"
                value={modalRecipeId}
                onChange={(e) => setModalRecipeId(e.target.value)}
              >
                <option value="">Sin receta</option>
                {recipeList.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </Modal.Body>
            <Modal.Footer className="flex justify-end gap-2">
              <Button variant="secondary" onPress={recipeModal.close}>
                Cancelar
              </Button>
              <Button
                variant="primary"
                className="bg-accent text-accent-text hover:bg-accent-hover"
                onPress={confirmRecipeInModal}
              >
                Guardar selección
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Root>
    </div>
  );
}
