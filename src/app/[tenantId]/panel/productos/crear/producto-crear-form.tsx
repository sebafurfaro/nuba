"use client";

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
  Button,
  Card,
  FieldError,
  Input,
  InputGroup,
  Label,
  SwitchControl,
  SwitchRoot,
  SwitchThumb,
  Text,
  TextArea,
} from "@heroui/react";
import { ArrowLeft, Building2, EyeOff, ImagePlus, Loader2, Plus, Save, Trash2, X } from "lucide-react";
import { useImageConverter } from "@/hooks";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Controller,
  useFieldArray,
  useForm,
  type SubmitHandler,
} from "react-hook-form";

import {
  categoryTreeToSelectOptions,
  type CategorySelectOption,
} from "@/lib/category-select-options";
import { DialogSuccess } from "@/components/ui/DialogSuccess";
import { DialogWarning } from "@/components/ui/DialogWarning";
import type { BranchProduct } from "@/types/product";
import {
  productoCreateFormSchema,
  type ProductoCreateFormInput,
  type ProductoCreateFormValues,
} from "@/lib/product-create-schema";
import type { CategoryTree } from "@/types/category";

const glassStyle = {
  background: "var(--nuba-glass-surface)",
  backdropFilter: "blur(var(--nuba-glass-blur-sm))",
} as const;

const ACCEPT_IMAGE = "image/jpeg,image/png,image/webp";
const MAX_BYTES = 2 * 1024 * 1024;

const UNIDADES: { value: "ml" | "l" | "g" | "kg" | "u" | "porciones"; label: string }[] =
  [
    { value: "ml", label: "ml" },
    { value: "l", label: "l" },
    { value: "g", label: "g" },
    { value: "kg", label: "kg" },
    { value: "u", label: "u" },
    { value: "porciones", label: "porciones" },
  ];

type ProductoCrearFormProps = {
  tenantId: string;
  /** Si se informa, el formulario actúa en modo edición (misma UI que crear). */
  productId?: string;
};

type ApiProductPayload = {
  product: {
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
    portion_size: number;
    portion_unit: string | null;
    branch_id: string | null;
  };
  variants: {
    id: string;
    name: string;
    sku: string | null;
    price: number | null;
    stock: number;
    is_active?: boolean;
  }[];
  categories: CategorySelectOption[];
};

export function ProductoCrearForm({ tenantId, productId }: ProductoCrearFormProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const productCoreRef = useRef<{
    recipe_id: string | null;
    portion_size: number;
    portion_unit: string | null;
    branch_id: string | null;
  }>({
    recipe_id: null,
    portion_size: 1,
    portion_unit: null,
    branch_id: null,
  });
  const initialVariantIdsRef = useRef<Set<string>>(new Set());
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [initialImageUrl, setInitialImageUrl] = useState<string | null>(null);
  const [imageRemoved, setImageRemoved] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const {
    convert: convertImage,
    isConverting,
    compressionRatio,
  } = useImageConverter({ quality: 0.85, maxWidth: 1200, maxHeight: 1200 });
  const [loadError, setLoadError] = useState<string | null>(null);
  const [categories, setCategories] = useState<CategorySelectOption[]>([]);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [recipeId, setRecipeId] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showErrorDialog, setShowErrorDialog] = useState(false);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [pendingNavId, setPendingNavId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [skuLocked, setSkuLocked] = useState(false);
  const [activeTab, setActiveTab] = useState<"general" | "sucursales">("general");

  const form = useForm<
    ProductoCreateFormInput,
    unknown,
    ProductoCreateFormValues
  >({
    resolver: zodResolver(productoCreateFormSchema),
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
      ingredientes_inline: [],
      variaciones: [],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "variaciones",
  });

  const {
    fields: ingFields,
    append: appendIng,
    remove: removeIng,
  } = useFieldArray({
    control: form.control,
    name: "ingredientes_inline",
  });

  const trackStock = form.watch("track_stock");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingMeta(true);
      setLoadError(null);

      try {
        if (productId) {
          const res = await fetch(`/api/${tenantId}/productos/${productId}`, {
            credentials: "include",
          });
          if (!res.ok) {
            const j = (await res.json().catch(() => null)) as {
              error?: string;
            } | null;
            if (!cancelled) {
              setLoadError(j?.error ?? "No se pudo cargar el producto.");
            }
            return;
          }
          const data = (await res.json()) as ApiProductPayload;
          const p = data.product;
          if (cancelled) {
            return;
          }
          productCoreRef.current = {
            recipe_id: p.recipe_id,
            portion_size: p.portion_size || 1,
            portion_unit: p.portion_unit,
            branch_id: p.branch_id,
          };
          setRecipeId(p.recipe_id);
          setCategories(Array.isArray(data.categories) ? data.categories : []);
          setInitialImageUrl(p.image_url);
          setImageRemoved(false);
          setImageFile(null);
          setSkuLocked(Boolean(p.sku && String(p.sku).trim() !== ""));
          initialVariantIdsRef.current = new Set(
            (data.variants ?? []).map((v) => v.id),
          );
          form.reset({
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
            ingredientes_inline: [],
            variaciones: (data.variants ?? []).map((v) => ({
              id: v.id,
              nombre: v.name,
              sku: v.sku ?? "",
              precio: v.price,
              stock: v.stock,
            })),
          });
        } else {
          const catRes = await fetch(`/api/${tenantId}/categorias`, {
            credentials: "include",
          });
          if (!catRes.ok) {
            const j = (await catRes.json().catch(() => null)) as {
              error?: string;
            } | null;
            if (!cancelled) {
              setLoadError(j?.error ?? "No se pudieron cargar las categorías.");
            }
            return;
          }
          const tree = (await catRes.json()) as CategoryTree;
          if (!cancelled) {
            setCategories(
              Array.isArray(tree) ? categoryTreeToSelectOptions(tree) : [],
            );
          }
        }
      } catch {
        if (!cancelled) {
          setLoadError("Error de red.");
        }
      } finally {
        if (!cancelled) {
          setLoadingMeta(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // form.reset es estable en react-hook-form; incluirlo re-disparaba la carga y borraba cambios del usuario.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al cambiar tenant o producto
  }, [tenantId, productId]);

  const displayImageUrl = useMemo(
    () =>
      imagePreviewUrl ??
      (productId && initialImageUrl && !imageRemoved ? initialImageUrl : null),
    [imagePreviewUrl, productId, initialImageUrl, imageRemoved],
  );

  useEffect(() => {
    if (!imageFile) {
      setImagePreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(imageFile);
    setImagePreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  const setImageFromFile = useCallback((file: File | null) => {
    setImageError(null);
    if (!file) {
      setImageFile(null);
      return;
    }
    setImageRemoved(false);
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

  const clearImage = useCallback(() => {
    if (imageFile) {
      setImageFromFile(null);
    } else {
      setImageRemoved(true);
    }
  }, [imageFile, setImageFromFile]);

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

  const onSubmit: SubmitHandler<ProductoCreateFormValues> = useCallback(
    async (values) => {
      setSubmitError(null);
      setShowErrorDialog(false);
      setSubmitting(true);
      try {
        let imageUrl: string | null = null;
        if (imageFile) {
          const webpFile = await convertImage(imageFile);
          const fd = new FormData();
          fd.set("file", webpFile);
          const up = await fetch(`/api/${tenantId}/subidas`, {
            method: "POST",
            body: fd,
            credentials: "include",
          });
          const upJson = (await up.json().catch(() => null)) as
            | { url?: string; error?: string }
            | null;
          if (!up.ok) {
            setSubmitError(upJson?.error ?? "No se pudo subir la imagen.");
            setShowErrorDialog(true);
            return;
          }
          imageUrl = upJson?.url?.trim() ? upJson.url.trim() : null;
        }

        const rawCat = values.categoria_id;
        const categoria =
          typeof rawCat === "string" && rawCat.trim() !== ""
            ? rawCat.trim()
            : null;

        if (productId) {
          let resolvedImage: string | null;
          if (imageFile) {
            resolvedImage = imageUrl;
          } else if (imageRemoved) {
            resolvedImage = null;
          } else {
            resolvedImage =
              initialImageUrl && String(initialImageUrl).trim() !== ""
                ? String(initialImageUrl).trim()
                : null;
          }

          const core = productCoreRef.current;
          const putBody = {
            name: values.nombre.trim(),
            description:
              values.descripcion && String(values.descripcion).trim() !== ""
                ? String(values.descripcion).trim()
                : null,
            sku:
              values.sku && String(values.sku).trim() !== ""
                ? String(values.sku).trim()
                : null,
            category_id: categoria,
            price: values.precio,
            discount_price:
              values.precio_descuento != null &&
              values.precio_descuento !== undefined
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
            recipe_id: core.recipe_id,
            image_url: resolvedImage,
            portion_size: core.portion_size || 1,
            portion_unit: core.portion_unit,
          };

          const res = await fetch(`/api/${tenantId}/productos/${productId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify(putBody),
          });
          const json = (await res.json().catch(() => null)) as
            | { error?: string }
            | null;
          if (res.status === 409) {
            setSubmitError(json?.error ?? "SKU duplicado.");
            setShowErrorDialog(true);
            return;
          }
          if (!res.ok) {
            setSubmitError(json?.error ?? "No se pudo actualizar el producto.");
            setShowErrorDialog(true);
            return;
          }

          const initialIds = initialVariantIdsRef.current;
          const currentIds = new Set(
            values.variaciones
              .map((v) => v.id)
              .filter((id): id is string => Boolean(id)),
          );
          for (const oldId of initialIds) {
            if (!currentIds.has(oldId)) {
              const del = await fetch(
                `/api/${tenantId}/productos/${productId}/variaciones/${oldId}`,
                { method: "DELETE", credentials: "include" },
              );
              if (!del.ok) {
                const dj = (await del.json().catch(() => null)) as {
                  error?: string;
                } | null;
                setSubmitError(
                  dj?.error ?? "No se pudo eliminar una variación.",
                );
                setShowErrorDialog(true);
                return;
              }
            }
          }

          const nextInitial = new Set<string>();
          for (let i = 0; i < values.variaciones.length; i++) {
            const v = values.variaciones[i]!;
            const payload = {
              name: v.nombre.trim(),
              sku:
                v.sku && String(v.sku).trim() !== ""
                  ? String(v.sku).trim()
                  : null,
              price: v.precio ?? null,
              stock: v.stock ?? 0,
            };
            if (v.id && initialIds.has(v.id)) {
              const vr = await fetch(
                `/api/${tenantId}/productos/${productId}/variaciones/${v.id}`,
                {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  credentials: "include",
                  body: JSON.stringify(payload),
                },
              );
              if (!vr.ok) {
                const vj = (await vr.json().catch(() => null)) as {
                  error?: string;
                } | null;
                setSubmitError(
                  vj?.error ?? "No se pudo actualizar una variación.",
                );
                setShowErrorDialog(true);
                return;
              }
              nextInitial.add(v.id);
            } else {
              const vr = await fetch(
                `/api/${tenantId}/productos/${productId}/variaciones`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  credentials: "include",
                  body: JSON.stringify(payload),
                },
              );
              const vj = (await vr.json().catch(() => null)) as
                | { id?: string; error?: string }
                | null;
              if (vr.status === 409) {
                setSubmitError(vj?.error ?? "SKU de variación duplicado.");
                setShowErrorDialog(true);
                return;
              }
              if (!vr.ok || !vj?.id) {
                setSubmitError(vj?.error ?? "No se pudo crear una variación.");
                setShowErrorDialog(true);
                return;
              }
              form.setValue(`variaciones.${i}.id`, vj.id, {
                shouldValidate: false,
                shouldDirty: true,
              });
              nextInitial.add(vj.id);
            }
          }
          initialVariantIdsRef.current = nextInitial;
          setInitialImageUrl(resolvedImage);
          setImageRemoved(false);
          setImageFile(null);
          router.refresh();
          setShowSuccessDialog(true);
          return;
        }

        const inlineLines = (values.ingredientes_inline ?? []).filter(
          (row) =>
            row.nombre &&
            String(row.nombre).trim() !== "" &&
            row.cantidad != null &&
            row.cantidad > 0,
        );

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
          recipe_id: null,
          image_url: imageUrl,
          variants: values.variaciones.map((v) => ({
            name: v.nombre.trim(),
            sku:
              v.sku && String(v.sku).trim() !== ""
                ? String(v.sku).trim()
                : null,
            price: v.precio ?? null,
            stock: v.stock ?? 0,
          })),
        };

        if (inlineLines.length > 0) {
          body.inline_recipe_ingredients = inlineLines.map((row) => ({
            name: String(row.nombre).trim(),
            quantity: row.cantidad!,
            unit: row.unidad,
          }));
        }

        if (categoria != null) {
          body.category_id = categoria;
        }

        const res = await fetch(`/api/${tenantId}/productos`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(body),
        });
        const json = (await res.json().catch(() => null)) as
          | { id?: string; error?: string }
          | null;

        if (res.status === 409) {
          setSubmitError(json?.error ?? "SKU duplicado.");
          setShowErrorDialog(true);
          return;
        }
        if (!res.ok || !json?.id) {
          setSubmitError(json?.error ?? "No se pudo crear el producto.");
          setShowErrorDialog(true);
          return;
        }
        setPendingNavId(json.id!);
        setShowSuccessDialog(true);
      } catch {
        setSubmitError("Error de red. Intentá de nuevo.");
        setShowErrorDialog(true);
      } finally {
        setSubmitting(false);
      }
    },
    [
      form.setValue,
      imageFile,
      imageRemoved,
      initialImageUrl,
      productId,
      router,
      tenantId,
    ],
  );

  const errors = form.formState.errors;

  return (
    <div className="flex min-h-[calc(100dvh-8.5rem)] flex-col">
      <div className="mb-6 flex shrink-0 items-center gap-3">
        <Button
          size="sm"
          variant="ghost"
          isIconOnly
          aria-label="Volver al listado"
          onPress={() => router.push(`/${tenantId}/panel/productos`)}
        >
          <ArrowLeft className="size-5" />
        </Button>
        <Text className="text-xl font-semibold tracking-tight text-foreground">
          {productId ? "Editar producto" : "Nuevo producto"}
        </Text>
      </div>

      {loadError ? (
        <Text className="mb-4 text-danger">{loadError}</Text>
      ) : null}

      {/* Tab navigation — only in edit mode */}
      {productId ? (
        <div
          className="mb-4 flex gap-1 border-b pb-px"
          style={{ borderColor: "var(--nuba-border-subtle)" }}
        >
          {(
            [
              { key: "general", label: "General" },
              { key: "sucursales", label: "Sucursales", icon: <Building2 className="size-4" /> },
            ] as const
          ).map(({ key, label, icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(key)}
              className="flex items-center gap-1.5 rounded-t px-3 py-2 text-sm font-medium outline-none transition-colors"
              style={{
                color:
                  activeTab === key
                    ? "var(--nuba-accent)"
                    : "var(--nuba-fg-secondary)",
                borderBottom:
                  activeTab === key
                    ? "2px solid var(--nuba-accent)"
                    : "2px solid transparent",
              }}
            >
              {icon}
              {label}
            </button>
          ))}
        </div>
      ) : null}

      <form
        className={`flex flex-1 flex-col gap-6 pb-4${productId && activeTab !== "general" ? " hidden" : ""}`}
        onSubmit={form.handleSubmit(onSubmit)}
      >
        <div className="grid flex-1 grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="flex flex-col gap-6 lg:col-span-2">
            <Card.Root className="border border-border-subtle" style={glassStyle}>
              <Card.Header>
                <Card.Title>General</Card.Title>
              </Card.Header>
              <Card.Content className="flex flex-col gap-4">
                <div className="flex flex-col gap-1">
                  <Label htmlFor="nombre">Nombre</Label>
                  <Input
                    id="nombre"
                    variant="secondary"
                    placeholder="Nombre del producto"
                    disabled={loadingMeta}
                    {...form.register("nombre")}
                  />
                  {errors.nombre?.message ? (
                    <FieldError>{errors.nombre.message}</FieldError>
                  ) : null}
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="descripcion">Descripción</Label>
                  <TextArea
                    id="descripcion"
                    variant="secondary"
                    placeholder="Opcional"
                    className="min-h-[100px]"
                    disabled={loadingMeta}
                    value={form.watch("descripcion") ?? ""}
                    onChange={(e) =>
                      form.setValue("descripcion", e.currentTarget.value, {
                        shouldValidate: true,
                      })
                    }
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="sku">SKU</Label>
                  <Input
                    id="sku"
                    variant="secondary"
                    placeholder="Se genera automáticamente"
                    disabled={loadingMeta || skuLocked}
                    readOnly={skuLocked}
                    {...form.register("sku")}
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="precio">Precio</Label>
                    <Controller
                      control={form.control}
                      name="precio"
                      render={({ field }) => (
                        <InputGroup.Root variant="secondary">
                          <InputGroup.Prefix className="text-foreground-muted">
                            $
                          </InputGroup.Prefix>
                          <InputGroup.Input
                            id="precio"
                            type="number"
                            inputMode="decimal"
                            step="0.01"
                            min="0"
                            placeholder="0"
                            disabled={loadingMeta}
                            name={field.name}
                            ref={field.ref}
                            onBlur={field.onBlur}
                            value={
                              field.value === undefined || field.value === null
                                ? ""
                                : String(field.value)
                            }
                            onChange={(e) => {
                              const v = e.currentTarget.value;
                              field.onChange(v === "" ? undefined : v);
                            }}
                          />
                        </InputGroup.Root>
                      )}
                    />
                    {errors.precio?.message ? (
                      <FieldError>{String(errors.precio.message)}</FieldError>
                    ) : null}
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="precio_descuento">Precio con descuento</Label>
                    <Controller
                      control={form.control}
                      name="precio_descuento"
                      render={({ field }) => (
                        <InputGroup.Root variant="secondary">
                          <InputGroup.Prefix className="text-foreground-muted">
                            $
                          </InputGroup.Prefix>
                          <InputGroup.Input
                            id="precio_descuento"
                            type="number"
                            inputMode="decimal"
                            step="0.01"
                            min="0"
                            placeholder="Opcional"
                            disabled={loadingMeta}
                            name={field.name}
                            ref={field.ref}
                            onBlur={field.onBlur}
                            value={
                              field.value === undefined || field.value === null
                                ? ""
                                : String(field.value)
                            }
                            onChange={(e) => {
                              const v = e.currentTarget.value;
                              field.onChange(v === "" ? undefined : v);
                            }}
                          />
                        </InputGroup.Root>
                      )}
                    />
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
                            form.setValue("stock", 0, { shouldValidate: true });
                          }
                        }}
                        isDisabled={loadingMeta}
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
                      <Label htmlFor="stock">Stock</Label>
                      <Input
                        id="stock"
                        type="number"
                        inputMode="numeric"
                        min={0}
                        step={1}
                        variant="secondary"
                        disabled={loadingMeta}
                        {...form.register("stock")}
                      />
                      {errors.stock?.message ? (
                        <FieldError>{errors.stock.message}</FieldError>
                      ) : null}
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label htmlFor="stock_alert_threshold">
                        Alerta de stock mínimo
                      </Label>
                      <Input
                        id="stock_alert_threshold"
                        type="number"
                        inputMode="numeric"
                        min={0}
                        step={1}
                        variant="secondary"
                        placeholder="Opcional"
                        disabled={loadingMeta}
                        {...form.register("stock_alert_threshold")}
                      />
                    </div>
                  </div>
                ) : null}
              </Card.Content>
            </Card.Root>

            <Card.Root className="border border-border-subtle" style={glassStyle}>
              <Card.Header className="flex flex-row flex-wrap items-center justify-between gap-2">
                <Card.Title>Variaciones</Card.Title>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  isDisabled={loadingMeta}
                  onPress={() =>
                    append({
                      nombre: "Variación",
                      sku: "",
                      precio: null,
                      stock: 0,
                    })
                  }
                >
                  Agregar variación
                </Button>
              </Card.Header>
              <Card.Content className="overflow-x-auto">
                {fields.length === 0 ? (
                  <Text className="text-sm text-foreground-muted">
                    Sin variaciones. Podés agregar tallas, sabores u otras opciones.
                  </Text>
                ) : (
                  <table className="w-full min-w-[640px] border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-border-subtle text-foreground-secondary">
                        <th className="px-2 py-2 text-start font-medium">Nombre</th>
                        <th className="px-2 py-2 text-start font-medium">SKU</th>
                        <th className="px-2 py-2 text-start font-medium">Precio</th>
                        <th className="px-2 py-2 text-start font-medium">Stock</th>
                        <th className="w-12 px-2 py-2 text-end font-medium">
                          <span className="sr-only">Quitar</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-subtle">
                      {fields.map((row, index) => (
                        <tr key={row.id}>
                          <td className="px-2 py-2 align-middle">
                            <Input
                              variant="secondary"
                              aria-label={`Variación ${index + 1} nombre`}
                              {...form.register(`variaciones.${index}.nombre`)}
                            />
                            {errors.variaciones?.[index]?.nombre?.message ? (
                              <FieldError className="mt-1">
                                {errors.variaciones[index]?.nombre?.message}
                              </FieldError>
                            ) : null}
                          </td>
                          <td className="px-2 py-2 align-middle">
                            <Input
                              variant="secondary"
                              aria-label={`Variación ${index + 1} SKU`}
                              {...form.register(`variaciones.${index}.sku`)}
                            />
                          </td>
                          <td className="px-2 py-2 align-middle">
                            <Input
                              type="number"
                              inputMode="decimal"
                              step="0.01"
                              min="0"
                              variant="secondary"
                              {...form.register(`variaciones.${index}.precio`)}
                            />
                          </td>
                          <td className="px-2 py-2 align-middle">
                            <Input
                              type="number"
                              inputMode="numeric"
                              min={0}
                              step={1}
                              variant="secondary"
                              {...form.register(`variaciones.${index}.stock`)}
                            />
                          </td>
                          <td className="px-2 py-2 align-middle">
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              isIconOnly
                              aria-label="Eliminar variación"
                              onPress={() => remove(index)}
                            >
                              <Trash2 className="size-4 text-danger" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </Card.Content>
            </Card.Root>

            {productId ? (
              <IngredientesEdit
                tenantId={tenantId}
                productId={productId}
                initialRecipeId={recipeId}
                onRecipeCreated={(id) => {
                  setRecipeId(id);
                  productCoreRef.current = { ...productCoreRef.current, recipe_id: id };
                }}
                glassStyle={glassStyle}
              />
            ) : (
              <Card.Root className="border border-border-subtle" style={glassStyle}>
                <Card.Header className="flex flex-row flex-wrap items-center justify-between gap-2">
                  <Card.Title>Ingredientes (opcional)</Card.Title>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    isDisabled={loadingMeta}
                    onPress={() =>
                      appendIng({
                        nombre: "",
                        cantidad: 1,
                        unidad: "g",
                      })
                    }
                  >
                    <Plus className="size-4 shrink-0" />
                    Agregar
                  </Button>
                </Card.Header>
                <Card.Content className="flex flex-col gap-3">
                  <Text className="text-sm text-foreground-secondary">
                    Opcional: se crea una receta y filas en ingredientes (costo 0 hasta
                    que los actualices).
                  </Text>
                  {ingFields.length === 0 ? (
                    <Text className="text-sm text-foreground-muted">
                      Sin ingredientes. Usá &quot;Agregar&quot; si querés cargar la
                      composición ahora.
                    </Text>
                  ) : (
                    <div className="flex flex-col gap-3">
                      {ingFields.map((row, index) => (
                        <div
                          key={row.id}
                          className="grid gap-2 rounded-lg border border-border-subtle bg-raised/40 p-3 sm:grid-cols-[1fr_100px_120px_auto]"
                        >
                          <div className="flex flex-col gap-1">
                            <Label htmlFor={`ing-nombre-${index}`}>Nombre</Label>
                            <Input
                              id={`ing-nombre-${index}`}
                              variant="secondary"
                              placeholder="Ej. Harina 000"
                              disabled={loadingMeta}
                              {...form.register(`ingredientes_inline.${index}.nombre`)}
                            />
                            {errors.ingredientes_inline?.[index]?.nombre?.message ? (
                              <FieldError>
                                {errors.ingredientes_inline[index]?.nombre?.message}
                              </FieldError>
                            ) : null}
                          </div>
                          <div className="flex flex-col gap-1">
                            <Label htmlFor={`ing-cant-${index}`}>Cantidad</Label>
                            <Input
                              id={`ing-cant-${index}`}
                              type="number"
                              inputMode="decimal"
                              step="any"
                              min={0}
                              variant="secondary"
                              disabled={loadingMeta}
                              {...form.register(`ingredientes_inline.${index}.cantidad`)}
                            />
                            {errors.ingredientes_inline?.[index]?.cantidad?.message ? (
                              <FieldError>
                                {errors.ingredientes_inline[index]?.cantidad?.message}
                              </FieldError>
                            ) : null}
                          </div>
                          <div className="flex flex-col gap-1">
                            <Label htmlFor={`ing-unidad-${index}`}>Unidad</Label>
                            <select
                              id={`ing-unidad-${index}`}
                              className="h-10 rounded-lg border border-border-subtle bg-background px-3 text-foreground outline-none focus:border-accent"
                              disabled={loadingMeta}
                              {...form.register(`ingredientes_inline.${index}.unidad`)}
                            >
                              {UNIDADES.map((u) => (
                                <option key={u.value} value={u.value}>
                                  {u.label}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="flex items-end justify-end">
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              isIconOnly
                              aria-label="Quitar ingrediente"
                              onPress={() => removeIng(index)}
                            >
                              <Trash2 className="size-4 text-danger" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Card.Content>
              </Card.Root>
            )}
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
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    setImageFromFile(f);
                    e.target.value = "";
                  }}
                />
                {!displayImageUrl ? (
                  <button
                    type="button"
                    className="flex aspect-square w-full max-w-[280px] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border-subtle bg-raised/50 text-foreground-secondary transition-colors hover:border-accent hover:bg-raised"
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onDrop={onDrop}
                  >
                    <ImagePlus className="size-10 opacity-70" />
                    <Text className="px-4 text-center text-sm">
                      Arrastrá o hacé clic para subir
                    </Text>
                  </button>
                ) : (
                  <div className="relative aspect-square w-full max-w-[280px] overflow-hidden rounded-xl border border-border-subtle bg-raised">
                    <Image
                      src={displayImageUrl}
                      alt="Vista previa"
                      width={560}
                      height={560}
                      unoptimized
                      className="size-full object-cover"
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      isIconOnly
                      className="absolute end-2 top-2"
                      aria-label="Quitar imagen"
                      onPress={clearImage}
                    >
                      <X className="size-4" />
                    </Button>
                  </div>
                )}
                {imageError ? (
                  <Text className="text-sm text-danger">{imageError}</Text>
                ) : (
                  <Text className="text-xs text-foreground-muted">
                    JPG, PNG o WEBP. Máximo 2 MB.
                  </Text>
                )}
                {isConverting && (
                  <Text className="text-xs" style={{ color: "var(--foreground-muted)", marginTop: 4 }}>
                    Optimizando imagen...
                  </Text>
                )}
                {!isConverting && compressionRatio !== null && compressionRatio > 0 && (
                  <Text className="text-xs" style={{ color: "var(--success)", marginTop: 4 }}>
                    Imagen optimizada — {compressionRatio}% más liviana
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
                        onChange={(selected) => field.onChange(selected)}
                        isDisabled={loadingMeta}
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

            <Card.Root className="border border-border-subtle" style={glassStyle}>
              <Card.Header>
                <Card.Title>Categoría</Card.Title>
              </Card.Header>
              <Card.Content className="flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                  <Label htmlFor="categoria_id">Asignar categoría</Label>
                  <select
                    id="categoria_id"
                    className="h-10 rounded-lg border border-border-subtle bg-background px-3 text-foreground outline-none focus:border-accent"
                    disabled={loadingMeta}
                    {...form.register("categoria_id")}
                  >
                    <option value="">Sin categoría</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  {!loadingMeta && categories.length === 0 ? (
                    <Text className="text-sm text-foreground-secondary">
                      No hay categorías activas.{" "}
                      <Link
                        href={`/${tenantId}/panel/categorias`}
                        className="text-accent underline underline-offset-2 hover:opacity-90"
                      >
                        Gestioná categorías
                      </Link>
                      .
                    </Text>
                  ) : null}
                  {errors.categoria_id?.message ? (
                    <FieldError>{String(errors.categoria_id.message)}</FieldError>
                  ) : null}
                </div>
              </Card.Content>
            </Card.Root>
          </div>
        </div>

        <footer className="sticky bottom-0 z-20 -mx-4 mt-auto border-t border-border-subtle bg-background/95 px-4 py-4 backdrop-blur-md md:-mx-6 md:px-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              {productId ? (
                <EliminarProductoEditDialog
                  name={form.watch("nombre") || "este producto"}
                  isDisabled={submitting || loadingMeta}
                  onConfirm={async () => {
                    const res = await fetch(
                      `/api/${tenantId}/productos/${productId}`,
                      { method: "DELETE", credentials: "include" },
                    );
                    if (!res.ok) {
                      const j = (await res.json().catch(() => null)) as {
                        error?: string;
                      } | null;
                      throw new Error(j?.error ?? "No se pudo eliminar.");
                    }
                    router.push(`/${tenantId}/panel/productos`);
                    router.refresh();
                  }}
                />
              ) : null}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                isDisabled={submitting}
                onPress={() => router.push(`/${tenantId}/panel/productos`)}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                variant="primary"
                className="bg-accent text-accent-text hover:bg-accent-hover"
                isDisabled={loadingMeta || submitting}
              >
                {productId ? "Guardar cambios" : "Guardar producto"}
              </Button>
            </div>
          </div>
        </footer>
      </form>

      {/* Sucursales tab — only in edit mode */}
      {productId && activeTab === "sucursales" ? (
        <SucursalesTab
          tenantId={tenantId}
          productId={productId}
          basePrice={form.watch("precio") ?? 0}
        />
      ) : null}

      <DialogSuccess
        isOpen={showSuccessDialog}
        onClose={() => {
          setShowSuccessDialog(false);
          if (pendingNavId) {
            router.push(`/${tenantId}/panel/productos/${pendingNavId}`);
            router.refresh();
          }
        }}
        title={productId ? "Cambios guardados" : "Producto creado"}
        description={
          productId
            ? "Los cambios se aplicaron correctamente."
            : "El producto fue creado. Podés seguir editando sus detalles."
        }
      />

      <DialogWarning
        isOpen={showErrorDialog}
        onClose={() => setShowErrorDialog(false)}
        title="No se pudo guardar"
        description={submitError ?? "Ocurrió un error inesperado."}
        confirmLabel="Entendido"
        cancelLabel="Cerrar"
        onConfirm={() => setShowErrorDialog(false)}
      />
    </div>
  );
}

// ─── Ingredientes Edit ────────────────────────────────────────────────────────

type IngItemView = {
  item_id: string;
  ingredient_id: string;
  name: string;
  quantity: number;
  unit: string;
};

const UNIDADES_EDIT = ["ml", "l", "g", "kg", "u", "porciones"] as const;

function IngredientesEdit({
  tenantId,
  productId,
  initialRecipeId,
  onRecipeCreated,
  glassStyle,
}: {
  tenantId: string;
  productId: string;
  initialRecipeId: string | null;
  onRecipeCreated: (id: string) => void;
  glassStyle: { background: string; backdropFilter: string };
}) {
  const [items, setItems] = useState<IngItemView[]>([]);
  const [recipeId, setRecipeId] = useState<string | null>(initialRecipeId);
  const [loading, setLoading] = useState(false);
  const [editQty, setEditQty] = useState<Record<string, string>>({});
  const [editUnit, setEditUnit] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<IngItemView | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showError, setShowError] = useState(false);
  // Add form
  const [addNombre, setAddNombre] = useState("");
  const [addCantidad, setAddCantidad] = useState("1");
  const [addUnidad, setAddUnidad] = useState<string>("g");
  const [adding, setAdding] = useState(false);

  const load = useCallback(async (rid: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/${tenantId}/recetas/${rid}`, { credentials: "include" });
      if (!res.ok) return;
      const data = (await res.json()) as {
        items: {
          id: string;
          ingredient_id: string | null;
          quantity: number;
          unit: string;
          ingredient?: { name: string } | null;
        }[];
      };
      const mapped: IngItemView[] = data.items
        .filter((i) => i.ingredient_id)
        .map((i) => ({
          item_id: i.id,
          ingredient_id: i.ingredient_id!,
          name: i.ingredient?.name ?? "—",
          quantity: i.quantity,
          unit: i.unit,
        }));
      setItems(mapped);
      setEditQty(Object.fromEntries(mapped.map((i) => [i.item_id, String(i.quantity)])));
      setEditUnit(Object.fromEntries(mapped.map((i) => [i.item_id, i.unit])));
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    if (initialRecipeId) {
      setRecipeId(initialRecipeId);
      void load(initialRecipeId);
    }
  }, [initialRecipeId, load]);

  async function handleSave(item: IngItemView) {
    const qty = parseFloat(editQty[item.item_id] ?? "");
    const unit = editUnit[item.item_id] ?? item.unit;
    if (!Number.isFinite(qty) || qty <= 0) {
      setErrorMsg("La cantidad debe ser un número positivo.");
      setShowError(true);
      return;
    }
    setSaving(item.item_id);
    try {
      const res = await fetch(
        `/api/${tenantId}/recetas/${recipeId}/lineas/${item.item_id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ quantity: qty, unit }),
        },
      );
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        setErrorMsg(j?.error ?? "No se pudo guardar.");
        setShowError(true);
        return;
      }
      setItems((prev) =>
        prev.map((i) => (i.item_id === item.item_id ? { ...i, quantity: qty, unit } : i)),
      );
    } finally {
      setSaving(null);
    }
  }

  async function handleDelete(item: IngItemView) {
    setDeleting(true);
    try {
      const res = await fetch(
        `/api/${tenantId}/recetas/${recipeId}/lineas/${item.item_id}`,
        { method: "DELETE", credentials: "include" },
      );
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        setErrorMsg(j?.error ?? "No se pudo eliminar.");
        setShowError(true);
        return;
      }
      setItems((prev) => prev.filter((i) => i.item_id !== item.item_id));
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }

  async function handleAdd() {
    const nombre = addNombre.trim();
    const qty = parseFloat(addCantidad);
    if (!nombre) {
      setErrorMsg("El nombre del ingrediente no puede estar vacío.");
      setShowError(true);
      return;
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      setErrorMsg("La cantidad debe ser un número positivo.");
      setShowError(true);
      return;
    }
    setAdding(true);
    try {
      const res = await fetch(`/api/${tenantId}/productos/${productId}/ingredientes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ nombre, cantidad: qty, unidad: addUnidad }),
      });
      const j = (await res.json().catch(() => null)) as {
        item?: { id: string; quantity: number; unit: string; ingredient?: { name: string } };
        recipe_id?: string;
        error?: string;
      } | null;
      if (!res.ok) {
        setErrorMsg(j?.error ?? "No se pudo agregar el ingrediente.");
        setShowError(true);
        return;
      }
      // If a new recipe was created, notify parent
      if (j?.recipe_id && j.recipe_id !== recipeId) {
        setRecipeId(j.recipe_id);
        onRecipeCreated(j.recipe_id);
      }
      if (j?.item) {
        const newItem: IngItemView = {
          item_id: j.item.id,
          ingredient_id: j.item.id,
          name: nombre,
          quantity: j.item.quantity,
          unit: j.item.unit,
        };
        setItems((prev) => [...prev, newItem]);
        setEditQty((prev) => ({ ...prev, [newItem.item_id]: String(newItem.quantity) }));
        setEditUnit((prev) => ({ ...prev, [newItem.item_id]: newItem.unit }));
      }
      setAddNombre("");
      setAddCantidad("1");
      setAddUnidad("g");
    } finally {
      setAdding(false);
    }
  }

  return (
    <>
      <DialogWarning
        isOpen={showError}
        onClose={() => setShowError(false)}
        title="Error"
        description={errorMsg ?? "Ocurrió un error inesperado."}
        confirmLabel="Entendido"
        cancelLabel="Cerrar"
        onConfirm={() => setShowError(false)}
      />
      <DialogWarning
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Eliminar ingrediente"
        description={`¿Eliminar "${deleteTarget?.name}" de la receta? Esta acción no se puede deshacer.`}
        confirmLabel="Sí, eliminar"
        cancelLabel="Cancelar"
        onConfirm={() => deleteTarget && void handleDelete(deleteTarget)}
      />

      <Card.Root className="border border-border-subtle" style={glassStyle}>
        <Card.Header className="flex flex-row flex-wrap items-center justify-between gap-2">
          <Card.Title>Ingredientes</Card.Title>
        </Card.Header>
        <Card.Content className="flex flex-col gap-4">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-foreground-muted">
              <Loader2 className="size-4 animate-spin" />
              Cargando ingredientes...
            </div>
          ) : items.length === 0 ? (
            <Text className="text-sm text-foreground-muted">
              Sin ingredientes. Usá el formulario de abajo para agregar.
            </Text>
          ) : (
            <table className="w-full min-w-[480px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border-subtle text-foreground-secondary">
                  <th className="px-2 py-2 text-start font-medium">Ingrediente</th>
                  <th className="px-2 py-2 text-start font-medium">Cantidad</th>
                  <th className="px-2 py-2 text-start font-medium">Unidad</th>
                  <th className="w-20 px-2 py-2 text-end font-medium">
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {items.map((item) => {
                  const isSaving = saving === item.item_id;
                  return (
                    <tr key={item.item_id}>
                      <td className="px-2 py-2 align-middle font-medium text-foreground">
                        {item.name}
                      </td>
                      <td className="px-2 py-2 align-middle">
                        <input
                          type="number"
                          inputMode="decimal"
                          step="any"
                          min="0"
                          className="w-24 rounded-lg border border-border-subtle bg-background px-2 py-1.5 text-sm text-foreground outline-none focus:border-accent"
                          value={editQty[item.item_id] ?? ""}
                          onChange={(e) =>
                            setEditQty((p) => ({ ...p, [item.item_id]: e.target.value }))
                          }
                          disabled={isSaving}
                        />
                      </td>
                      <td className="px-2 py-2 align-middle">
                        <select
                          className="rounded-lg border border-border-subtle bg-background px-2 py-1.5 text-sm text-foreground outline-none focus:border-accent"
                          value={editUnit[item.item_id] ?? item.unit}
                          onChange={(e) =>
                            setEditUnit((p) => ({ ...p, [item.item_id]: e.target.value }))
                          }
                          disabled={isSaving}
                        >
                          {UNIDADES_EDIT.map((u) => (
                            <option key={u} value={u}>{u}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2 py-2 align-middle">
                        <div className="flex justify-end gap-1">
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            isIconOnly
                            aria-label="Guardar cambios"
                            isDisabled={isSaving || deleting}
                            onPress={() => void handleSave(item)}
                          >
                            {isSaving ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <Save className="size-4 text-accent" />
                            )}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            isIconOnly
                            aria-label="Eliminar ingrediente"
                            isDisabled={isSaving || deleting}
                            onPress={() => setDeleteTarget(item)}
                          >
                            <Trash2 className="size-4 text-danger" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {/* Add ingredient form */}
          <div
            className="flex flex-wrap items-end gap-3 rounded-xl border border-border-subtle bg-raised/40 p-3"
          >
            <div className="flex min-w-[160px] flex-1 flex-col gap-1">
              <label className="text-xs font-medium text-foreground-secondary">Nombre</label>
              <input
                type="text"
                className="h-9 rounded-lg border border-border-subtle bg-background px-3 text-sm text-foreground outline-none focus:border-accent"
                placeholder="Ej. Harina 000"
                value={addNombre}
                onChange={(e) => setAddNombre(e.target.value)}
                disabled={adding}
              />
            </div>
            <div className="flex w-24 flex-col gap-1">
              <label className="text-xs font-medium text-foreground-secondary">Cantidad</label>
              <input
                type="number"
                inputMode="decimal"
                step="any"
                min="0"
                className="h-9 rounded-lg border border-border-subtle bg-background px-3 text-sm text-foreground outline-none focus:border-accent"
                value={addCantidad}
                onChange={(e) => setAddCantidad(e.target.value)}
                disabled={adding}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-foreground-secondary">Unidad</label>
              <select
                className="h-9 rounded-lg border border-border-subtle bg-background px-3 text-sm text-foreground outline-none focus:border-accent"
                value={addUnidad}
                onChange={(e) => setAddUnidad(e.target.value)}
                disabled={adding}
              >
                {UNIDADES_EDIT.map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            </div>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              isDisabled={adding}
              onPress={() => void handleAdd()}
            >
              {adding ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4 shrink-0" />
              )}
              Agregar
            </Button>
          </div>
        </Card.Content>
      </Card.Root>
    </>
  );
}

// ─── Eliminar producto ────────────────────────────────────────────────────────

function EliminarProductoEditDialog({
  name,
  isDisabled,
  onConfirm,
}: {
  name: string;
  isDisabled?: boolean;
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
          type="button"
          size="sm"
          variant="ghost"
          isDisabled={isDisabled}
          className="text-danger"
        >
          Desactivar producto
        </Button>
      </AlertDialogTrigger>
      <AlertDialogBackdrop>
        <AlertDialogContainer placement="center" size="md">
          <AlertDialogDialog className="max-w-md">
            <AlertDialogIcon status="danger" />
            <AlertDialogHeader>
              <AlertDialogHeading>Desactivar producto</AlertDialogHeading>
            </AlertDialogHeader>
            <AlertDialogBody className="flex flex-col gap-2">
              <Text className="text-foreground-secondary">
                ¿Seguro que querés desactivar{" "}
                <span className="font-semibold text-foreground">{name}</span>? Podés
                volver a activarlo desde el listado.
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
                      e instanceof Error ? e.message : "No se pudo desactivar.",
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Desactivar
              </Button>
            </AlertDialogFooter>
          </AlertDialogDialog>
        </AlertDialogContainer>
      </AlertDialogBackdrop>
    </AlertDialogRoot>
  );
}

// ─── Sucursales Tab ───────────────────────────────────────────────────────────

type SucursalesData = {
  is_global: boolean;
  assignments: BranchProduct[];
  all_branches: { id: string; name: string; city: string | null; is_active: boolean }[];
};

function fmt(n: number) {
  return n.toLocaleString("es-AR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function SucursalesTab({
  tenantId,
  productId,
  basePrice,
}: {
  tenantId: string;
  productId: string;
  basePrice: number;
}) {
  const [data, setData] = useState<SucursalesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isGlobal, setIsGlobal] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [savingBranch, setSavingBranch] = useState<string | null>(null);
  const [priceInputs, setPriceInputs] = useState<Record<string, string>>({});
  const [successMsg, setSuccessMsg] = useState("");
  const [successOpen, setSuccessOpen] = useState(false);
  const [warnMsg, setWarnMsg] = useState("");
  const [warnOpen, setWarnOpen] = useState(false);
  const [confirmUnassign, setConfirmUnassign] = useState<{ branchId: string; branchName: string } | null>(null);
  const [confirmGlobalOff, setConfirmGlobalOff] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/${tenantId}/productos/${productId}/sucursales`, {
        cache: "no-store",
        credentials: "include",
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string };
        setWarnMsg(j?.error ?? "No se pudieron cargar las sucursales");
        setWarnOpen(true);
        return;
      }
      const json = (await res.json()) as SucursalesData;
      setData(json);
      setIsGlobal(json.is_global);
      // Inicializar inputs de precio desde las asignaciones
      const inputs: Record<string, string> = {};
      for (const a of json.assignments) {
        inputs[a.branch_id] = a.price_override != null ? String(a.price_override) : "";
      }
      setPriceInputs(inputs);
    } finally {
      setLoading(false);
    }
  }, [tenantId, productId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Togglear is_global
  async function handleGlobalToggle(newVal: boolean) {
    if (!newVal) {
      // Confirmar antes de desactivar global
      setConfirmGlobalOff(true);
      return;
    }
    await applyGlobalToggle(true);
  }

  async function applyGlobalToggle(newVal: boolean) {
    setToggling(true);
    try {
      const res = await fetch(`/api/${tenantId}/productos/${productId}/global`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ is_global: newVal }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string };
        setWarnMsg(j?.error ?? "No se pudo actualizar");
        setWarnOpen(true);
        return;
      }
      setIsGlobal(newVal);
      setSuccessMsg(
        newVal
          ? "Producto marcado como global — disponible en todas las sucursales"
          : "El producto ahora es específico por sucursal",
      );
      setSuccessOpen(true);
      await load();
    } finally {
      setToggling(false);
    }
  }

  // Asignar / desasignar
  async function handleToggleBranch(branchId: string, assign: boolean) {
    if (!assign) {
      const branch = data?.all_branches.find((b) => b.id === branchId);
      setConfirmUnassign({ branchId, branchName: branch?.name ?? branchId });
      return;
    }
    setSavingBranch(branchId);
    try {
      const res = await fetch(`/api/${tenantId}/productos/${productId}/sucursales`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ branch_id: branchId }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string };
        setWarnMsg(j?.error ?? "No se pudo asignar");
        setWarnOpen(true);
        return;
      }
      await load();
    } finally {
      setSavingBranch(null);
    }
  }

  async function confirmUnassignBranch(branchId: string) {
    setSavingBranch(branchId);
    try {
      const res = await fetch(
        `/api/${tenantId}/productos/${productId}/sucursales/${branchId}`,
        { method: "DELETE", credentials: "include" },
      );
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string };
        setWarnMsg(j?.error ?? "No se pudo desasignar");
        setWarnOpen(true);
        return;
      }
      await load();
    } finally {
      setSavingBranch(null);
      setConfirmUnassign(null);
    }
  }

  // Guardar precio override al perder foco
  async function handlePriceBlur(branchId: string) {
    const raw = priceInputs[branchId] ?? "";
    const parsed = raw === "" ? null : Number(raw);
    if (raw !== "" && (isNaN(parsed!) || parsed! <= 0)) return; // valor inválido

    setSavingBranch(branchId);
    try {
      const res = await fetch(
        `/api/${tenantId}/productos/${productId}/sucursales/${branchId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ price_override: parsed }),
        },
      );
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string };
        setWarnMsg(j?.error ?? "No se pudo guardar el precio");
        setWarnOpen(true);
      } else {
        await load();
      }
    } finally {
      setSavingBranch(null);
    }
  }

  const glassStyle = {
    background: "var(--nuba-glass-surface)",
    backdropFilter: "blur(var(--nuba-glass-blur-sm))",
  } as const;

  if (loading) {
    return (
      <div className="flex flex-col gap-3 animate-pulse">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 rounded-xl" style={{ background: "var(--nuba-raised)" }} />
        ))}
      </div>
    );
  }

  if (!data) return null;

  // Construir vista de sucursales
  const branchRows = data.all_branches.filter((b) => b.is_active).map((branch) => {
    const assignment = data.assignments.find((a) => a.branch_id === branch.id);
    const isAssigned = isGlobal
      ? assignment == null || assignment.is_active  // global: activo salvo exclusión explícita
      : assignment != null && assignment.is_active;  // específico: sólo si está asignado y activo
    const priceOverride = priceInputs[branch.id] ?? "";
    const effectivePrice =
      priceOverride !== "" && !isNaN(Number(priceOverride)) && Number(priceOverride) > 0
        ? Number(priceOverride)
        : basePrice;

    return { branch, assignment, isAssigned, priceOverride, effectivePrice };
  });

  return (
    <>
      <DialogSuccess
        isOpen={successOpen}
        onClose={() => setSuccessOpen(false)}
        title="Cambio guardado"
        description={successMsg}
      />
      <DialogWarning
        isOpen={warnOpen}
        onClose={() => setWarnOpen(false)}
        title="Error"
        description={warnMsg}
        confirmLabel="Entendido"
        cancelLabel="Cerrar"
        onConfirm={() => setWarnOpen(false)}
      />
      <DialogWarning
        isOpen={confirmGlobalOff}
        onClose={() => setConfirmGlobalOff(false)}
        title="Cambiar a específico por sucursal"
        description="El producto dejará de estar disponible en sucursales donde no esté asignado explícitamente. Las asignaciones existentes se mantienen."
        confirmLabel="Continuar"
        cancelLabel="Cancelar"
        onConfirm={async () => {
          setConfirmGlobalOff(false);
          await applyGlobalToggle(false);
        }}
      />
      <DialogWarning
        isOpen={!!confirmUnassign}
        onClose={() => setConfirmUnassign(null)}
        title={`Excluir de ${confirmUnassign?.branchName ?? "la sucursal"}`}
        description="El producto dejará de estar disponible en esta sucursal. Podés volver a asignarlo cuando quieras."
        confirmLabel="Sí, excluir"
        cancelLabel="Cancelar"
        onConfirm={async () => {
          if (confirmUnassign) await confirmUnassignBranch(confirmUnassign.branchId);
        }}
      />

      <div className="flex flex-col gap-6 pb-6">
        {/* Global toggle card */}
        <Card.Root className="border border-border-subtle" style={glassStyle}>
          <Card.Content className="flex items-center justify-between gap-4 py-4">
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-medium" style={{ color: "var(--nuba-fg)" }}>
                Producto global
              </span>
              <span className="text-xs" style={{ color: "var(--nuba-fg-muted)" }}>
                {isGlobal
                  ? "Disponible en todas las sucursales"
                  : "Asignado a sucursales específicas"}
              </span>
            </div>
            <div className={toggling ? "pointer-events-none opacity-50" : undefined}>
              <SwitchRoot
                isSelected={isGlobal}
                onChange={(v) => void handleGlobalToggle(v)}
              >
                <SwitchControl>
                  <SwitchThumb />
                </SwitchControl>
              </SwitchRoot>
            </div>
          </Card.Content>
        </Card.Root>

        {/* Branch rows */}
        <Card.Root className="border border-border-subtle" style={glassStyle}>
          <Card.Header>
            <Card.Title>Sucursales</Card.Title>
            {isGlobal ? (
              <Card.Description>
                El producto está disponible en todas las sucursales. Podés configurar un precio diferente o excluirlo de alguna.
              </Card.Description>
            ) : (
              <Card.Description>
                Activá las sucursales donde querés que esté disponible este producto.
              </Card.Description>
            )}
          </Card.Header>
          <Card.Content className="flex flex-col">
            {branchRows.length === 0 ? (
              <p className="py-4 text-sm" style={{ color: "var(--nuba-fg-muted)" }}>
                No hay sucursales activas en el tenant.
              </p>
            ) : (
              branchRows.map(({ branch, isAssigned, priceOverride, effectivePrice }, idx) => {
                const isSaving = savingBranch === branch.id;
                const isLast = idx === branchRows.length - 1;

                return (
                  <div
                    key={branch.id}
                    className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:gap-4"
                    style={{
                      opacity: !isAssigned ? 0.5 : 1,
                      borderBottom: !isLast ? "1px solid var(--nuba-border-subtle)" : undefined,
                    }}
                  >
                    {/* Branch info */}
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="text-sm font-medium" style={{ color: "var(--nuba-fg)" }}>
                        {branch.name}
                      </span>
                      {branch.city ? (
                        <span className="text-xs" style={{ color: "var(--nuba-fg-muted)" }}>
                          {branch.city}
                        </span>
                      ) : null}
                      {isGlobal ? (
                        <span
                          className="w-fit rounded-full px-2 py-0.5 text-xs font-medium"
                          style={{
                            background: "var(--nuba-accent-soft)",
                            color: "var(--nuba-accent)",
                          }}
                        >
                          Global
                        </span>
                      ) : null}
                    </div>

                    {/* Price override input */}
                    {isAssigned ? (
                      <div className="flex flex-col gap-1">
                        <label className="text-xs" style={{ color: "var(--nuba-fg-muted)" }}>
                          Precio en esta sucursal
                        </label>
                        <div className="flex items-center gap-1">
                          <span className="text-sm" style={{ color: "var(--nuba-fg-muted)" }}>$</span>
                          <input
                            type="number"
                            inputMode="decimal"
                            step="0.01"
                            min="0"
                            placeholder={`Base: $${fmt(basePrice)}`}
                            className="w-36 rounded-lg border px-2 py-1.5 text-sm focus:outline-none"
                            style={{
                              background: "var(--nuba-raised)",
                              borderColor: "var(--nuba-border-default)",
                              color: "var(--nuba-fg)",
                            }}
                            value={priceOverride}
                            onChange={(e) =>
                              setPriceInputs((p) => ({ ...p, [branch.id]: e.target.value }))
                            }
                            onBlur={() => void handlePriceBlur(branch.id)}
                            disabled={isSaving}
                          />
                        </div>
                        <span className="text-xs" style={{ color: "var(--nuba-fg-muted)" }}>
                          Precio efectivo: ${fmt(effectivePrice)}
                        </span>
                      </div>
                    ) : null}

                    {/* Actions */}
                    <div className="flex shrink-0 items-center gap-2">
                      {isGlobal && isAssigned ? (
                        <button
                          type="button"
                          title="Excluir de esta sucursal"
                          className="rounded p-1.5 transition-colors hover:bg-raised"
                          style={{ color: "var(--nuba-fg-muted)" }}
                          disabled={isSaving}
                          onClick={() => void handleToggleBranch(branch.id, false)}
                        >
                          <EyeOff className="size-4" />
                        </button>
                      ) : !isGlobal ? (
                        <SwitchRoot
                          isSelected={isAssigned}
                          isDisabled={isSaving}
                          onChange={(v) => void handleToggleBranch(branch.id, v)}
                        >
                          <SwitchControl>
                            <SwitchThumb />
                          </SwitchControl>
                        </SwitchRoot>
                      ) : null}
                    </div>
                  </div>
                );
              })
            )}
          </Card.Content>
        </Card.Root>
      </div>
    </>
  );
}
